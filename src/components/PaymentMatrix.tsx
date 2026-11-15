import React, {useMemo, useState} from 'react';
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
import type {DB, Patient, Rdv} from '../types';
import {
  formatCurrency,
  formatMonthShort,
  getDomainById,
  getStaffDomain,
  getStaffName,
  normalizeSearch,
  rdvBilledAmount,
  rdvPaidTotal,
  sortPatientsByName,
} from '../utils';

export type MatrixMode = 'sessions' | 'annual';
export type MatrixStatusFilter = 'all' | 'unpaid' | 'paid';

type CellTone = 'paid' | 'partial' | 'unpaid' | 'planned' | 'absent' | 'credit';

interface PaymentMatrixProps {
  db: DB;
  month: string;
  onChangeMonth: (yyyyMm: string) => void;
  onOpenPatient: (patient: Patient) => void;
  onOpenRdv: (rdv: Rdv) => void;
  onPrintStatement: (patientId: string) => void;
  onQuickMarkRdvsPaid: (rdvIds: string[], toastMsg: string) => void;
  t: (key: TranslationKey) => string;
}

interface MonthAggregate {
  ym: string;
  billed: number;
  paid: number;
  remaining: number;
  doneCount: number;
  plannedCount: number;
  absentCount: number;
  totalCount: number;
  tone: CellTone | 'empty';
}

interface PatientMatrixRow {
  patient: Patient;
  subtitle: string;
  sessions: Rdv[];
  months: MonthAggregate[];
  billed: number;
  paid: number;
  remaining: number;
  unpaidSessionIds: string[];
  rowTone: CellTone;
}

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
  // absent
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
  t,
}) => {
  const lang = db.lang;
  const [mode, setMode] = useState<MatrixMode>('sessions');
  const [year, setYear] = useState<number>(() => {
    const parsed = Number(month.slice(0, 4));
    return Number.isFinite(parsed) && parsed > 2000 ? parsed : new Date().getFullYear();
  });
  const [statusFilter, setStatusFilter] = useState<MatrixStatusFilter>('all');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [query, setQuery] = useState<string>('');
  const [includePlanned, setIncludePlanned] = useState<boolean>(true);

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

  // Build full matrix rows for the current mode, domain filter, and planned toggle
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
      const sessions = (rdvsByPatient.get(patient.id) ?? []).sort((a, b) =>
        `${a.date} ${a.heure}`.localeCompare(`${b.date} ${b.heure}`),
      );
      if (sessions.length === 0) continue;

      let billed = 0;
      let paid = 0;
      const unpaidSessionIds: string[] = [];

      for (const s of sessions) {
        const b = rdvBilledAmount(s);
        const p = rdvPaidTotal(s);
        billed += b;
        paid += p;
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
        rowTone = 'credit';
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
                  paid: 0,
                  remaining: 0,
                  doneCount: 0,
                  plannedCount: 0,
                  absentCount: 0,
                  totalCount: 0,
                  tone: 'empty',
                };
              }
              let mBilled = 0;
              let mPaid = 0;
              let doneCount = 0;
              let plannedCount = 0;
              let absentCount = 0;
              for (const ms of mSessions) {
                mBilled += rdvBilledAmount(ms);
                mPaid += rdvPaidTotal(ms);
                if (ms.statut === 'fait') doneCount++;
                else if (ms.statut === 'prevu') plannedCount++;
                else absentCount++;
              }
              const mRem = mBilled - mPaid;
              let tone: CellTone = 'planned';
              if (mBilled > 0) {
                if (mRem > 0 && mPaid > 0) tone = 'partial';
                else if (mRem > 0) tone = 'unpaid';
                else if (mRem < 0) tone = 'credit';
                else tone = 'paid';
              } else if (mPaid > 0) {
                tone = 'credit';
              } else if (plannedCount === 0 && absentCount > 0) {
                tone = 'absent';
              }
              return {
                ym,
                billed: mBilled,
                paid: mPaid,
                remaining: mRem,
                doneCount,
                plannedCount,
                absentCount,
                totalCount: mSessions.length,
                tone,
              };
            })
          : [];

      const staffObj = staffMap.get(patient.th);
      const domObj = getStaffDomain(db.domains, staffObj);
      const staffName = getStaffName(db, patient.th);
      const subtitleParts = [domObj?.name, staffName, patient.tel].filter(
        (x): x is string => Boolean(x && x.trim()),
      );

      rows.push({
        patient,
        subtitle: subtitleParts.slice(0, 2).join(' · '),
        sessions,
        months,
        billed,
        paid,
        remaining,
        unpaidSessionIds,
        rowTone,
      });
    }

    // Order: Unpaid/Partial highest owed first, then Paid/Credit, then Planned/Absent
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
  }, [db.rdv, db.patients, db.domains, mode, month, year, domainFilter, includePlanned, lang, monthKeys, staffMap]);

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

  // KPI metrics over the unfiltered-by-status period (respecting domain & period)
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
    return Math.max(4, ...visibleRows.map((r) => r.sessions.length));
  }, [mode, visibleRows]);

  // Column totals for visible rows
  const columnTotals = useMemo(() => {
    let totalBilled = 0;
    let totalPaid = 0;
    for (const r of visibleRows) {
      totalBilled += r.billed;
      totalPaid += r.paid;
    }
    const totalRemaining = totalBilled - totalPaid;

    if (mode === 'sessions') {
      const cols = Array.from({length: maxSessionCols}, (_, idx) => {
        let colBilled = 0;
        let colPaid = 0;
        let paidCount = 0;
        let unpaidCount = 0;
        for (const r of visibleRows) {
          const s = r.sessions[idx];
          if (!s) continue;
          const b = rdvBilledAmount(s);
          const p = rdvPaidTotal(s);
          colBilled += b;
          colPaid += p;
          const tone = getSessionTone(s);
          if (tone === 'paid' || tone === 'credit') paidCount++;
          else if (tone === 'unpaid' || tone === 'partial') unpaidCount++;
        }
        return {billed: colBilled, paid: colPaid, paidCount, unpaidCount};
      });
      return {totalBilled, totalPaid, totalRemaining, sessionCols: cols, monthCols: []};
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
    return {totalBilled, totalPaid, totalRemaining, sessionCols: [], monthCols};
  }, [visibleRows, mode, maxSessionCols, monthKeys]);

  const handleExportCsv = () => {
    const escapeCsv = (val: string | number) => {
      const s = String(val ?? '');
      if (/[";,\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const dynamicHeaders =
      mode === 'sessions'
        ? Array.from({length: maxSessionCols}, (_, i) => `${t('matrixColSessionShort')}${i + 1}`)
        : monthKeys.map((ym) => formatMonthShort(ym, lang));

    const headerRow = [
      t('colPatient'),
      t('phoneLabel'),
      ...dynamicHeaders,
      t('totalBilled'),
      t('totalCollected'),
      t('colRemaining'),
      t('matrixColStatus'),
    ];

    const dataRows = visibleRows.map((row) => {
      const cells =
        mode === 'sessions'
          ? Array.from({length: maxSessionCols}, (_, idx) => {
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
        ...cells,
        row.billed,
        row.paid,
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

  const hasActiveFilters = statusFilter !== 'all' || domainFilter !== 'all' || query.trim() !== '';

  return (
    <div className="space-y-4">
      {/* Unified KPI Strip (4 cells separated by hairline dividers, single surface) */}
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

          {/* Filter Bar: Search + Status Segmented Filter + Domain Select + Planned Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
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

              {/* Inline Legend (Icon + Text, no decorative dots) */}
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
                          className="min-w-[98px] border-e border-slate-200/70 dark:border-slate-800/70 px-2 py-2.5 text-center capitalize"
                        >
                          {formatMonthShort(ym, lang)}
                        </th>
                      ))}

                  <th className="min-w-[96px] border-s border-slate-200 dark:border-slate-800 px-3 py-2.5 text-end">
                    {t('totalBilled')}
                  </th>
                  <th className="min-w-[96px] px-3 py-2.5 text-end">{t('colPaid')}</th>
                  <th className="min-w-[104px] px-3 py-2.5 text-end">{t('colRemaining')}</th>
                  <th className="min-w-[116px] px-3 py-2.5 text-start">{t('matrixColStatus')}</th>
                  <th className="min-w-[136px] px-3 py-2.5 text-end">{t('colActions')}</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {visibleRows.map((row) => (
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
                                </button>

                                {canQuickPay && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onQuickMarkRdvsPaid([s.id], t('matrixSessionPaidToast'))
                                    }
                                    className="mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded border border-current/25 bg-white/80 dark:bg-slate-900/70 px-1.5 py-0.5 text-[11px] font-semibold hover:bg-white dark:hover:bg-slate-900 transition-colors"
                                  >
                                    <Check className="h-3 w-3" />
                                    <span>{t('matrixQuickPayBtn')}</span>
                                  </button>
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
                          return (
                            <td
                              key={m.ym}
                              className="border-e border-slate-100 dark:border-slate-800/60 p-1.5 align-top"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  onChangeMonth(m.ym);
                                  setMode('sessions');
                                }}
                                title={t('matrixDrilldownHint')}
                                className={`block w-full rounded-lg border px-2 py-1.5 text-start transition-colors hover:brightness-95 ${getToneClasses(m.tone)}`}
                              >
                                <div className="flex items-center gap-1 text-[11px] font-semibold">
                                  <ToneIcon tone={m.tone} className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{getToneLabel(m.tone)}</span>
                                </div>
                                <div className="mt-1 text-[11px] tabular-nums font-medium">
                                  {m.tone === 'partial'
                                    ? `${formatCurrency(m.paid, lang)}/${formatCurrency(m.billed, lang)}`
                                    : m.billed > 0
                                      ? formatCurrency(m.tone === 'unpaid' ? m.billed : m.paid, lang)
                                      : `${m.totalCount} ${
                                          m.totalCount > 1 ? t('sessionsCount') : t('sessionSingular')
                                        }`}
                                </div>
                              </button>
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

                    {/* Status Column (Color + Icon + Text) */}
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

                    {/* Row Actions */}
                    <td className="px-3 py-2.5 text-end whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
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
        )}
      </section>
    </div>
  );
};
