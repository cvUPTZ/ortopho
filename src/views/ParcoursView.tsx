import React, {useMemo, useState} from 'react';
import {CalendarPlus, ChevronDown, ChevronRight, Route, Settings} from 'lucide-react';
import {PATHOLOGIES, STAGES_ORDER, type TranslationKey} from '../i18n';
import {todayISO} from '../storage';
import type {DB, Patient, Rdv, Stage} from '../types';
import {formatDateShort, getStaffName, sortPatientsByName} from '../utils';

interface ParcoursViewProps {
  db: DB;
  onOpenPatient: (patient: Patient) => void;
  onScheduleDiag: (patient: Patient) => void;
  onOrient: (patient: Patient) => void;
  onOpenSettings: () => void;
  t: (key: TranslationKey) => string;
}

export const ParcoursView: React.FC<ParcoursViewProps> = ({
  db,
  onOpenPatient,
  onScheduleDiag,
  onOrient,
  onOpenSettings,
  t,
}) => {
  const lang = db.lang;
  const today = todayISO();

  const [collapsed, setCollapsed] = useState<Record<Stage, boolean>>({
    req: false,
    diag: false,
    orient: false,
    suivi: false,
    clos: true,
  });

  const sortedByStage = useMemo(() => {
    const map: Record<Stage, Patient[]> = {
      req: [],
      diag: [],
      orient: [],
      suivi: [],
      clos: [],
    };
    for (const p of sortPatientsByName(db.patients, lang)) {
      map[p.stage].push(p);
    }
    return map;
  }, [db.patients, lang]);

  const nextRdvFor = (pid: string): Rdv | undefined => {
    const upcoming = db.rdv
      .filter((r) => r.pid === pid && r.statut === 'prevu' && r.date >= today)
      .sort((a, b) => `${a.date} ${a.heure}`.localeCompare(`${b.date} ${b.heure}`));
    if (upcoming.length > 0) return upcoming[0];
    const anyPlanned = db.rdv
      .filter((r) => r.pid === pid && r.statut === 'prevu')
      .sort((a, b) => `${a.date} ${a.heure}`.localeCompare(`${b.date} ${b.heure}`));
    return anyPlanned[0];
  };

  if (db.staff.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 text-center max-w-xl mx-auto">
        <h2 className="text-lg font-bold mb-2">{t('parcoursNoStaffTitle')}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">
          {t('parcoursNoStaffDesc')}
        </p>
        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg accent-bg px-4 py-2 text-sm font-semibold"
        >
          <Settings className="h-4 w-4" />
          <span>{t('openSettings')}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {STAGES_ORDER.map((stage) => {
        const list = sortedByStage[stage];
        const isCollapsed = collapsed[stage];

        return (
          <section
            key={stage}
            className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
          >
            <button
              type="button"
              aria-expanded={!isCollapsed}
              onClick={() =>
                setCollapsed((prev) => ({...prev, [stage]: !prev[stage]}))
              }
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-start hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                )}
                <h2 className="text-base font-bold">{t(`stage_${stage}`)}</h2>
              </div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                {list.length}
              </span>
            </button>

            {!isCollapsed && (
              <div className="border-t border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
                {list.length === 0 ? (
                  <div className="px-4 py-5 text-sm text-slate-500 dark:text-slate-400">
                    {t('noPatientsInStage')}
                  </div>
                ) : (
                  list.map((pat) => {
                    const nextRdv = nextRdvFor(pat.id);
                    const thName = getStaffName(db, pat.th);
                    const pathoLabel =
                      pat.patho !== '' ? PATHOLOGIES[lang][Number(pat.patho)] ?? '' : '';

                    return (
                      <div
                        key={pat.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => onOpenPatient(pat)}
                          className="flex-1 min-w-[200px] text-start"
                        >
                          <div className="text-sm font-semibold">{pat.nom}</div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {pathoLabel && <span>{pathoLabel}</span>}
                            {stage === 'suivi' && thName && (
                              <>
                                {pathoLabel && <span aria-hidden="true">·</span>}
                                <span>
                                  {t('therapistLabel')} : {thName}
                                </span>
                              </>
                            )}
                            {(stage === 'diag' || stage === 'suivi') && nextRdv && (
                              <>
                                {(pathoLabel || (stage === 'suivi' && thName)) && (
                                  <span aria-hidden="true">·</span>
                                )}
                                <span className="tabular-nums">
                                  {t('nextAppointmentLabel')} : {formatDateShort(nextRdv.date, lang)}{' '}
                                  {nextRdv.heure}
                                </span>
                              </>
                            )}
                          </div>
                        </button>

                        <div className="flex items-center gap-2 shrink-0">
                          {stage === 'req' && (
                            <button
                              type="button"
                              onClick={() => onScheduleDiag(pat)}
                              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg accent-bg px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                              <span>{t('scheduleDiagBtn')}</span>
                            </button>
                          )}
                          {stage === 'orient' && (
                            <button
                              type="button"
                              onClick={() => onOrient(pat)}
                              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg accent-bg px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
                            >
                              <Route className="h-3.5 w-3.5" />
                              <span>{t('orientBtn')}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};
