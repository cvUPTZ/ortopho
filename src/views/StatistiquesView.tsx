import React, {useMemo} from 'react';
import {PATHOLOGIES, type TranslationKey} from '../i18n';
import type {DB} from '../types';
import {
  currentMonthYYYYMM,
  formatCurrency,
  formatMonthShort,
  formatNumber,
  monthCollectedTotal,
} from '../utils';

interface StatistiquesViewProps {
  db: DB;
  t: (key: TranslationKey) => string;
}

export const StatistiquesView: React.FC<StatistiquesViewProps> = ({db, t}) => {
  const lang = db.lang;
  const currentMonth = currentMonthYYYYMM();

  // Last 12 months collected
  const monthsData = useMemo(() => {
    const now = new Date();
    const list: {ym: string; label: string; total: number}[] = [];
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      list.push({
        ym,
        label: formatMonthShort(ym, lang),
        total: monthCollectedTotal(db, ym),
      });
    }
    return list;
  }, [db, lang]);

  const maxCollected = useMemo(
    () => Math.max(1, ...monthsData.map((m) => m.total)),
    [monthsData],
  );

  // Patients by pathology
  const pathologyRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of db.patients) {
      const key = p.patho !== '' ? p.patho : 'none';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const items = Array.from(counts.entries()).map(([key, count]) => ({
      key,
      label:
        key === 'none'
          ? t('statsNotSpecified')
          : PATHOLOGIES[lang][Number(key)] ?? t('statsNotSpecified'),
      count,
    }));
    items.sort((a, b) => b.count - a.count);
    return items;
  }, [db.patients, lang, t]);

  const maxPathoCount = useMemo(
    () => Math.max(1, ...pathologyRows.map((r) => r.count)),
    [pathologyRows],
  );

  // Attendance stats for current month
  const monthAttendance = useMemo(() => {
    const monthRdvs = db.rdv.filter((r) => r.date.startsWith(currentMonth));
    const total = monthRdvs.length;
    const absent = monthRdvs.filter((r) => r.statut === 'absent').length;
    const rate = total > 0 ? (absent / total) * 100 : 0;
    const activePatients = db.patients.filter(
      (p) => p.stage === 'suivi' || p.stage === 'diag' || p.stage === 'orient',
    ).length;
    return {total, absent, rate, activePatients};
  }, [db.rdv, db.patients, currentMonth]);

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('statsAbsenceRate')}
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {formatNumber(monthAttendance.rate, lang)} %
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('statsSessionsMonth')}
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{monthAttendance.total}</div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('statsActivePatients')}
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {monthAttendance.activePatients}{' '}
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
              / {db.patients.length}
            </span>
          </div>
        </div>
      </div>

      {/* 12-month collected SVG bar chart (RTL-aware & print-safe) */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2 className="text-base font-bold">{t('statsCollected12m')}</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {t('statsMaxLabel')} {formatCurrency(Math.max(0, ...monthsData.map((m) => m.total)), lang)}
          </span>
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox="0 0 720 220"
            role="img"
            aria-label={t('statsCollected12m')}
            className="w-full min-w-[480px] h-52"
          >
            <line
              x1="16"
              y1="176"
              x2="704"
              y2="176"
              stroke="currentColor"
              strokeOpacity="0.15"
              strokeWidth="1"
            />
            {monthsData.map((m, idx) => {
              const displayIdx = lang === 'ar' ? 11 - idx : idx;
              const colWidth = 680 / 12;
              const barW = 32;
              const x = 20 + displayIdx * colWidth + (colWidth - barW) / 2;
              const maxH = 140;
              const barH = m.total > 0 ? Math.max(4, (m.total / maxCollected) * maxH) : 2;
              const y = 176 - barH;
              return (
                <g key={m.ym}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={barH}
                    rx="4"
                    fill={m.total > 0 ? 'var(--accent)' : 'currentColor'}
                    fillOpacity={m.total > 0 ? 0.9 : 0.15}
                  />
                  {m.total > 0 && (
                    <text
                      x={x + barW / 2}
                      y={y - 6}
                      textAnchor="middle"
                      fontSize="10"
                      fill="currentColor"
                      opacity="0.7"
                    >
                      {Math.round(m.total / 1000)}k
                    </text>
                  )}
                  <text
                    x={x + barW / 2}
                    y="198"
                    textAnchor="middle"
                    fontSize="11"
                    fill="currentColor"
                    opacity="0.75"
                  >
                    {m.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      {/* Patients by pathology */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <h2 className="text-base font-bold mb-4">{t('statsByPathology')}</h2>
        {pathologyRows.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('noPatientsFound')}</p>
        ) : (
          <div className="space-y-3">
            {pathologyRows.map((row) => {
              const pct = (row.count / maxPathoCount) * 100;
              return (
                <div key={row.key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium truncate">{row.label}</span>
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                      {row.count}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded accent-bg"
                      style={{width: `${pct}%`}}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
