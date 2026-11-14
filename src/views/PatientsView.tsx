import React, {useMemo, useState} from 'react';
import {Plus, Printer, Search} from 'lucide-react';
import type {TranslationKey} from '../i18n';
import type {DB, Patient} from '../types';
import {
  formatAge,
  formatCurrency,
  normalizeSearch,
  patientFinancials,
  sortPatientsByName,
} from '../utils';

interface PatientsViewProps {
  db: DB;
  onOpenPatient: (patient: Patient | null) => void;
  onPrintDossier: (patientId: string) => void;
  t: (key: TranslationKey) => string;
}

export const PatientsView: React.FC<PatientsViewProps> = ({
  db,
  onOpenPatient,
  onPrintDossier,
  t,
}) => {
  const lang = db.lang;
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const sorted = sortPatientsByName(db.patients, lang);
    const q = normalizeSearch(query);
    if (!q) return sorted;
    return sorted.filter((p) => {
      return (
        normalizeSearch(p.nom).includes(q) ||
        normalizeSearch(p.tel).includes(q) ||
        normalizeSearch(p.parent).includes(q)
      );
    });
  }, [db.patients, lang, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-slate-400" />
          <input
            type="search"
            aria-label={t('search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPatientsPlaceholder')}
            className="w-full min-h-11 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ps-9 pe-3 py-2 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={() => onOpenPatient(null)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg accent-bg px-4 py-2 text-sm font-semibold whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          <span>{t('newPatient')}</span>
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {t('noPatientsFound')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3 text-start">{t('colPatient')}</th>
                  <th className="px-4 py-3 text-start">{t('colAge')}</th>
                  <th className="px-4 py-3 text-start">{t('colPhone')}</th>
                  <th className="px-4 py-3 text-end">{t('colBalance')}</th>
                  <th className="px-4 py-3 text-end">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.map((pat) => {
                  const fin = patientFinancials(db, pat.id);
                  const ageStr = formatAge(pat.naissance, lang, t('yearOld'), t('yearsOld'));
                  return (
                    <tr
                      key={pat.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onOpenPatient(pat)}
                          className="text-start group"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold group-hover:underline">{pat.nom}</span>
                            <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                              {t(`stage_${pat.stage}`)}
                            </span>
                          </div>
                          {pat.parent && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {pat.parent}
                            </div>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {ageStr}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {pat.tel || '—'}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums whitespace-nowrap">
                        {fin.balance > 0 ? (
                          <span className="font-semibold text-amber-700 dark:text-amber-400">
                            {formatCurrency(fin.balance, lang)}
                          </span>
                        ) : fin.balance < 0 ? (
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                            {t('creditLabel')} {formatCurrency(Math.abs(fin.balance), lang)}
                          </span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">
                            {formatCurrency(0, lang)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-end whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onPrintDossier(pat.id)}
                          aria-label={`${t('fullDossierPrint')} — ${pat.nom}`}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
