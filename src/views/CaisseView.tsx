import React, {useEffect, useMemo, useState} from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  Printer,
  Search,
} from 'lucide-react';
import {PaymentMatrix} from '../components/PaymentMatrix';
import type {TranslationKey} from '../i18n';
import type {BillingMode, DB, Patient, Rdv} from '../types';
import {
  currentMonthYYYYMM,
  formatCurrency,
  formatDateShort,
  normalizeSearch,
  patientFinancials,
  rdvPaidTotal,
  sortPatientsByName,
} from '../utils';

interface CaisseViewProps {
  db: DB;
  onOpenPatient: (patient: Patient) => void;
  onOpenRdv: (rdv: Rdv) => void;
  onPrintStatement: (patientId: string) => void;
  onQuickMarkRdvsPaid: (rdvIds: string[], toastMsg: string) => void;
  t: (key: TranslationKey) => string;
}

type CaisseSubView = 'matrix' | 'ledger';
type LedgerStatusFilter = 'all' | 'unpaid' | 'paid';

interface GroupedMonthlyPatient {
  patient: Patient;
  billingMode: BillingMode;
  sessions: Rdv[];
  billed: number;
  paid: number;
  remaining: number;
  unpaidIds: string[];
}

const LEDGER_PAGE_SIZE = 20;
const BALANCES_PAGE_SIZE = 15;

export const CaisseView: React.FC<CaisseViewProps> = ({
  db,
  onOpenPatient,
  onOpenRdv,
  onPrintStatement,
  onQuickMarkRdvsPaid,
  t,
}) => {
  const lang = db.lang;
  const [subView, setSubView] = useState<CaisseSubView>('matrix');
  const [month, setMonth] = useState(currentMonthYYYYMM());
  const [ledgerQuery, setLedgerQuery] = useState('');
  const [ledgerStatus, setLedgerStatus] = useState<LedgerStatusFilter>('all');
  const [ledgerBilling, setLedgerBilling] = useState<'all' | BillingMode>('all');
  const [expandedPids, setExpandedPids] = useState<Set<string>>(() => new Set());
  const [ledgerPage, setLedgerPage] = useState(1);
  const [balancesPage, setBalancesPage] = useState(1);

  const patientMap = useMemo(() => new Map(db.patients.map((p) => [p.id, p])), [db.patients]);

  const doneSessions = useMemo(() => {
    return db.rdv
      .filter((r) => r.statut === 'fait' && r.date.startsWith(month))
      .sort((a, b) => `${b.date} ${b.heure}`.localeCompare(`${a.date} ${a.heure}`));
  }, [db.rdv, month]);

  // Group monthly done sessions by patient so the ledger stays compact (1 row per patient)
  const groupedMonthlyPatients = useMemo<GroupedMonthlyPatient[]>(() => {
    const map = new Map<string, Rdv[]>();
    for (const r of doneSessions) {
      const list = map.get(r.pid) ?? [];
      list.push(r);
      map.set(r.pid, list);
    }

    const q = normalizeSearch(ledgerQuery);
    const groups: GroupedMonthlyPatient[] = [];
    for (const [pid, sessions] of map.entries()) {
      const patient = patientMap.get(pid);
      if (!patient) continue;
      const billingMode: BillingMode = patient.billingMode === 'session' ? 'session' : 'monthly';
      if (ledgerBilling !== 'all' && billingMode !== ledgerBilling) continue;

      let billed = 0;
      let paid = 0;
      const unpaidIds: string[] = [];
      for (const s of sessions) {
        const p = rdvPaidTotal(s);
        billed += s.tarif;
        paid += p;
        if (p < s.tarif) unpaidIds.push(s.id);
      }
      const remaining = billed - paid;

      if (ledgerStatus === 'unpaid' && remaining <= 0) continue;
      if (ledgerStatus === 'paid' && remaining > 0) continue;

      if (q) {
        const hay = normalizeSearch(`${patient.nom} ${patient.tel} ${patient.parent}`);
        if (!hay.includes(q)) continue;
      }

      groups.push({patient, billingMode, sessions, billed, paid, remaining, unpaidIds});
    }

    groups.sort((a, b) => {
      if (b.remaining !== a.remaining) return b.remaining - a.remaining;
      return a.patient.nom.localeCompare(b.patient.nom, lang === 'ar' ? 'ar-DZ' : 'fr-FR', {
        sensitivity: 'base',
      });
    });
    return groups;
  }, [doneSessions, patientMap, ledgerQuery, ledgerStatus, ledgerBilling, lang]);

  const totals = useMemo(() => {
    let billed = 0;
    let paid = 0;
    for (const g of groupedMonthlyPatients) {
      billed += g.billed;
      paid += g.paid;
    }
    return {billed, paid, owed: billed - paid};
  }, [groupedMonthlyPatients]);

  const ledgerTotalPages = Math.max(1, Math.ceil(groupedMonthlyPatients.length / LEDGER_PAGE_SIZE));
  const safeLedgerPage = Math.min(ledgerPage, ledgerTotalPages);
  const pagedMonthlyPatients = useMemo(() => {
    const start = (safeLedgerPage - 1) * LEDGER_PAGE_SIZE;
    return groupedMonthlyPatients.slice(start, start + LEDGER_PAGE_SIZE);
  }, [groupedMonthlyPatients, safeLedgerPage]);

  useEffect(() => {
    setLedgerPage(1);
  }, [month, ledgerQuery, ledgerStatus, ledgerBilling]);

  const patientBalances = useMemo(() => {
    const q = normalizeSearch(ledgerQuery);
    const list: {patient: Patient; balance: number; unpaidIds: string[]}[] = [];
    for (const p of sortPatientsByName(db.patients, lang)) {
      if (ledgerBilling !== 'all') {
        const mode: BillingMode = p.billingMode === 'session' ? 'session' : 'monthly';
        if (mode !== ledgerBilling) continue;
      }
      if (q) {
        const hay = normalizeSearch(`${p.nom} ${p.tel} ${p.parent}`);
        if (!hay.includes(q)) continue;
      }
      const fin = patientFinancials(db, p.id);
      if (fin.balance !== 0) {
        const unpaidIds = db.rdv
          .filter((r) => r.pid === p.id && r.statut === 'fait' && rdvPaidTotal(r) < r.tarif)
          .map((r) => r.id);
        list.push({patient: p, balance: fin.balance, unpaidIds});
      }
    }
    list.sort((a, b) => b.balance - a.balance);
    return list;
  }, [db, lang, ledgerQuery, ledgerBilling]);

  const balancesTotalPages = Math.max(1, Math.ceil(patientBalances.length / BALANCES_PAGE_SIZE));
  const safeBalancesPage = Math.min(balancesPage, balancesTotalPages);
  const pagedBalances = useMemo(() => {
    const start = (safeBalancesPage - 1) * BALANCES_PAGE_SIZE;
    return patientBalances.slice(start, start + BALANCES_PAGE_SIZE);
  }, [patientBalances, safeBalancesPage]);

  const toggleExpand = (pid: string) => {
    setExpandedPids((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      {/* Caisse Header + Segmented View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">{t('navCaisse')}</h1>

        <div className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label={t('navCaisse')}
            className="inline-flex items-center rounded-lg bg-slate-200/75 dark:bg-slate-800 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={subView === 'matrix'}
              onClick={() => setSubView('matrix')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                subView === 'matrix'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              <span>{t('caisseTabMatrix')}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subView === 'ledger'}
              onClick={() => setSubView('ledger')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                subView === 'ledger'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <List className="h-4 w-4" />
              <span>{t('caisseTabLedger')}</span>
            </button>
          </div>
        </div>
      </div>

      {subView === 'matrix' ? (
        <PaymentMatrix
          db={db}
          month={month}
          onChangeMonth={setMonth}
          onOpenPatient={onOpenPatient}
          onOpenRdv={onOpenRdv}
          onPrintStatement={onPrintStatement}
          onQuickMarkRdvsPaid={onQuickMarkRdvsPaid}
          t={t}
        />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold">{t('ledgerPatientSummaryTitle')}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px]">
                <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="search"
                  value={ledgerQuery}
                  onChange={(e) => setLedgerQuery(e.target.value)}
                  placeholder={t('searchPatientsPlaceholder')}
                  className="w-full min-h-10 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ps-9 pe-3 py-1.5 text-xs sm:text-sm"
                />
              </div>

              <div className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
                {(['all', 'unpaid', 'paid'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setLedgerStatus(st)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                      ledgerStatus === st
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {st === 'all'
                      ? t('matrixFilterAll')
                      : st === 'unpaid'
                        ? t('matrixFilterUnpaid')
                        : t('matrixFilterPaid')}
                  </button>
                ))}
              </div>

              <select
                aria-label={t('billingModeLabel')}
                value={ledgerBilling}
                onChange={(e) => setLedgerBilling(e.target.value as 'all' | BillingMode)}
                className="min-h-10 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium"
              >
                <option value="all">{t('billingAllModes')}</option>
                <option value="monthly">{t('billingMonthlyShort')}</option>
                <option value="session">{t('billingSessionShort')}</option>
              </select>

              <div className="flex items-center gap-2">
                <label htmlFor="caisse-month" className="text-sm font-medium">
                  {t('monthLabel')}
                </label>
                <input
                  id="caisse-month"
                  type="month"
                  value={month}
                  onChange={(e) => e.target.value && setMonth(e.target.value)}
                  className="min-h-10 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* Grouped Patient Monthly Table (compact, expandable per patient) */}
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            {groupedMonthlyPatients.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                {t('noDoneSessionsMonth')}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        <th className="px-4 py-3 text-start">{t('colPatient')}</th>
                        <th className="px-4 py-3 text-end">{t('colTariff')}</th>
                        <th className="px-4 py-3 text-end">{t('colPaid')}</th>
                        <th className="px-4 py-3 text-end">{t('colRemaining')}</th>
                        <th className="px-4 py-3 text-end">{t('colActions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {pagedMonthlyPatients.map((g) => {
                        const expanded = expandedPids.has(g.patient.id);
                        const cadenceLabel =
                          g.billingMode === 'session'
                            ? t('billingSessionShort')
                            : t('billingMonthlyShort');
                        const countWord =
                          g.sessions.length > 1 ? t('sessionsCount') : t('sessionSingular');

                        return (
                          <React.Fragment key={g.patient.id}>
                            <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => onOpenPatient(g.patient)}
                                  className="text-start"
                                >
                                  <div className="font-semibold hover:underline">
                                    {g.patient.nom}
                                  </div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                                    {cadenceLabel} · {g.sessions.length} {countWord}
                                  </div>
                                </button>
                              </td>
                              <td className="px-4 py-3 text-end tabular-nums whitespace-nowrap">
                                {formatCurrency(g.billed, lang)}
                              </td>
                              <td className="px-4 py-3 text-end tabular-nums whitespace-nowrap text-emerald-700 dark:text-emerald-400 font-medium">
                                {formatCurrency(g.paid, lang)}
                              </td>
                              <td className="px-4 py-3 text-end tabular-nums whitespace-nowrap">
                                {g.remaining > 0 ? (
                                  <span className="font-semibold text-rose-700 dark:text-rose-400">
                                    {formatCurrency(g.remaining, lang)}
                                  </span>
                                ) : g.remaining < 0 ? (
                                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                    {t('creditLabel')} {formatCurrency(Math.abs(g.remaining), lang)}
                                  </span>
                                ) : (
                                  <span className="text-slate-500 dark:text-slate-400">
                                    {formatCurrency(0, lang)}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-end whitespace-nowrap">
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  {g.unpaidIds.length > 0 && g.remaining > 0 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onQuickMarkRdvsPaid(g.unpaidIds, t('matrixSettledToast'))
                                      }
                                      className="inline-flex min-h-8 items-center gap-1 rounded-md accent-bg px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                      <span>{t('matrixSettleAllBtn')}</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => toggleExpand(g.patient.id)}
                                    aria-expanded={expanded}
                                    className="inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                                  >
                                    <span>
                                      {expanded ? t('ledgerHideSessions') : t('ledgerShowSessions')}
                                    </span>
                                    {expanded ? (
                                      <ChevronUp className="h-3.5 w-3.5" />
                                    ) : (
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onPrintStatement(g.patient.id)}
                                    title={t('printStatementBtn')}
                                    aria-label={`${t('printStatementBtn')} — ${g.patient.nom}`}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                                  >
                                    <Printer className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {expanded &&
                              g.sessions.map((r) => {
                                const paid = rdvPaidTotal(r);
                                const rem = r.tarif - paid;
                                return (
                                  <tr
                                    key={r.id}
                                    onClick={() => onOpenRdv(r)}
                                    className="cursor-pointer bg-slate-50/70 dark:bg-slate-950/40 hover:bg-slate-100/70 dark:hover:bg-slate-800/50 text-xs"
                                  >
                                    <td className="ps-8 pe-4 py-2 tabular-nums text-slate-600 dark:text-slate-300">
                                      {formatDateShort(r.date, lang)} · {r.heure}
                                    </td>
                                    <td className="px-4 py-2 text-end tabular-nums text-slate-600 dark:text-slate-300">
                                      {formatCurrency(r.tarif, lang)}
                                    </td>
                                    <td className="px-4 py-2 text-end tabular-nums text-emerald-700 dark:text-emerald-400">
                                      {formatCurrency(paid, lang)}
                                    </td>
                                    <td className="px-4 py-2 text-end tabular-nums">
                                      {rem > 0 ? (
                                        <span className="font-semibold text-rose-700 dark:text-rose-400">
                                          {formatCurrency(rem, lang)}
                                        </span>
                                      ) : (
                                        formatCurrency(0, lang)
                                      )}
                                    </td>
                                    <td className="px-4 py-2 text-end">
                                      {rem > 0 && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onQuickMarkRdvsPaid([r.id], t('matrixSessionPaidToast'));
                                          }}
                                          className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-0.5 text-[11px] font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                                        >
                                          <Check className="h-3 w-3" />
                                          <span>{t('matrixQuickPayBtn')}</span>
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 font-bold">
                        <td className="px-4 py-3">
                          {t('totalsLabel')} ({groupedMonthlyPatients.length})
                        </td>
                        <td className="px-4 py-3 text-end tabular-nums">
                          {formatCurrency(totals.billed, lang)}
                        </td>
                        <td className="px-4 py-3 text-end tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatCurrency(totals.paid, lang)}
                        </td>
                        <td className="px-4 py-3 text-end tabular-nums">
                          {totals.owed < 0
                            ? `${t('creditLabel')} ${formatCurrency(Math.abs(totals.owed), lang)}`
                            : formatCurrency(totals.owed, lang)}
                        </td>
                        <td className="px-4 py-3" />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {ledgerTotalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                    <span className="tabular-nums">
                      {t('ledgerPageLabel')} {safeLedgerPage} / {ledgerTotalPages}
                    </span>
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={safeLedgerPage <= 1}
                        onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
                        className="min-h-8 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                      >
                        {t('ledgerPrevPage')}
                      </button>
                      <button
                        type="button"
                        disabled={safeLedgerPage >= ledgerTotalPages}
                        onClick={() => setLedgerPage((p) => Math.min(ledgerTotalPages, p + 1))}
                        className="min-h-8 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                      >
                        {t('ledgerNextPage')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Outstanding balances per patient (all-time) */}
          <section className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-bold">{t('outstandingBalancesTitle')}</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {patientBalances.length}
              </span>
            </div>

            {patientBalances.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                {t('noOutstandingBalances')}
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {pagedBalances.map(({patient, balance, unpaidIds}) => (
                    <div
                      key={patient.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenPatient(patient)}
                        className="text-start flex-1 min-w-[180px]"
                      >
                        <div className="text-sm font-semibold hover:underline">{patient.nom}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          {patient.billingMode === 'session'
                            ? t('billingSessionShort')
                            : t('billingMonthlyShort')}
                          {patient.tel ? ` · ${patient.tel}` : ''}
                        </div>
                      </button>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <span
                          className={`text-sm font-bold tabular-nums ${
                            balance > 0
                              ? 'text-rose-700 dark:text-rose-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {balance > 0
                            ? formatCurrency(balance, lang)
                            : `${t('creditLabel')} ${formatCurrency(Math.abs(balance), lang)}`}
                        </span>
                        {balance > 0 && unpaidIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => onQuickMarkRdvsPaid(unpaidIds, t('matrixSettledToast'))}
                            className="inline-flex min-h-9 items-center gap-1 rounded-lg accent-bg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>{t('matrixSettleAllBtn')}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onPrintStatement(patient.id)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          <span>{t('printStatementBtn')}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {balancesTotalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                    <span className="tabular-nums">
                      {t('ledgerPageLabel')} {safeBalancesPage} / {balancesTotalPages}
                    </span>
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={safeBalancesPage <= 1}
                        onClick={() => setBalancesPage((p) => Math.max(1, p - 1))}
                        className="min-h-8 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                      >
                        {t('ledgerPrevPage')}
                      </button>
                      <button
                        type="button"
                        disabled={safeBalancesPage >= balancesTotalPages}
                        onClick={() => setBalancesPage((p) => Math.min(balancesTotalPages, p + 1))}
                        className="min-h-8 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                      >
                        {t('ledgerNextPage')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
