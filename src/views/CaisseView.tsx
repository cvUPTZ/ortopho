import React, {useMemo, useState} from 'react';
import {Printer} from 'lucide-react';
import type {TranslationKey} from '../i18n';
import type {DB, Patient, Rdv} from '../types';
import {
  currentMonthYYYYMM,
  formatCurrency,
  formatDateShort,
  getPatientName,
  patientFinancials,
  rdvPaidTotal,
  sortPatientsByName,
} from '../utils';

interface CaisseViewProps {
  db: DB;
  onOpenPatient: (patient: Patient) => void;
  onOpenRdv: (rdv: Rdv) => void;
  onPrintStatement: (patientId: string) => void;
  t: (key: TranslationKey) => string;
}

export const CaisseView: React.FC<CaisseViewProps> = ({
  db,
  onOpenPatient,
  onOpenRdv,
  onPrintStatement,
  t,
}) => {
  const lang = db.lang;
  const [month, setMonth] = useState(currentMonthYYYYMM());

  const doneSessions = useMemo(() => {
    return db.rdv
      .filter((r) => r.statut === 'fait' && r.date.startsWith(month))
      .sort((a, b) => `${b.date} ${b.heure}`.localeCompare(`${a.date} ${a.heure}`));
  }, [db.rdv, month]);

  const totals = useMemo(() => {
    let billed = 0;
    let paid = 0;
    for (const r of doneSessions) {
      billed += r.tarif;
      paid += rdvPaidTotal(r);
    }
    return {billed, paid, owed: billed - paid};
  }, [doneSessions]);

  const patientBalances = useMemo(() => {
    const list: {patient: Patient; balance: number}[] = [];
    for (const p of sortPatientsByName(db.patients, lang)) {
      const fin = patientFinancials(db, p.id);
      if (fin.balance !== 0) {
        list.push({patient: p, balance: fin.balance});
      }
    }
    // Outstanding owed (>0) first, then credits (<0)
    list.sort((a, b) => b.balance - a.balance);
    return list;
  }, [db, lang]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">{t('sessionsDoneMonth')}</h1>
        <div className="flex items-center gap-2">
          <label htmlFor="caisse-month" className="text-sm font-medium">
            {t('monthLabel')}
          </label>
          <input
            id="caisse-month"
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="min-h-11 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm tabular-nums"
          />
        </div>
      </div>

      {/* Month table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {doneSessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {t('noDoneSessionsMonth')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3 text-start">{t('colDate')}</th>
                  <th className="px-4 py-3 text-start">{t('colPatient')}</th>
                  <th className="px-4 py-3 text-end">{t('colTariff')}</th>
                  <th className="px-4 py-3 text-end">{t('colPaid')}</th>
                  <th className="px-4 py-3 text-end">{t('colRemaining')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {doneSessions.map((r) => {
                  const paid = rdvPaidTotal(r);
                  const rem = r.tarif - paid;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => onOpenRdv(r)}
                      className="cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">
                        {formatDateShort(r.date, lang)} {r.heure}
                      </td>
                      <td className="px-4 py-2.5 font-medium">{getPatientName(db, r.pid)}</td>
                      <td className="px-4 py-2.5 text-end tabular-nums whitespace-nowrap">
                        {formatCurrency(r.tarif, lang)}
                      </td>
                      <td className="px-4 py-2.5 text-end tabular-nums whitespace-nowrap">
                        {formatCurrency(paid, lang)}
                      </td>
                      <td className="px-4 py-2.5 text-end tabular-nums whitespace-nowrap">
                        {rem > 0 ? (
                          <span className="font-semibold text-amber-700 dark:text-amber-400">
                            {formatCurrency(rem, lang)}
                          </span>
                        ) : rem < 0 ? (
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                            {t('creditLabel')} {formatCurrency(Math.abs(rem), lang)}
                          </span>
                        ) : (
                          formatCurrency(0, lang)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 font-bold">
                  <td colSpan={2} className="px-4 py-3">
                    {t('totalsLabel')}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {formatCurrency(totals.billed, lang)}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {formatCurrency(totals.paid, lang)}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {totals.owed < 0
                      ? `${t('creditLabel')} ${formatCurrency(Math.abs(totals.owed), lang)}`
                      : formatCurrency(totals.owed, lang)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Outstanding balances per patient */}
      <section className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3">
          <h2 className="text-base font-bold">{t('outstandingBalancesTitle')}</h2>
        </div>

        {patientBalances.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {t('noOutstandingBalances')}
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {patientBalances.map(({patient, balance}) => (
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
                  {patient.tel && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {patient.tel}
                    </div>
                  )}
                </button>

                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      balance > 0
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {balance > 0
                      ? formatCurrency(balance, lang)
                      : `${t('creditLabel')} ${formatCurrency(Math.abs(balance), lang)}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => onPrintStatement(patient.id)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>{t('printStatementBtn')}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
