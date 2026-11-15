import React, {useEffect, useMemo, useState} from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Minus,
  Printer,
  RotateCcw,
  Search,
} from 'lucide-react';
import type {TranslationKey} from '../i18n';
import type {BillingMode, DB, Patient, Rdv} from '../types';
import {
  formatCurrency,
  formatDateShort,
  formatMonthShort,
  getDomainById,
  getStaffDomain,
  getStaffName,
  normalizeSearch,
  rdvBilledAmount,
  rdvPaidTotal,
  sortPatientsByName,
} from '../utils';

export type MatrixMode = 'annual' | 'sessions';
export type MatrixStatusFilter = 'all' | 'unpaid' | 'paid';
export type BillingModeFilter = 'all' | BillingMode;

type CellTone = 'paid' | 'partial' | 'unpaid' | 'planned' | 'absent' | 'credit';

interface PaymentMatrixProps {
  db: DB;
  month: string;
  onChangeMonth: (yyyyMm: string) => void;
  onOpenPatient: (patient: Patient) => void;
  onOpenRdv: (rdv: Rdv) => void;
  onPrintStatement: (patientId: string) => void;
  onQuickMarkRdvsPaid: (rdvIds: string[], toastMsg: string) => void;
  onOpenVersement: (patient: Patient, scopeLabel: string, rdvIds: string[]) => void;
  t: (key: TranslationKey) => string;
}

interface MonthAggregate {
  ym: string;
  billed: number;
  plannedTarif: number;
  paid: number;
  remaining: number;
  doneCount: number;
  plannedCount: number;
  absentCount: number;
  totalCount: number;
  versementCount: number;
  lastVersementDate: string;
  sessionIds: string[];
  unpaidSessionIds: string[];
  tone: CellTone | 'empty';
}

interface PatientMatrixRow {
  patient: Patient;
  billingMode: BillingMode;
  subtitle: string;
  sessions: Rdv[];
  sessionIds: string[];
  months: MonthAggregate[];
  billed: number;
  paid: number;
  remaining: number;
  versementCount: number;
  lastVersementDate: string;
  unpaidSessionIds: string[];
  rowTone: CellTone;
}

const PAGE_SIZE = 25;

function getSessionTone(r: Rdv): CellTone {
  const paid = rdvPaidTotal(r);
  if (r.statut === 'fait') {
    if (paid > r.tarif) return 'credit';
    if (paid >= r.tarif) return 'paid';
    if (paid > 0) return 'partial';
    return 'unpaid';
  }
  if (r.statut === 'prevu') {
    if (paid > 0 && paid >= r.tarif) return 'paid';
    if (paid > 0) return 'partial';
    return 'planned';
  }
  if (paid > 0) return 'credit';
  return 'absent';
}

function getToneClasses(tone: CellTone): string {
  switch (tone) {
    case 'paid':
      return 'border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200';
    case 'credit':
      return 'border-teal-200 dark:border-teal-900/70 bg-teal-50/80 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200';
    case 'partial':
      return 'border-amber-200 dark:border-amber-900/70 bg-amber-50/85 dark:bg-amber-950/35 text-amber-900 dark:text-amber-200';
    case 'unpaid':
      return 'border-rose-200 dark:border-rose-900/70 bg-rose-50/85 dark:bg-rose-950/35 text-rose-900 dark:text-rose-200';
    case 'planned':
      return 'border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300';
    case 'absent':
      return 'border-slate-200/70 dark:border-slate-800/70 bg-slate-50/40 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500';
  }
}

function ToneIcon({tone, className = 'h-3.5 w-3.5 shrink-0'}: {tone: CellTone; className?: string}) {
  switch (tone) {
    case 'paid':
    case 'credit':
      return <CheckCircle2 className={`${className} text-emerald-600 dark:text-emerald-400`} />;
    case 'partial':
      return <Clock className={`${className} text-amber-600 dark:text-amber-400`} />;
    case 'unpaid':
      return <AlertCircle className={`${className} text-rose-600 dark:text-rose-400`} />;
    case 'planned':
      return <Calendar className={`${className} text-slate-500 dark:text-slate-400`} />;
    case 'absent':
      return <Minus className={`${className} text-slate-400 dark:text-slate-500`} />;
  }
}

function formatDayMonthNumeric(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;
}

export const PaymentMatrix: React.FC<PaymentMatrixProps> = ({
  db,
  month,
  onChangeMonth,
  onOpenPatient,
  onOpenRdv,
  onPrintStatement,
  onQuickMarkRdvsPaid,
  onOpenVersement,
  t,
}) => {
  const lang = db.lang;
  // Default is Monthly ('annual': Patients x Months), since patients pay monthly by default
  const [mode, setMode] = useState<MatrixMode>('annual');
  const [year, setYear] = useState<number>(() => {
    const parsed = Number(month.slice(0, 4));
    return Number.isFinite(parsed) && parsed > 2000 ? parsed : new Date().getFullYear();
  });
  const [statusFilter, setStatusFilter] = useState<MatrixStatusFilter>('all');
  const [billingFilter, setBillingFilter] = useState<BillingModeFilter>('all');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [query, setQuery] = useState<string>('');
  const [includePlanned, setIncludePlanned] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);

  const staffMap = useMemo(() => new Map(db.staff.map((s) => [s.id, s])), [db.staff]);

  const monthKeys = useMemo(() => {
    return Array.from({length: 12}, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  }, [year]);

  const resolveDomainId = (r: Rdv): string => {
    if (r.domainId && getDomainById(db.domains, r.domainId)) return r.domainId;
    const st = staffMap.get(r.th);
    return getStaffDomain(db.domains, st)?.id ?? '';
  };

  const getToneLabel = (tone: CellTone): string => {
    switch (tone) {
      case 'paid':
        return t('matrixStatusPaid');
      case 'partial':
        return t('matrixStatusPartial');
      case 'unpaid':
        return t('matrixStatusUnpaid');
      case 'planned':
        return t('matrixStatusPlanned');
      case 'absent':
        return t('matrixStatusAbsent');
      case 'credit':
        return t('matrixStatusCredit');
    }
  };

  // Build full matrix rows for the current mode, domain filter, billing filter, and planned toggle
  const allRows = useMemo<PatientMatrixRow[]>(() => {
    const periodPrefix = mode === 'sessions' ? month : `${year}-`;
    const rdvsByPatient = new Map<string, Rdv[]>();

    for (const r of db.rdv) {
      if (!r.date.startsWith(periodPrefix)) continue;
      if (domainFilter !== 'all' && resolveDomainId(r) !== domainFilter) continue;
      if (!includePlanned && r.statut === 'prevu' && rdvPaidTotal(r) === 0) continue;
      const list = rdvsByPatient.get(r.pid) ?? [];
      list.push(r);
      rdvsByPatient.set(r.pid, list);
    }

    const sortedPatients = sortPatientsByName(db.patients, lang);
    const rows: PatientMatrixRow[] = [];

    for (const patient of sortedPatients) {
      const billingMode: BillingMode = patient.billingMode === 'session' ? 'session' : 'monthly';
      if (billingFilter !== 'all' && billingMode !== billingFilter) continue;

      const sessions = (rdvsByPatient.get(patient.id) ?? []).sort((a, b) =>
        `${a.date} ${a.heure}`.localeCompare(`${b.date} ${b.heure}`),
      );
      if (sessions.length === 0) continue;

      let billed = 0;
      let plannedTarifRow = 0;
      let paid = 0;
      let versementCount = 0;
      let lastVersementDate = '';
      const unpaidSessionIds: string[] = [];

      for (const s of sessions) {
        const b = rdvBilledAmount(s);
        const p = rdvPaidTotal(s);
        billed += b;
        if (s.statut === 'prevu') plannedTarifRow += s.tarif;
        paid += p;
        versementCount += s.pay.length;
        for (const entry of s.pay) {
          if (entry.d > lastVersementDate) lastVersementDate = entry.d;
        }
        if (s.statut === 'fait' && p < s.tarif) {
          unpaidSessionIds.push(s.id);
        }
      }
      const remaining = billed - paid;

      let rowTone: CellTone = 'planned';
      if (billed > 0) {
        if (remaining > 0 && paid > 0) rowTone = 'partial';
        else if (remaining > 0) rowTone = 'unpaid';
        else if (remaining < 0) rowTone = 'credit';
        else rowTone = 'paid';
      } else if (paid > 0) {
        if (plannedTarifRow > 0) {
          if (paid > plannedTarifRow) rowTone = 'credit';
          else if (paid === plannedTarifRow) rowTone = 'paid';
          else rowTone = 'partial';
        } else {
          rowTone = 'credit';
        }
      } else if (sessions.every((s) => s.statut === 'absent')) {
        rowTone = 'absent';
      }

      const months: MonthAggregate[] =
        mode === 'annual'
          ? monthKeys.map((ym) => {
              const mSessions = sessions.filter((s) => s.date.startsWith(ym));
              if (mSessions.length === 0) {
                return {
                  ym,
                  billed: 0,
                  plannedTarif: 0,
                  paid: 0,
                  remaining: 0,
                  doneCount: 0,
                  plannedCount: 0,
                  absentCount: 0,
                  totalCount: 0,
                  versementCount: 0,
                  lastVersementDate: '',
                  sessionIds: [],
                  unpaidSessionIds: [],
                  tone: 'empty',
                };
              }
              let mBilled = 0;
              let mPlannedTarif = 0;
              let mPaid = 0;
              let doneCount = 0;
              let plannedCount = 0;
              let absentCount = 0;
              let mVersementCount = 0;
              let mLastVersDate = '';
              const mUnpaidIds: string[] = [];
              for (const ms of mSessions) {
                const p = rdvPaidTotal(ms);
                mBilled += rdvBilledAmount(ms);
                mPaid += p;
                mVersementCount += ms.pay.length;
                for (const entry of ms.pay) {
                  if (entry.d > mLastVersDate) mLastVersDate = entry.d;
                }
                if (ms.statut === 'fait') {
                  doneCount++;
                  if (p < ms.tarif) mUnpaidIds.push(ms.id);
                } else if (ms.statut === 'prevu') {
                  plannedCount++;
                  mPlannedTarif += ms.tarif;
                } else {
                  absentCount++;
                }
              }
              const mRem = mBilled - mPaid;
              let tone: CellTone = 'planned';
              if (mBilled > 0) {
                if (mRem > 0 && mPaid > 0) tone = 'partial';
                else if (mRem > 0) tone = 'unpaid';
                else if (mRem < 0) tone = 'credit';
                else tone = 'paid';
              } else if (mPaid > 0) {
                if (mPlannedTarif > 0) {
                  if (mPaid > mPlannedTarif) tone = 'credit';
                  else if (mPaid === mPlannedTarif) tone = 'paid';
                  else tone = 'partial';
                } else {
                  tone = 'credit';
                }
              } else if (plannedCount === 0 && absentCount > 0) {
                tone = 'absent';
              }
              return {
                ym,
                billed: mBilled,
                plannedTarif: mPlannedTarif,
                paid: mPaid,
                remaining: mRem,
                doneCount,
                plannedCount,
                absentCount,
                totalCount: mSessions.length,
                versementCount: mVersementCount,
                lastVersementDate: mLastVersDate,
                sessionIds: mSessions.map((ms) => ms.id),
                unpaidSessionIds: mUnpaidIds,
                tone,
              };
            })
          : [];

      const staffObj = staffMap.get(patient.th);
      const domObj = getStaffDomain(db.domains, staffObj);
      const staffName = getStaffName(db, patient.th);
      const cadenceLabel =
        billingMode === 'session' ? t('billingSessionShort') : t('billingMonthlyShort');
      const subtitleParts = [cadenceLabel, domObj?.name ?? staffName, patient.tel].filter(
        (x): x is string => Boolean(x && x.trim()),
      );

      rows.push({
        patient,
        billingMode,
        subtitle: subtitleParts.slice(0, 3).join(' · '),
        sessions,
        sessionIds: sessions.map((s) => s.id),
        months,
        billed,
        paid,
        remaining,
        versementCount,
        lastVersementDate,
        unpaidSessionIds,
        rowTone,
      });
    }

    const rank = (tone: CellTone): number => {
      switch (tone) {
        case 'unpaid':
          return 0;
        case 'partial':
          return 1;
        case 'planned':
          return 2;
        case 'paid':
          return 3;
        case 'credit':
          return 4;
        case 'absent':
          return 5;
      }
    };
    rows.sort((a, b) => {
      const rDiff = rank(a.rowTone) - rank(b.rowTone);
      if (rDiff !== 0) return rDiff;
      if (b.remaining !== a.remaining) return b.remaining - a.remaining;
      return a.patient.nom.localeCompare(b.patient.nom, lang === 'ar' ? 'ar-DZ' : 'fr-FR', {
        sensitivity: 'base',
      });
    });

    return rows;
  }, [
    db.rdv,
    db.patients,
    db.domains,
    mode,
    month,
    year,
    domainFilter,
    billingFilter,
    includePlanned,
    lang,
    monthKeys,
    staffMap,
    t,
  ]);

  // Apply search + payment status filter
  const visibleRows = useMemo(() => {
    const q = normalizeSearch(query);
    return allRows.filter((row) => {
      if (statusFilter === 'unpaid' && row.remaining <= 0) return false;
      if (statusFilter === 'paid' && !(row.billed > 0 && row.remaining <= 0)) return false;
      if (!q) return true;
      const haystack = normalizeSearch(
        `${row.patient.nom} ${row.patient.tel} ${row.patient.parent} ${row.subtitle}`,
      );
      return haystack.includes(q);
    });
  }, [allRows, statusFilter, query]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [mode, month, year, statusFilter, billingFilter, domainFilter, query, includePlanned]);

  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return visibleRows.slice(start, start + PAGE_SIZE);
  }, [visibleRows, safePage]);

  // KPI metrics
  const summaryStats = useMemo(() => {
    let billed = 0;
    let paid = 0;
    let unpaidPatients = 0;
    let paidPatients = 0;
    for (const r of allRows) {
      billed += r.billed;
      paid += r.paid;
      if (r.remaining > 0) unpaidPatients++;
      else if (r.billed > 0) paidPatients++;
    }
    const remaining = billed - paid;
    const rate = billed > 0 ? Math.min(100, Math.round((paid / billed) * 100)) : 100;
    return {billed, paid, remaining, rate, unpaidPatients, paidPatients};
  }, [allRows]);

  const maxSessionCols = useMemo(() => {
    if (mode !== 'sessions') return 0;
    return Math.max(4, ...pagedRows.map((r) => r.sessions.length));
  }, [mode, pagedRows]);

  // Column totals across all visibleRows (not just current page)
  const columnTotals = useMemo(() => {
    let totalBilled = 0;
    let totalPaid = 0;
    let totalVersements = 0;
    for (const r of visibleRows) {
      totalBilled += r.billed;
      totalPaid += r.paid;
      totalVersements += r.versementCount;
    }
    const totalRemaining = totalBilled - totalPaid;

    if (mode === 'sessions') {
      const cols = Array.from({length: maxSessionCols}, (_, idx) => {
        let colBilled = 0;
        let colPaid = 0;
        for (const r of visibleRows) {
          const s = r.sessions[idx];
          if (!s) continue;
          colBilled += rdvBilledAmount(s);
          colPaid += rdvPaidTotal(s);
        }
        return {billed: colBilled, paid: colPaid};
      });
      return {
        totalBilled,
        totalPaid,
        totalRemaining,
        totalVersements,
        sessionCols: cols,
        monthCols: [],
      };
    }

    const monthCols = monthKeys.map((ym, idx) => {
      let colBilled = 0;
      let colPaid = 0;
      for (const r of visibleRows) {
        const m = r.months[idx];
        if (!m) continue;
        colBilled += m.billed;
        colPaid += m.paid;
      }
      return {ym, billed: colBilled, paid: colPaid};
    });
    return {totalBilled, totalPaid, totalRemaining, totalVersements, sessionCols: [], monthCols};
  }, [visibleRows, mode, maxSessionCols, monthKeys]);

  const handleExportCsv = () => {
    const escapeCsv = (val: string | number) => {
      const s = String(val ?? '');
      if (/[";,\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const sessionColCount =
      mode === 'sessions' ? Math.max(4, ...visibleRows.map((r) => r.sessions.length)) : 0;

    const dynamicHeaders =
      mode === 'sessions'
        ? Array.from({length: sessionColCount}, (_, i) => `${t('matrixColSessionShort')}${i + 1}`)
        : monthKeys.map((ym) => formatMonthShort(ym, lang));

    const headerRow = [
      t('colPatient'),
      t('phoneLabel'),
      t('billingModeLabel'),
      ...dynamicHeaders,
      t('totalBilled'),
      t('totalCollected'),
      t('matrixColVersements'),
      t('versementLastLabel'),
      t('colRemaining'),
      t('matrixColStatus'),
    ];

    const dataRows = visibleRows.map((row) => {
      const cells =
        mode === 'sessions'
          ? Array.from({length: sessionColCount}, (_, idx) => {
              const s = row.sessions[idx];
              if (!s) return '';
              const tone = getSessionTone(s);
              return `${s.date} | ${getToneLabel(tone)} | ${rdvPaidTotal(s)}/${s.tarif}`;
            })
          : row.months.map((m) => {
              if (m.tone === 'empty') return '';
              return `${getToneLabel(m.tone)} | ${m.paid}/${m.billed}`;
            });

      return [
        row.patient.nom,
        row.patient.tel,
        row.billingMode === 'session' ? t('billingSessionShort') : t('billingMonthlyShort'),
        ...cells,
        row.billed,
        row.paid,
        row.versementCount,
        row.lastVersementDate,
        row.remaining,
        getToneLabel(row.rowTone),
      ];
    });

    const csv = [headerRow, ...dataRows]
      .map((line) => line.map(escapeCsv).join(';'))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `matrice-paiements-${mode === 'sessions' ? month : year}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const hasActiveFilters =
    statusFilter !== 'all' ||
    billingFilter !== 'all' ||
    domainFilter !== 'all' ||
    query.trim() !== '';

  return (
    <div className="space-y-4">
      {/* Unified KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-4 py-3.5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('totalBilled')}
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {formatCurrency(summaryStats.billed, lang)}
          </div>
        </div>

        <div className="px-4 py-3.5">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>{t('totalCollected')}</span>
            <span className="tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">
              {summaryStats.rate}%
            </span>
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatCurrency(summaryStats.paid, lang)}
          </div>
        </div>

        <div className="px-4 py-3.5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('colRemaining')}
          </div>
          <div
            className={`mt-1 text-xl font-bold tabular-nums ${
              summaryStats.remaining > 0
                ? 'text-rose-700 dark:text-rose-400'
                : summaryStats.remaining < 0
                  ? 'text-teal-700 dark:text-teal-400'
                  : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {summaryStats.remaining < 0
              ? `${t('creditLabel')} ${formatCurrency(Math.abs(summaryStats.remaining), lang)}`
              : formatCurrency(summaryStats.remaining, lang)}
          </div>
        </div>

        <div className="px-4 py-3.5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('matrixPatientsLabel')}
          </div>
          <div className="mt-1.5 flex items-baseline gap-2 text-sm font-semibold tabular-nums">
            <span className="text-rose-700 dark:text-rose-400">
              {summaryStats.unpaidPatients} {t('matrixPatientsUnpaidShort')}
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
              ·
            </span>
            <span className="text-emerald-700 dark:text-emerald-400">
              {summaryStats.paidPatients} {t('matrixPatientsPaidShort')}
            </span>
          </div>
        </div>
      </div>

      {/* Main Matrix Container */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {/* Matrix Toolbar */}
        <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold tracking-tight">{t('matrixTitle')}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {mode === 'annual' ? t('matrixDrilldownHint') : t('matrixSubtitle')}
              </p>
            </div>

            {/* Mode Switcher + Period Controls + CSV Export */}
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="tablist"
                aria-label={t('matrixTitle')}
                className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'annual'}
                  onClick={() => {
                    const mYear = Number(month.slice(0, 4));
                    if (Number.isFinite(mYear) && mYear > 2000) setYear(mYear);
                    setMode('annual');
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    mode === 'annual'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {t('matrixModeAnnual')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'sessions'}
                  onClick={() => setMode('sessions')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    mode === 'sessions'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {t('matrixModeSessions')}
                </button>
              </div>

              {mode === 'sessions' ? (
                <input
                  id="matrix-month"
                  aria-label={t('monthLabel')}
                  type="month"
                  value={month}
                  onChange={(e) => e.target.value && onChangeMonth(e.target.value)}
                  className="min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs sm:text-sm font-medium tabular-nums"
                />
              ) : (
                <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
                  <button
                    type="button"
                    aria-label={t('prevWeek')}
                    onClick={() => setYear((y) => y - 1)}
                    className="inline-flex h-9 w-9 items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-s-lg"
                  >
                    <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                  </button>
                  <span className="px-2.5 text-sm font-semibold tabular-nums">{year}</span>
                  <button
                    type="button"
                    aria-label={t('nextWeek')}
                    onClick={() => setYear((y) => y + 1)}
                    className="inline-flex h-9 w-9 items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-e-lg"
                  >
                    <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={handleExportCsv}
                disabled={visibleRows.length === 0}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{t('matrixExportCsv')}</span>
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('searchPatientsPlaceholder')}
                  className="w-full min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 ps-9 pe-3 py-1.5 text-xs sm:text-sm"
                />
              </div>

              {/* Payment Status Filter */}
              <div className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                    statusFilter === 'all'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {t('matrixFilterAll')} ({allRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('unpaid')}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                    statusFilter === 'unpaid'
                      ? 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-400'
                  }`}
                >
                  {t('matrixFilterUnpaid')} ({summaryStats.unpaidPatients})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('paid')}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                    statusFilter === 'paid'
                      ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400'
                  }`}
                >
                  {t('matrixFilterPaid')} ({summaryStats.paidPatients})
                </button>
              </div>

              {/* Billing Cadence Filter */}
              <select
                aria-label={t('billingModeLabel')}
                value={billingFilter}
                onChange={(e) => setBillingFilter(e.target.value as BillingModeFilter)}
                className="min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1 text-xs font-medium"
              >
                <option value="all">{t('billingAllModes')}</option>
                <option value="monthly">{t('billingMonthlyShort')}</option>
                <option value="session">{t('billingSessionShort')}</option>
              </select>

              {db.domains.length > 0 && (
                <select
                  aria-label={t('domainLabel')}
                  value={domainFilter}
                  onChange={(e) => setDomainFilter(e.target.value)}
                  className="min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1 text-xs font-medium"
                >
                  <option value="all">{t('allDomains')}</option>
                  {db.domains.map((dom) => (
                    <option key={dom.id} value={dom.id}>
                      {dom.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePlanned}
                  onChange={(e) => setIncludePlanned(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span>{t('matrixIncludePlannedLabel')}</span>
              </label>

              <div className="hidden xl:flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <ToneIcon tone="paid" className="h-3.5 w-3.5" />
                  <span>{t('matrixStatusPaid')}</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <ToneIcon tone="partial" className="h-3.5 w-3.5" />
                  <span>{t('matrixStatusPartial')}</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <ToneIcon tone="unpaid" className="h-3.5 w-3.5" />
                  <span>{t('matrixStatusUnpaid')}</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <ToneIcon tone="planned" className="h-3.5 w-3.5" />
                  <span>{t('matrixStatusPlanned')}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Matrix Grid */}
        {visibleRows.length === 0 ? (
          <div className="px-6 py-12 text-center space-y-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('matrixNoMatchingRows')}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setBillingFilter('all');
                  setDomainFilter('all');
                  setQuery('');
                }}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{t('matrixResetFilters')}</span>
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/70 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <th className="sticky start-0 z-20 min-w-[200px] max-w-[240px] bg-slate-50 dark:bg-slate-950 border-e border-slate-200 dark:border-slate-800 px-4 py-2.5 text-start">
                      {t('colPatient')}
                    </th>

                    {mode === 'sessions'
                      ? Array.from({length: maxSessionCols}, (_, idx) => (
                          <th
                            key={idx}
                            className="min-w-[132px] border-e border-slate-200/70 dark:border-slate-800/70 px-2.5 py-2.5 text-center tabular-nums"
                          >
                            {t('matrixColSessionShort')}
                            {idx + 1}
                          </th>
                        ))
                      : monthKeys.map((ym) => (
                          <th
                            key={ym}
                            className="min-w-[106px] border-e border-slate-200/70 dark:border-slate-800/70 px-2 py-2.5 text-center capitalize"
                          >
                            {formatMonthShort(ym, lang)}
                          </th>
                        ))}

                    <th className="min-w-[96px] border-s border-slate-200 dark:border-slate-800 px-3 py-2.5 text-end">
                      {t('totalBilled')}
                    </th>
                    <th className="min-w-[96px] px-3 py-2.5 text-end">{t('colPaid')}</th>
                    <th className="min-w-[116px] px-3 py-2.5 text-start">
                      {t('matrixColVersements')}
                    </th>
                    <th className="min-w-[104px] px-3 py-2.5 text-end">{t('colRemaining')}</th>
                    <th className="min-w-[108px] px-3 py-2.5 text-start">{t('matrixColStatus')}</th>
                    <th className="min-w-[176px] px-3 py-2.5 text-end">{t('colActions')}</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {pagedRows.map((row) => (
                    <tr
                      key={row.patient.id}
                      className="group hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      {/* Sticky Patient Info Cell */}
                      <td className="sticky start-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80 border-e border-slate-200 dark:border-slate-800 px-4 py-2.5 align-middle">
                        <button
                          type="button"
                          onClick={() => onOpenPatient(row.patient)}
                          className="block w-full text-start focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate hover:underline">
                            {row.patient.nom}
                          </div>
                          {row.subtitle && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {row.subtitle}
                            </div>
                          )}
                        </button>
                      </td>

                      {/* Matrix Body Cells */}
                      {mode === 'sessions'
                        ? Array.from({length: maxSessionCols}, (_, colIdx) => {
                            const s = row.sessions[colIdx];
                            if (!s) {
                              return (
                                <td
                                  key={colIdx}
                                  className="border-e border-slate-100 dark:border-slate-800/60 px-2 py-2 text-center text-xs text-slate-300 dark:text-slate-700"
                                >
                                  —
                                </td>
                              );
                            }
                            const tone = getSessionTone(s);
                            const paid = rdvPaidTotal(s);
                            const dom = getDomainById(db.domains, resolveDomainId(s));
                            const canQuickPay = s.statut === 'fait' && paid < s.tarif;
                            const lastPayDate = s.pay.reduce(
                              (acc, entry) => (entry.d > acc ? entry.d : acc),
                              '',
                            );
                            const sessionScopeLabel = `${t('versementScopeSession')} · ${formatDateShort(s.date, lang)} ${s.heure}`;

                            return (
                              <td
                                key={s.id}
                                className="border-e border-slate-100 dark:border-slate-800/60 p-1.5 align-top"
                              >
                                <div
                                  className={`rounded-lg border px-2 py-1.5 transition-colors ${getToneClasses(tone)}`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => onOpenRdv(s)}
                                    className="block w-full text-start"
                                  >
                                    <div className="flex items-center justify-between gap-1 text-[11px] opacity-80">
                                      <span className="tabular-nums font-medium">
                                        {formatDayMonthNumeric(s.date)}
                                      </span>
                                      {domainFilter === 'all' && dom && (
                                        <span className="truncate max-w-[68px]">{dom.name}</span>
                                      )}
                                    </div>

                                    <div className="mt-1 flex items-center gap-1 text-xs font-semibold">
                                      <ToneIcon tone={tone} />
                                      <span className="truncate">{getToneLabel(tone)}</span>
                                    </div>

                                    <div className="mt-0.5 text-[11px] tabular-nums font-medium">
                                      {tone === 'absent'
                                        ? '—'
                                        : tone === 'partial'
                                          ? `${formatCurrency(paid, lang)} / ${formatCurrency(s.tarif, lang)}`
                                          : tone === 'paid' || tone === 'credit'
                                            ? formatCurrency(paid, lang)
                                            : formatCurrency(s.tarif, lang)}
                                    </div>

                                    {s.pay.length > 0 && (
                                      <div className="mt-0.5 text-[10px] opacity-80 tabular-nums truncate">
                                        {s.pay.length} {t('versementCountShort')}
                                        {lastPayDate ? ` · ${formatDayMonthNumeric(lastPayDate)}` : ''}
                                      </div>
                                    )}
                                  </button>

                                  {s.statut !== 'absent' && (
                                    <div className="mt-1.5 flex items-center gap-1">
                                      {canQuickPay && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            onQuickMarkRdvsPaid([s.id], t('matrixSessionPaidToast'))
                                          }
                                          className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-current/25 bg-white/80 dark:bg-slate-900/70 px-1.5 py-0.5 text-[11px] font-semibold hover:bg-white dark:hover:bg-slate-900 transition-colors whitespace-nowrap"
                                        >
                                          <Check className="h-3 w-3" />
                                          <span>{t('matrixQuickPayBtn')}</span>
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onOpenVersement(row.patient, sessionScopeLabel, [s.id])
                                        }
                                        className="inline-flex flex-1 items-center justify-center rounded border border-current/25 bg-white/60 dark:bg-slate-900/50 px-1.5 py-0.5 text-[11px] font-medium hover:bg-white dark:hover:bg-slate-900 transition-colors whitespace-nowrap"
                                      >
                                        <span>{t('versementShortBtn')}</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })
                        : row.months.map((m) => {
                            if (m.tone === 'empty') {
                              return (
                                <td
                                  key={m.ym}
                                  className="border-e border-slate-100 dark:border-slate-800/60 px-2 py-2 text-center text-xs text-slate-300 dark:text-slate-700"
                                >
                                  —
                                </td>
                              );
                            }
                            const canQuickPayMonth = m.unpaidSessionIds.length > 0 && m.remaining > 0;
                            const monthScopeLabel = `${t('versementScopeMonth')} · ${formatMonthShort(m.ym, lang)} ${m.ym.slice(0, 4)}`;
                            return (
                              <td
                                key={m.ym}
                                className="border-e border-slate-100 dark:border-slate-800/60 p-1.5 align-top"
                              >
                                <div
                                  className={`rounded-lg border px-2 py-1.5 transition-colors ${getToneClasses(m.tone)}`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onChangeMonth(m.ym);
                                      setMode('sessions');
                                    }}
                                    title={t('matrixDrilldownHint')}
                                    className="block w-full text-start"
                                  >
                                    <div className="flex items-center justify-between gap-1 text-[11px] font-semibold">
                                      <span className="inline-flex items-center gap-1 truncate">
                                        <ToneIcon tone={m.tone} className="h-3 w-3 shrink-0" />
                                        <span className="truncate">{getToneLabel(m.tone)}</span>
                                      </span>
                                      <span className="text-[10px] opacity-75 tabular-nums shrink-0">
                                        {m.totalCount}
                                      </span>
                                    </div>
                                    <div className="mt-1 text-[11px] tabular-nums font-medium">
                                      {m.billed > 0
                                        ? m.tone === 'partial'
                                          ? `${formatCurrency(m.paid, lang)}/${formatCurrency(m.billed, lang)}`
                                          : formatCurrency(
                                              m.tone === 'unpaid' ? m.billed : m.paid,
                                              lang,
                                            )
                                        : m.paid > 0
                                          ? m.tone === 'partial' && m.plannedTarif > 0
                                            ? `${formatCurrency(m.paid, lang)}/${formatCurrency(m.plannedTarif, lang)}`
                                            : formatCurrency(m.paid, lang)
                                          : `${m.totalCount} ${
                                              m.totalCount > 1
                                                ? t('sessionsCount')
                                                : t('sessionSingular')
                                            }`}
                                    </div>
                                    {m.versementCount > 0 && (
                                      <div className="mt-0.5 text-[10px] opacity-80 tabular-nums truncate">
                                        {m.versementCount} {t('versementCountShort')}
                                        {m.lastVersementDate
                                          ? ` · ${formatDayMonthNumeric(m.lastVersementDate)}`
                                          : ''}
                                      </div>
                                    )}
                                  </button>

                                  <div className="mt-1.5 flex items-center gap-1">
                                    {canQuickPayMonth && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onQuickMarkRdvsPaid(
                                            m.unpaidSessionIds,
                                            t('matrixSettledToast'),
                                          )
                                        }
                                        className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-current/25 bg-white/80 dark:bg-slate-900/70 px-1.5 py-0.5 text-[11px] font-semibold hover:bg-white dark:hover:bg-slate-900 transition-colors whitespace-nowrap"
                                      >
                                        <Check className="h-3 w-3" />
                                        <span>{t('matrixQuickPayBtn')}</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onOpenVersement(
                                          row.patient,
                                          monthScopeLabel,
                                          m.sessionIds,
                                        )
                                      }
                                      className="inline-flex flex-1 items-center justify-center rounded border border-current/25 bg-white/60 dark:bg-slate-900/50 px-1.5 py-0.5 text-[11px] font-medium hover:bg-white dark:hover:bg-slate-900 transition-colors whitespace-nowrap"
                                    >
                                      <span>{t('versementShortBtn')}</span>
                                    </button>
                                  </div>
                                </div>
                              </td>
                            );
                          })}

                      {/* Row Summary Columns */}
                      <td className="border-s border-slate-200 dark:border-slate-800 px-3 py-2.5 text-end tabular-nums whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">
                        {formatCurrency(row.billed, lang)}
                      </td>

                      <td className="px-3 py-2.5 text-end tabular-nums whitespace-nowrap font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(row.paid, lang)}
                      </td>

                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            onOpenVersement(
                              row.patient,
                              mode === 'sessions'
                                ? `${t('versementScopeMonth')} · ${formatMonthShort(month, lang)} ${month.slice(0, 4)}`
                                : `${t('versementScopePeriod')} · ${year}`,
                              row.sessionIds,
                            )
                          }
                          className="text-start hover:underline focus-visible:outline-2"
                        >
                          {row.versementCount > 0 ? (
                            <div>
                              <div className="text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                                {row.versementCount} {t('versementCountShort')}
                              </div>
                              {row.lastVersementDate && (
                                <div className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                                  {formatDateShort(row.lastVersementDate, lang)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                              {t('versementShortBtn')}
                            </span>
                          )}
                        </button>
                      </td>

                      <td className="px-3 py-2.5 text-end tabular-nums whitespace-nowrap font-bold">
                        {row.remaining > 0 ? (
                          <span className="text-rose-700 dark:text-rose-400">
                            {formatCurrency(row.remaining, lang)}
                          </span>
                        ) : row.remaining < 0 ? (
                          <span className="text-teal-700 dark:text-teal-400">
                            {t('creditLabel')} {formatCurrency(Math.abs(row.remaining), lang)}
                          </span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">
                            {formatCurrency(0, lang)}
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                            row.rowTone === 'paid' || row.rowTone === 'credit'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : row.rowTone === 'partial'
                                ? 'text-amber-700 dark:text-amber-400'
                                : row.rowTone === 'unpaid'
                                  ? 'text-rose-700 dark:text-rose-400'
                                  : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          <ToneIcon tone={row.rowTone} />
                          <span>{getToneLabel(row.rowTone)}</span>
                        </span>
                      </td>

                      <td className="px-3 py-2.5 text-end whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onOpenVersement(
                                row.patient,
                                mode === 'sessions'
                                  ? `${t('versementScopeMonth')} · ${formatMonthShort(month, lang)} ${month.slice(0, 4)}`
                                  : `${t('versementScopePeriod')} · ${year}`,
                                row.sessionIds,
                              )
                            }
                            className="inline-flex min-h-8 items-center rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                          >
                            {t('versementBtn')}
                          </button>
                          {row.unpaidSessionIds.length > 0 && row.remaining > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                onQuickMarkRdvsPaid(row.unpaidSessionIds, t('matrixSettledToast'))
                              }
                              className="inline-flex min-h-8 items-center gap-1 rounded-md accent-bg px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>{t('matrixSettleAllBtn')}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onPrintStatement(row.patient.id)}
                            title={t('printStatementBtn')}
                            aria-label={`${t('printStatementBtn')} — ${row.patient.nom}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>

                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/70 text-xs font-bold">
                    <td className="sticky start-0 z-10 bg-slate-50 dark:bg-slate-950 border-e border-slate-200 dark:border-slate-800 px-4 py-3">
                      {t('totalsLabel')} ({visibleRows.length})
                    </td>

                    {mode === 'sessions'
                      ? columnTotals.sessionCols.map((col, idx) => (
                          <td
                            key={idx}
                            className="border-e border-slate-200/70 dark:border-slate-800/70 px-2 py-2.5 text-center tabular-nums"
                          >
                            {col.billed > 0 || col.paid > 0 ? (
                              <div className="space-y-0.5">
                                <div className="text-emerald-700 dark:text-emerald-400">
                                  {formatCurrency(col.paid, lang)}
                                </div>
                                <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                  / {formatCurrency(col.billed, lang)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        ))
                      : columnTotals.monthCols.map((col) => (
                          <td
                            key={col.ym}
                            className="border-e border-slate-200/70 dark:border-slate-800/70 px-2 py-2.5 text-center tabular-nums"
                          >
                            {col.billed > 0 || col.paid > 0 ? (
                              <div className="space-y-0.5">
                                <div className="text-emerald-700 dark:text-emerald-400">
                                  {formatCurrency(col.paid, lang)}
                                </div>
                                <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                  / {formatCurrency(col.billed, lang)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        ))}

                    <td className="border-s border-slate-200 dark:border-slate-800 px-3 py-3 text-end tabular-nums whitespace-nowrap">
                      {formatCurrency(columnTotals.totalBilled, lang)}
                    </td>
                    <td className="px-3 py-3 text-end tabular-nums whitespace-nowrap text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(columnTotals.totalPaid, lang)}
                    </td>
                    <td className="px-3 py-3 text-start tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-300">
                      {columnTotals.totalVersements} {t('versementCountShort')}
                    </td>
                    <td className="px-3 py-3 text-end tabular-nums whitespace-nowrap">
                      <span
                        className={
                          columnTotals.totalRemaining > 0
                            ? 'text-rose-700 dark:text-rose-400'
                            : 'text-slate-700 dark:text-slate-300'
                        }
                      >
                        {columnTotals.totalRemaining < 0
                          ? `${t('creditLabel')} ${formatCurrency(
                              Math.abs(columnTotals.totalRemaining),
                              lang,
                            )}`
                          : formatCurrency(columnTotals.totalRemaining, lang)}
                      </span>
                    </td>
                    <td colSpan={2} className="px-3 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                <span className="tabular-nums">
                  {t('ledgerPageLabel')} {safePage} / {totalPages} · {visibleRows.length}{' '}
                  {t('navPatients').toLowerCase()}
                </span>
                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="min-h-8 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                  >
                    {t('ledgerPrevPage')}
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
  );
};
