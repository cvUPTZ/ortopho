import React, {useMemo, useState} from 'react';
import {
  Calendar as CalendarIcon,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Plus,
  Printer,
  Users,
  UserX,
} from 'lucide-react';
import type {RdvSeed} from '../dialogs/RdvDialog';
import type {TranslationKey} from '../i18n';
import {todayISO} from '../storage';
import type {DB, Rdv} from '../types';
import {
  addDaysISO,
  formatCurrency,
  formatDateLong,
  formatDateShort,
  formatDayMonth,
  getMondayISO,
  getPatientName,
  getStaffDomain,
  getStaffName,
  getStaffTarif,
  groupStaffBySpecialite,
  minutesToTime,
  monthCollectedTotal,
  timeToMinutes,
  totalPracticeOwed,
} from '../utils';
import {isReminderSentForRdv} from '../whatsapp';

interface AgendaViewProps {
  db: DB;
  selectedDate: string;
  onChangeDate: (date: string) => void;
  onOpenRdv: (rdv: Rdv | null, seed?: RdvSeed) => void;
  onQuickStatus: (rdvId: string, statut: 'fait' | 'absent') => void;
  onSendWhatsApp: (rdv: Rdv) => void;
  onPrintPlanning: (weekStart: string, thId?: string) => void;
  onOpenTherapists: () => void;
  t: (key: TranslationKey) => string;
}

type AgendaMode = 'day' | 'week';

interface TherapistColumn {
  id: string;
  nom: string;
  specialite: string;
  domainId?: string;
  domainTarif: number | null;
  specKey: string;
  specLabel: string;
  tarif: number | null;
  isUnassigned: boolean;
}

export const AgendaView: React.FC<AgendaViewProps> = ({
  db,
  selectedDate,
  onChangeDate,
  onOpenRdv,
  onQuickStatus,
  onSendWhatsApp,
  onPrintPlanning,
  onOpenTherapists,
  t,
}) => {
  const lang = db.lang;
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  const [mode, setMode] = useState<AgendaMode>('day');
  const [filterSpec, setFilterSpec] = useState<string>('');
  const [filterTh, setFilterTh] = useState<string>('');
  const [showWeekend, setShowWeekend] = useState<boolean>(false);

  const specialtyGroups = useMemo(
    () => groupStaffBySpecialite(db.staff, lang, t('noDomainLabel'), db.domains),
    [db.staff, lang, t, db.domains],
  );
  const hasSpecialties = useMemo(
    () => specialtyGroups.some((g) => g.hasSpecialty),
    [specialtyGroups],
  );
  const effectiveFilterSpec = specialtyGroups.some((g) => g.key === filterSpec)
    ? filterSpec
    : '';

  const filteredStaff = useMemo(() => {
    if (!effectiveFilterSpec) return db.staff;
    const grp = specialtyGroups.find((g) => g.key === effectiveFilterSpec);
    return grp ? grp.members : db.staff;
  }, [db.staff, effectiveFilterSpec, specialtyGroups]);

  const filteredStaffIds = useMemo(
    () => new Set(filteredStaff.map((s) => s.id)),
    [filteredStaff],
  );

  const effectiveFilterTh = filteredStaff.some((s) => s.id === filterTh) ? filterTh : '';
  const effectiveMode: AgendaMode = db.staff.length === 0 ? 'day' : mode;
  const currentMonth = today.slice(0, 7);

  // Filtered appointments for selected day
  const dayRdvs = useMemo(() => {
    return db.rdv
      .filter((r) => {
        if (r.date !== selectedDate) return false;
        if (effectiveFilterTh !== '') return r.th === effectiveFilterTh;
        if (effectiveFilterSpec !== '') return filteredStaffIds.has(r.th);
        return true;
      })
      .sort((a, b) => a.heure.localeCompare(b.heure));
  }, [db.rdv, selectedDate, effectiveFilterTh, effectiveFilterSpec, filteredStaffIds]);

  // Tomorrow reminders (only shown when viewing today)
  const tomorrowReminders = useMemo(() => {
    if (selectedDate !== today) return [];
    return db.rdv
      .filter((r) => {
        if (r.date !== tomorrow || r.statut !== 'prevu') return false;
        if (effectiveFilterTh !== '') return r.th === effectiveFilterTh;
        if (effectiveFilterSpec !== '') return filteredStaffIds.has(r.th);
        return true;
      })
      .sort((a, b) => a.heure.localeCompare(b.heure));
  }, [db.rdv, selectedDate, today, tomorrow, effectiveFilterTh, effectiveFilterSpec, filteredStaffIds]);

  // Summary strip stats
  const daySessionsCount = useMemo(
    () => dayRdvs.filter((r) => r.statut !== 'absent').length,
    [dayRdvs],
  );
  const collectedMonth = useMemo(() => monthCollectedTotal(db, currentMonth), [db, currentMonth]);
  const owedTotal = useMemo(() => totalPracticeOwed(db), [db]);

  // Current time minutes for "now" highlight
  const nowMinutes = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, []);
  const isToday = selectedDate === today;
  const slotDur = Math.max(10, Math.min(120, Number(db.cab.dur) || 30));

  // Single-therapist timeline rows (used when single therapist filtered or no staff configured)
  type TimelineRow =
    | {type: 'rdv'; rdv: Rdv; startMin: number; isNow: boolean}
    | {type: 'free'; heure: string; dur: number; startMin: number; isNow: boolean};

  const timelineRows = useMemo<TimelineRow[]>(() => {
    const rows: TimelineRow[] = dayRdvs.map((r) => {
      const start = timeToMinutes(r.heure);
      const end = start + r.dur;
      const isNow = isToday && nowMinutes >= start && nowMinutes < end;
      return {type: 'rdv', rdv: r, startMin: start, isNow};
    });

    const h1Min = timeToMinutes(db.cab.h1 || '08:00');
    const h2Min = timeToMinutes(db.cab.h2 || '17:00');
    const activeRdvs = dayRdvs.filter((r) => r.statut !== 'absent');

    for (let m = h1Min; m + slotDur <= h2Min; m += slotDur) {
      const slotEnd = m + slotDur;
      const overlapped = activeRdvs.some((r) => {
        const rStart = timeToMinutes(r.heure);
        const rEnd = rStart + r.dur;
        return m < rEnd && rStart < slotEnd;
      });
      if (!overlapped) {
        const isNow = isToday && nowMinutes >= m && nowMinutes < slotEnd;
        rows.push({
          type: 'free',
          heure: minutesToTime(m),
          dur: slotDur,
          startMin: m,
          isNow,
        });
      }
    }

    rows.sort((a, b) => {
      if (a.startMin !== b.startMin) return a.startMin - b.startMin;
      return a.type === 'rdv' ? -1 : 1;
    });
    return rows;
  }, [dayRdvs, db.cab.h1, db.cab.h2, slotDur, isToday, nowMinutes]);

  // Day view columns when "All therapists" is active and db.staff.length > 0
  const staffIdSet = useMemo(() => new Set(db.staff.map((s) => s.id)), [db.staff]);

  const orderedStaffCols = useMemo<TherapistColumn[]>(() => {
    const groupsToShow = effectiveFilterSpec
      ? specialtyGroups.filter((g) => g.key === effectiveFilterSpec)
      : specialtyGroups;
    const cols: TherapistColumn[] = [];
    for (const grp of groupsToShow) {
      for (const s of grp.members) {
        cols.push({
          id: s.id,
          nom: s.nom,
          specialite: grp.hasSpecialty ? grp.label : (s.specialite ?? ''),
          domainId: grp.domainId,
          domainTarif: grp.tarif,
          specKey: grp.key,
          specLabel: grp.label,
          tarif: getStaffTarif(db, s.id),
          isUnassigned: false,
        });
      }
    }
    return cols;
  }, [specialtyGroups, effectiveFilterSpec, db]);

  const dayColumns = useMemo<TherapistColumn[]>(() => {
    if (db.staff.length === 0) return [];
    const cols: TherapistColumn[] = [...orderedStaffCols];
    const hasUnassigned =
      effectiveFilterSpec === '' && dayRdvs.some((r) => !r.th || !staffIdSet.has(r.th));
    if (hasUnassigned) {
      cols.push({
        id: '__unassigned__',
        nom: t('unassignedCol'),
        specialite: '',
        domainTarif: null,
        specKey: '__unassigned__',
        specLabel: t('unassignedCol'),
        tarif: null,
        isUnassigned: true,
      });
    }
    return cols;
  }, [db.staff.length, orderedStaffCols, effectiveFilterSpec, dayRdvs, staffIdSet, t]);

  const dayTimeSlots = useMemo<number[]>(() => {
    const set = new Set<number>();
    const h1Min = timeToMinutes(db.cab.h1 || '08:00');
    const h2Min = timeToMinutes(db.cab.h2 || '17:00');
    for (let m = h1Min; m + slotDur <= h2Min; m += slotDur) {
      set.add(m);
    }
    for (const r of dayRdvs) {
      set.add(timeToMinutes(r.heure));
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [db.cab.h1, db.cab.h2, slotDur, dayRdvs]);

  // Weekly planning data
  const weekStart = useMemo(() => getMondayISO(selectedDate), [selectedDate]);
  const weekDaysAll = useMemo(
    () => Array.from({length: 7}, (_, idx) => addDaysISO(weekStart, idx)),
    [weekStart],
  );
  const weekEnd = weekDaysAll[6];

  const weekAllRdvs = useMemo(
    () =>
      db.rdv.filter((r) => {
        if (r.date < weekStart || r.date > weekEnd || r.statut === 'absent') return false;
        if (effectiveFilterTh !== '') return r.th === effectiveFilterTh;
        if (effectiveFilterSpec !== '') return filteredStaffIds.has(r.th);
        return true;
      }),
    [db.rdv, weekStart, weekEnd, effectiveFilterTh, effectiveFilterSpec, filteredStaffIds],
  );

  const weekColumns = useMemo<TherapistColumn[]>(() => {
    const cols: TherapistColumn[] = [...orderedStaffCols];
    const hasUnassigned =
      effectiveFilterSpec === '' && weekAllRdvs.some((r) => !r.th || !staffIdSet.has(r.th));
    if (hasUnassigned) {
      cols.push({
        id: '__unassigned__',
        nom: t('unassignedCol'),
        specialite: '',
        domainTarif: null,
        specKey: '__unassigned__',
        specLabel: t('unassignedCol'),
        tarif: null,
        isUnassigned: true,
      });
    }
    return cols;
  }, [orderedStaffCols, effectiveFilterSpec, weekAllRdvs, staffIdSet, t]);

  const weekDayRows = useMemo(() => {
    const hasSat = weekAllRdvs.some((r) => r.date === weekDaysAll[5]);
    const hasSun = weekAllRdvs.some((r) => r.date === weekDaysAll[6]);
    const cols = weekDaysAll.slice(0, 5);
    if (showWeekend || hasSat) cols.push(weekDaysAll[5]);
    if (showWeekend || hasSun) cols.push(weekDaysAll[6]);
    return cols;
  }, [weekAllRdvs, weekDaysAll, showWeekend]);

  const PrevIcon = lang === 'ar' ? ChevronRight : ChevronLeft;
  const NextIcon = lang === 'ar' ? ChevronLeft : ChevronRight;

  return (
    <div className="space-y-5">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onChangeDate(addDaysISO(selectedDate, effectiveMode === 'week' ? -7 : -1))}
            aria-label={effectiveMode === 'week' ? t('prevWeek') : t('prevDay')}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <PrevIcon className="h-5 w-5" />
          </button>

          <input
            type="date"
            aria-label={t('dateLabel')}
            value={selectedDate}
            onChange={(e) => e.target.value && onChangeDate(e.target.value)}
            className="min-h-11 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium tabular-nums"
          />

          <button
            type="button"
            onClick={() => onChangeDate(addDaysISO(selectedDate, effectiveMode === 'week' ? 7 : 1))}
            aria-label={effectiveMode === 'week' ? t('nextWeek') : t('nextDay')}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <NextIcon className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => onChangeDate(today)}
            className="min-h-11 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            {t('today')}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenTherapists}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Users className="h-4 w-4" />
            <span>{t('manageTherapistsBtn')}</span>
          </button>

          {hasSpecialties && db.staff.length > 0 && (
            <select
              aria-label={t('domainLabel')}
              value={effectiveFilterSpec}
              onChange={(e) => {
                setFilterSpec(e.target.value);
                setFilterTh('');
              }}
              className="min-h-11 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="">{t('allDomains')}</option>
              {specialtyGroups.map((grp) => (
                <option key={grp.key} value={grp.key}>
                  {grp.label} ({grp.members.length})
                  {grp.tarif !== null ? ` · ${formatCurrency(grp.tarif, lang)}` : ''}
                </option>
              ))}
            </select>
          )}

          {db.staff.length > 0 && (
            <select
              aria-label={t('therapistLabel')}
              value={effectiveFilterTh}
              onChange={(e) => setFilterTh(e.target.value)}
              className="min-h-11 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="">{t('allTherapists')}</option>
              {!effectiveFilterSpec && hasSpecialties
                ? specialtyGroups.map((grp) => (
                    <optgroup
                      key={grp.key}
                      label={
                        grp.tarif !== null
                          ? `${grp.label} — ${formatCurrency(grp.tarif, lang)}`
                          : grp.label
                      }
                    >
                      {grp.members.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.nom} — {formatCurrency(getStaffTarif(db, st.id), lang)}
                        </option>
                      ))}
                    </optgroup>
                  ))
                : filteredStaff.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.nom} — {formatCurrency(getStaffTarif(db, st.id), lang)}
                    </option>
                  ))}
            </select>
          )}

          {db.staff.length > 0 && (
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-1">
              <button
                type="button"
                onClick={() => setMode('day')}
                className={`min-h-9 rounded-md px-3 py-1 text-sm font-medium transition-colors whitespace-nowrap ${
                  effectiveMode === 'day'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {t('dayView')}
              </button>
              <button
                type="button"
                onClick={() => setMode('week')}
                className={`min-h-9 rounded-md px-3 py-1 text-sm font-medium transition-colors whitespace-nowrap ${
                  effectiveMode === 'week'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {t('weeklyPlanning')}
              </button>
            </div>
          )}

          {effectiveMode === 'week' && db.staff.length > 0 && (
            <>
              <label className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs sm:text-sm font-medium cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={showWeekend}
                  onChange={(e) => setShowWeekend(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span>{t('showWeekendLabel')}</span>
              </label>

              <button
                type="button"
                onClick={() => onPrintPlanning(weekStart, effectiveFilterTh || undefined)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg accent-bg px-3.5 py-2 text-sm font-semibold whitespace-nowrap"
              >
                <Printer className="h-4 w-4" />
                <span>{t('printPlanning')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {effectiveMode === 'day' ? (
        <>
          {/* Heading & Summary Strip */}
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight capitalize">
              {formatDateLong(selectedDate, lang)}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 tabular-nums">
              <span>
                <strong className="text-slate-900 dark:text-slate-100">{daySessionsCount}</strong>{' '}
                {daySessionsCount === 1 ? t('sessionSingular') : t('sessionsCount')}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {t('collectedMonth')} :{' '}
                <strong className="text-slate-900 dark:text-slate-100">
                  {formatCurrency(collectedMonth, lang)}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {t('totalOwed')} :{' '}
                <strong
                  className={
                    owedTotal > 0
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-slate-900 dark:text-slate-100'
                  }
                >
                  {formatCurrency(owedTotal, lang)}
                </strong>
              </span>
            </div>
          </div>

          {/* Tomorrow reminders box */}
          {tomorrowReminders.length > 0 && (
            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center gap-2 text-sm font-bold mb-3">
                <MessageCircle className="h-4 w-4 accent-text" />
                <h2>
                  {t('remindTomorrowTitle')} ({tomorrowReminders.length})
                </h2>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {tomorrowReminders.map((r) => {
                  const pat = db.patients.find((p) => p.id === r.pid);
                  const sent = isReminderSentForRdv(r);
                  return (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="font-semibold tabular-nums">{r.heure}</span>
                        <span className="font-medium">{pat?.nom ?? ''}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          {pat?.tel || t('none')}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onSendWhatsApp(r)}
                        className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                          sent
                            ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span>{sent ? t('reminderSent') : t('remindBtn')}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Day View: Therapists-in-Columns when All Therapists is active, otherwise single timeline */}
          {effectiveFilterTh === '' && db.staff.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <table className="w-full border-collapse text-xs">
                <thead>
                  {hasSpecialties && (
                    <tr className="bg-slate-100/80 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                      <th
                        rowSpan={2}
                        className="sticky start-0 z-10 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-start font-semibold w-20 border-e border-slate-200 dark:border-slate-800 align-middle"
                      >
                        {t('timeLabel')}
                      </th>
                      {(() => {
                        const spans: {
                          key: string;
                          label: string;
                          tarif: number | null;
                          count: number;
                        }[] = [];
                        for (const col of dayColumns) {
                          const last = spans[spans.length - 1];
                          if (last && last.key === col.specKey) {
                            last.count += 1;
                          } else {
                            spans.push({
                              key: col.specKey,
                              label: col.specLabel,
                              tarif: col.domainTarif,
                              count: 1,
                            });
                          }
                        }
                        return spans.map((sp) => (
                          <th
                            key={sp.key}
                            colSpan={sp.count}
                            className="px-3 py-1.5 text-start text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200 border-e last:border-e-0 border-slate-200 dark:border-slate-800"
                          >
                            <span>{sp.label}</span>
                            {sp.tarif !== null && (
                              <span className="ms-1.5 font-semibold text-emerald-700 dark:text-emerald-300 normal-case tabular-nums">
                                · {formatCurrency(sp.tarif, lang)}
                              </span>
                            )}
                          </th>
                        ));
                      })()}
                    </tr>
                  )}
                  <tr className="bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800">
                    {!hasSpecialties && (
                      <th className="sticky start-0 z-10 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-start font-semibold w-20 border-e border-slate-200 dark:border-slate-800">
                        {t('timeLabel')}
                      </th>
                    )}
                    {dayColumns.map((col) => {
                      const colCount = dayRdvs.filter((r) =>
                        col.isUnassigned
                          ? (!r.th || !staffIdSet.has(r.th)) && r.statut !== 'absent'
                          : r.th === col.id && r.statut !== 'absent',
                      ).length;
                      return (
                        <th
                          key={col.id}
                          className="px-3 py-2.5 text-start font-semibold min-w-[200px] border-e last:border-e-0 border-slate-200 dark:border-slate-800 align-top"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-bold truncate">{col.nom}</div>
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-normal text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                                {col.tarif !== null && (
                                  <span className="rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 px-1.5 py-0.5 font-semibold">
                                    {formatCurrency(col.tarif, lang)}
                                  </span>
                                )}
                                <span>
                                  {colCount} {colCount === 1 ? t('sessionSingular') : t('sessionsCount')}
                                </span>
                              </div>
                            </div>
                            {!col.isUnassigned && (
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenRdv(null, {
                                    date: selectedDate,
                                    th: col.id,
                                    domainId: col.domainId,
                                  })
                                }
                                title={`${t('newAppointment')} — ${col.nom}`}
                                aria-label={`${t('newAppointment')} — ${col.nom}`}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {dayTimeSlots.length === 0 ? (
                    <tr>
                      <td
                        colSpan={dayColumns.length + 1}
                        className="px-4 py-12 text-center text-slate-500 dark:text-slate-400"
                      >
                        {t('noAppointmentsDay')}
                      </td>
                    </tr>
                  ) : (
                    dayTimeSlots.map((slotMin, rowIdx) => {
                      const slotTime = minutesToTime(slotMin);
                      const nextSlotMin =
                        rowIdx + 1 < dayTimeSlots.length
                          ? dayTimeSlots[rowIdx + 1]
                          : slotMin + slotDur;
                      const slotIsNow =
                        isToday && nowMinutes >= slotMin && nowMinutes < nextSlotMin;

                      return (
                        <tr
                          key={slotMin}
                          className={slotIsNow ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''}
                        >
                          <td
                            className={`sticky start-0 z-10 px-3 py-2 font-semibold tabular-nums align-top border-e border-slate-200 dark:border-slate-800 ${
                              slotIsNow
                                ? 'bg-blue-50 dark:bg-blue-950/80 accent-text'
                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            <div>{slotTime}</div>
                            {slotIsNow && (
                              <div className="text-[10px] font-semibold accent-text mt-0.5">
                                {t('nowIndicator')}
                              </div>
                            )}
                          </td>
                          {dayColumns.map((col) => {
                            const colDayRdvs = dayRdvs.filter((r) =>
                              col.isUnassigned ? !r.th || !staffIdSet.has(r.th) : r.th === col.id,
                            );
                            const cellRdvs = colDayRdvs.filter((r) => {
                              const rMin = timeToMinutes(r.heure);
                              return rMin >= slotMin && rMin < nextSlotMin;
                            });
                            const activeOverlap = colDayRdvs.some((r) => {
                              if (r.statut === 'absent') return false;
                              const rStart = timeToMinutes(r.heure);
                              const rEnd = rStart + r.dur;
                              return slotMin < rEnd && rStart < slotMin + slotDur;
                            });

                            return (
                              <td
                                key={col.id}
                                className="px-2 py-1.5 align-top border-e last:border-e-0 border-slate-200 dark:border-slate-800"
                              >
                                <div className="space-y-1.5">
                                  {cellRdvs.map((rdv) => {
                                    const patName = getPatientName(db, rdv.pid);
                                    const endTime = minutesToTime(timeToMinutes(rdv.heure) + rdv.dur);
                                    const sent = isReminderSentForRdv(rdv);
                                    const statusStyle =
                                      rdv.statut === 'fait'
                                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                        : rdv.statut === 'absent'
                                          ? 'bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';

                                    return (
                                      <div
                                        key={rdv.id}
                                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-800/70 p-2 space-y-1.5"
                                      >
                                        <button
                                          type="button"
                                          onClick={() => onOpenRdv(rdv)}
                                          className="block w-full text-start hover:opacity-85 transition-opacity"
                                        >
                                          <div className="flex items-center justify-between gap-1.5">
                                            <span className="font-bold tabular-nums">
                                              {rdv.heure}–{endTime}
                                            </span>
                                            <span
                                              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusStyle}`}
                                            >
                                              {t(`statut_${rdv.statut}`)}
                                            </span>
                                          </div>
                                          <div className="text-xs font-semibold truncate mt-0.5">
                                            {patName}
                                          </div>
                                          {(rdv.kind === 'diag' || rdv.note) && (
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                              {[
                                                rdv.kind === 'diag' ? t('kind_diag') : '',
                                                rdv.note ? rdv.note.slice(0, 60) : '',
                                              ]
                                                .filter(Boolean)
                                                .join(' · ')}
                                            </div>
                                          )}
                                        </button>

                                        {rdv.statut === 'prevu' && (
                                          <div className="flex items-center gap-1 pt-0.5">
                                            <button
                                              type="button"
                                              onClick={() => onSendWhatsApp(rdv)}
                                              title={sent ? t('reminderSent') : t('remindBtn')}
                                              aria-label={sent ? t('reminderSent') : t('remindBtn')}
                                              className={`inline-flex h-8 w-8 items-center justify-center rounded border text-xs ${
                                                sent
                                                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                                                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700'
                                              }`}
                                            >
                                              <MessageCircle className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => onQuickStatus(rdv.id, 'fait')}
                                              title={t('markDoneBtn')}
                                              aria-label={t('markDoneBtn')}
                                              className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-2 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 whitespace-nowrap"
                                            >
                                              <Check className="h-3 w-3" />
                                              <span>{t('markDoneBtn')}</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => onQuickStatus(rdv.id, 'absent')}
                                              title={t('markAbsentBtn')}
                                              aria-label={t('markAbsentBtn')}
                                              className="inline-flex h-8 w-8 items-center justify-center rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50"
                                            >
                                              <UserX className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}

                                  {!activeOverlap && !col.isUnassigned && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onOpenRdv(null, {
                                          date: selectedDate,
                                          heure: slotTime,
                                          dur: slotDur,
                                          th: col.id,
                                          domainId: col.domainId,
                                        })
                                      }
                                      className="flex w-full min-h-8 items-center justify-center gap-1 rounded-md border border-dashed border-slate-200 dark:border-slate-800 px-2 py-1 text-[11px] text-slate-400 dark:text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                                    >
                                      <Plus className="h-3 w-3" />
                                      <span>{t('freeSlot')}</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* Single-therapist Day Timeline */
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              {timelineRows.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <CalendarIcon className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    {t('noAppointmentsDay')}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenRdv(null, {date: selectedDate, th: effectiveFilterTh || undefined})
                    }
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg accent-bg px-4 py-2 text-sm font-semibold"
                  >
                    <Plus className="h-4 w-4" />
                    <span>{t('newAppointment')}</span>
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {timelineRows.map((row, idx) => {
                    if (row.type === 'free') {
                      return (
                        <button
                          key={`free-${row.heure}-${idx}`}
                          type="button"
                          onClick={() =>
                            onOpenRdv(null, {
                              date: selectedDate,
                              heure: row.heure,
                              dur: row.dur,
                              th: effectiveFilterTh || undefined,
                            })
                          }
                          className={`flex w-full items-center justify-between gap-4 px-4 py-2.5 text-start transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                            row.isNow ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <span className="w-24 text-xs font-medium text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
                              {row.heure} · {row.dur}m
                            </span>
                            <span className="text-xs text-slate-400 dark:text-slate-500 italic">
                              {t('freeSlot')}
                            </span>
                          </div>
                          {row.isNow && (
                            <span className="text-xs font-semibold accent-text whitespace-nowrap">
                              {t('nowIndicator')}
                            </span>
                          )}
                        </button>
                      );
                    }

                    const {rdv} = row;
                    const patName = getPatientName(db, rdv.pid);
                    const thName = effectiveFilterTh === '' ? getStaffName(db, rdv.th) : '';
                    const subParts: string[] = [];
                    if (rdv.kind === 'diag') subParts.push(t('kind_diag'));
                    if (thName) subParts.push(thName);
                    if (rdv.note) subParts.push(rdv.note.slice(0, 90));
                    const sent = isReminderSentForRdv(rdv);

                    const statusStyle =
                      rdv.statut === 'fait'
                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : rdv.statut === 'absent'
                          ? 'bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';

                    return (
                      <div
                        key={rdv.id}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                          row.isNow ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenRdv(rdv)}
                          className="flex-1 min-w-0 text-start flex items-start sm:items-center gap-4"
                        >
                          <div className="w-24 shrink-0">
                            <div className="text-sm font-bold tabular-nums">{rdv.heure}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                              {rdv.dur} min
                            </div>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold truncate">{patName}</span>
                              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusStyle}`}>
                                {t(`statut_${rdv.statut}`)}
                              </span>
                              {row.isNow && (
                                <span className="text-xs font-semibold accent-text">
                                  · {t('nowIndicator')}
                                </span>
                              )}
                            </div>
                            {subParts.length > 0 && (
                              <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                {subParts.join(' · ')}
                              </div>
                            )}
                          </div>
                        </button>

                        {rdv.statut === 'prevu' && (
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => onSendWhatsApp(rdv)}
                              className={`inline-flex min-h-10 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                                sent
                                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'
                              }`}
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              <span>{sent ? t('reminderSent') : t('remindBtn')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onQuickStatus(rdv.id, 'fait')}
                              className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 whitespace-nowrap"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>{t('markDoneBtn')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onQuickStatus(rdv.id, 'absent')}
                              className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-2.5 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 whitespace-nowrap"
                            >
                              <UserX className="h-3.5 w-3.5" />
                              <span>{t('markAbsentBtn')}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Floating + button */}
          <button
            type="button"
            onClick={() => onOpenRdv(null, {date: selectedDate, th: effectiveFilterTh || undefined})}
            aria-label={t('newAppointment')}
            className="fixed bottom-20 sm:bottom-6 end-5 z-30 inline-flex h-13 w-13 items-center justify-center rounded-xl accent-bg shadow-lg transition-transform active:scale-95 no-print"
          >
            <Plus className="h-6 w-6" />
          </button>
        </>
      ) : (
        /* Weekly Planning View */
        <div className="space-y-6">
          {db.staff.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">{t('noStaffPlanning')}</p>
              <button
                type="button"
                onClick={onOpenTherapists}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg accent-bg px-4 py-2 text-sm font-semibold"
              >
                <Users className="h-4 w-4" />
                <span>{t('manageTherapistsBtn')}</span>
              </button>
            </div>
          ) : effectiveFilterTh === '' ? (
            /* All Therapists in Columns (Jour × Therapists) */
            <section className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-bold">
                  {t('weeklyPlanning')} — {t('allTherapists')}
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {t('weekRangePrefix')} {formatDateShort(weekStart, lang)} {t('weekRangeTo')}{' '}
                  {formatDateShort(weekEnd, lang)} · {weekAllRdvs.length} {t('sessionsCount')}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    {hasSpecialties && (
                      <tr className="bg-slate-100/80 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                        <th
                          rowSpan={2}
                          className="sticky start-0 z-10 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-start font-semibold w-32 border-e border-slate-200 dark:border-slate-800 align-middle"
                        >
                          {t('colDate')}
                        </th>
                        {(() => {
                          const spans: {
                            key: string;
                            label: string;
                            tarif: number | null;
                            count: number;
                          }[] = [];
                          for (const col of weekColumns) {
                            const last = spans[spans.length - 1];
                            if (last && last.key === col.specKey) {
                              last.count += 1;
                            } else {
                              spans.push({
                                key: col.specKey,
                                label: col.specLabel,
                                tarif: col.domainTarif,
                                count: 1,
                              });
                            }
                          }
                          return spans.map((sp) => (
                            <th
                              key={sp.key}
                              colSpan={sp.count}
                              className="px-3 py-1.5 text-start text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200 border-e last:border-e-0 border-slate-200 dark:border-slate-800"
                            >
                              <span>{sp.label}</span>
                              {sp.tarif !== null && (
                                <span className="ms-1.5 font-semibold text-emerald-700 dark:text-emerald-300 normal-case tabular-nums">
                                  · {formatCurrency(sp.tarif, lang)}
                                </span>
                              )}
                            </th>
                          ));
                        })()}
                      </tr>
                    )}
                    <tr className="bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800">
                      {!hasSpecialties && (
                        <th className="sticky start-0 z-10 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-start font-semibold w-32 border-e border-slate-200 dark:border-slate-800">
                          {t('colDate')}
                        </th>
                      )}
                      {weekColumns.map((col) => {
                        const colTotal = weekAllRdvs.filter((r) =>
                          col.isUnassigned ? !r.th || !staffIdSet.has(r.th) : r.th === col.id,
                        ).length;
                        return (
                          <th
                            key={col.id}
                            className="px-3 py-2.5 text-start font-semibold min-w-[200px] border-e last:border-e-0 border-slate-200 dark:border-slate-800 align-top"
                          >
                            <div className="space-y-1.5">
                              <div>
                                <div className="text-sm font-bold truncate">{col.nom}</div>
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-normal text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                                  {col.tarif !== null && (
                                    <span className="rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 px-1.5 py-0.5 font-semibold">
                                      {formatCurrency(col.tarif, lang)}
                                    </span>
                                  )}
                                  <span>
                                    {colTotal} {t('sessionsCount')}
                                  </span>
                                </div>
                              </div>
                              {!col.isUnassigned && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenRdv(null, {
                                      date: weekStart,
                                      th: col.id,
                                      domainId: col.domainId,
                                      repeatWeekly: true,
                                    })
                                  }
                                  className="inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 whitespace-nowrap"
                                >
                                  <CalendarPlus className="h-3.5 w-3.5" />
                                  <span>{t('addPlanningBtn')}</span>
                                </button>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {weekDayRows.map((d) => {
                      const isTodayRow = d === today;
                      return (
                        <tr
                          key={d}
                          className={isTodayRow ? 'bg-blue-50/40 dark:bg-blue-950/15' : ''}
                        >
                          <td
                            className={`sticky start-0 z-10 px-3 py-2.5 font-semibold align-top border-e border-slate-200 dark:border-slate-800 capitalize ${
                              isTodayRow
                                ? 'bg-blue-50 dark:bg-blue-950/80 accent-text'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {formatDayMonth(d, lang)}
                          </td>
                          {weekColumns.map((col) => {
                            const cellRdvs = weekAllRdvs
                              .filter((r) =>
                                col.isUnassigned
                                  ? r.date === d && (!r.th || !staffIdSet.has(r.th))
                                  : r.date === d && r.th === col.id,
                              )
                              .sort((a, b) => a.heure.localeCompare(b.heure));

                            return (
                              <td
                                key={col.id}
                                className="px-2 py-2 align-top border-e last:border-e-0 border-slate-200 dark:border-slate-800"
                              >
                                <div className="space-y-1.5">
                                  {cellRdvs.map((r) => {
                                    const patName = getPatientName(db, r.pid);
                                    const endTime = minutesToTime(timeToMinutes(r.heure) + r.dur);
                                    return (
                                      <button
                                        key={r.id}
                                        type="button"
                                        onClick={() => onOpenRdv(r)}
                                        className={`block w-full rounded-md border px-2 py-1 text-start transition-colors ${
                                          r.statut === 'fait'
                                            ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30 hover:border-emerald-500'
                                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:border-blue-500'
                                        } ${r.kind === 'diag' ? 'italic' : ''}`}
                                      >
                                        <div className="tabular-nums font-semibold">
                                          {r.heure}–{endTime}
                                        </div>
                                        <div className="truncate">{patName}</div>
                                        {r.kind === 'diag' && (
                                          <span className="inline-block mt-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                                            {t('kind_diag')}
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}

                                  {!col.isUnassigned && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onOpenRdv(null, {
                                          date: d,
                                          th: col.id,
                                          domainId: col.domainId,
                                        })
                                      }
                                      className="flex w-full min-h-7 items-center justify-center gap-1 rounded border border-dashed border-slate-200 dark:border-slate-800 px-2 py-1 text-[11px] text-slate-400 dark:text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                                    >
                                      <Plus className="h-3 w-3" />
                                      <span>{t('addSlotShort')}</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            /* Single-Therapist Focused Weekly Planning (Heure × Jours) */
            (() => {
              const selectedStaff = db.staff.find((s) => s.id === effectiveFilterTh) ?? db.staff[0];
              const selectedDom = getStaffDomain(db.domains, selectedStaff);
              const staffRdvs = weekAllRdvs.filter((r) => r.th === selectedStaff.id);
              const slotTimes = Array.from(new Set(staffRdvs.map((r) => r.heure))).sort();

              return (
                <section className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold">
                        {t('planningHeader')} : {selectedStaff.nom}
                      </h2>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                        {(selectedDom?.name || selectedStaff.specialite) && (
                          <span>{selectedDom?.name || selectedStaff.specialite} ·</span>
                        )}
                        <span className="rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 px-1.5 py-0.5 font-semibold">
                          {formatCurrency(getStaffTarif(db, selectedStaff.id), lang)}
                        </span>
                        <span>·</span>
                        <span>
                          {t('weekRangePrefix')} {formatDateShort(weekStart, lang)} {t('weekRangeTo')}{' '}
                          {formatDateShort(weekEnd, lang)} · {staffRdvs.length} {t('sessionsCount')}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        onOpenRdv(null, {
                          date: weekStart,
                          th: selectedStaff.id,
                          repeatWeekly: true,
                        })
                      }
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 whitespace-nowrap"
                    >
                      <CalendarPlus className="h-4 w-4" />
                      <span>{t('addPlanningBtn')}</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800">
                          <th className="px-3 py-2 text-start font-semibold w-20">{t('timeLabel')}</th>
                          {weekDayRows.map((d) => (
                            <th key={d} className="px-3 py-2 text-start font-semibold min-w-[140px]">
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="capitalize">{formatDayMonth(d, lang)}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenRdv(null, {date: d, th: selectedStaff.id})
                                  }
                                  title={`${t('newAppointment')} — ${formatDayMonth(d, lang)}`}
                                  aria-label={`${t('newAppointment')} — ${formatDayMonth(d, lang)}`}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {slotTimes.length === 0 ? (
                          <tr>
                            <td
                              colSpan={weekDayRows.length + 1}
                              className="px-4 py-8 text-center text-slate-500 dark:text-slate-400"
                            >
                              {t('noAppointmentsDay')}
                            </td>
                          </tr>
                        ) : (
                          slotTimes.map((heure) => (
                            <tr key={heure}>
                              <td className="px-3 py-2 font-semibold tabular-nums align-top text-slate-600 dark:text-slate-300">
                                {heure}
                              </td>
                              {weekDayRows.map((d) => {
                                const cellRdvs = staffRdvs.filter(
                                  (r) => r.date === d && r.heure === heure,
                                );
                                return (
                                  <td key={d} className="px-2 py-1.5 align-top">
                                    <div className="space-y-1">
                                      {cellRdvs.map((r) => {
                                        const patName = getPatientName(db, r.pid);
                                        const endTime = minutesToTime(
                                          timeToMinutes(r.heure) + r.dur,
                                        );
                                        return (
                                          <button
                                            key={r.id}
                                            type="button"
                                            onClick={() => onOpenRdv(r)}
                                            className={`block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-2 py-1 text-start hover:border-blue-500 transition-colors ${
                                              r.kind === 'diag' ? 'italic' : ''
                                            }`}
                                          >
                                            <div className="tabular-nums font-semibold">
                                              {r.heure}–{endTime}
                                            </div>
                                            <div className="truncate">{patName}</div>
                                            {r.kind === 'diag' && (
                                              <span className="inline-block mt-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                                                {t('kind_diag')}
                                              </span>
                                            )}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
};
