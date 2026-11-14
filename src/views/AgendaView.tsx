import React, {useMemo, useState} from 'react';
import {
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Plus,
  Printer,
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
  getStaffName,
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
  onPrintPlanning: (weekStart: string) => void;
  t: (key: TranslationKey) => string;
}

type AgendaMode = 'day' | 'week';

export const AgendaView: React.FC<AgendaViewProps> = ({
  db,
  selectedDate,
  onChangeDate,
  onOpenRdv,
  onQuickStatus,
  onSendWhatsApp,
  onPrintPlanning,
  t,
}) => {
  const lang = db.lang;
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  const [mode, setMode] = useState<AgendaMode>('day');
  const [filterTh, setFilterTh] = useState<string>('');

  const effectiveMode: AgendaMode = db.staff.length === 0 ? 'day' : mode;
  const currentMonth = today.slice(0, 7);

  // Filtered appointments for selected day
  const dayRdvs = useMemo(() => {
    return db.rdv
      .filter((r) => r.date === selectedDate && (filterTh === '' || r.th === filterTh))
      .sort((a, b) => a.heure.localeCompare(b.heure));
  }, [db.rdv, selectedDate, filterTh]);

  // Tomorrow reminders (only shown when viewing today)
  const tomorrowReminders = useMemo(() => {
    if (selectedDate !== today) return [];
    return db.rdv
      .filter(
        (r) =>
          r.date === tomorrow &&
          r.statut === 'prevu' &&
          (filterTh === '' || r.th === filterTh),
      )
      .sort((a, b) => a.heure.localeCompare(b.heure));
  }, [db.rdv, selectedDate, today, tomorrow, filterTh]);

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

  // Build combined timeline (appointments + free slots if single therapist selected or <2 therapists)
  type TimelineRow =
    | {type: 'rdv'; rdv: Rdv; startMin: number; isNow: boolean}
    | {type: 'free'; heure: string; dur: number; startMin: number; isNow: boolean};

  const timelineRows = useMemo<TimelineRow[]>(() => {
    const showFreeSlots = filterTh !== '' || db.staff.length < 2;
    const rows: TimelineRow[] = dayRdvs.map((r) => {
      const start = timeToMinutes(r.heure);
      const end = start + r.dur;
      const isNow = isToday && nowMinutes >= start && nowMinutes < end;
      return {type: 'rdv', rdv: r, startMin: start, isNow};
    });

    if (showFreeSlots) {
      const h1Min = timeToMinutes(db.cab.h1 || '08:00');
      const h2Min = timeToMinutes(db.cab.h2 || '17:00');
      const slotDur = Math.max(10, Math.min(120, Number(db.cab.dur) || 30));
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
    }

    rows.sort((a, b) => {
      if (a.startMin !== b.startMin) return a.startMin - b.startMin;
      return a.type === 'rdv' ? -1 : 1;
    });
    return rows;
  }, [dayRdvs, filterTh, db.staff.length, db.cab.h1, db.cab.h2, db.cab.dur, isToday, nowMinutes]);

  // Weekly planning data
  const weekStart = useMemo(() => getMondayISO(selectedDate), [selectedDate]);
  const weekDaysAll = useMemo(
    () => Array.from({length: 7}, (_, idx) => addDaysISO(weekStart, idx)),
    [weekStart],
  );
  const weekEnd = weekDaysAll[6];

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
          {db.staff.length > 0 && effectiveMode === 'day' && (
            <select
              aria-label={t('therapistLabel')}
              value={filterTh}
              onChange={(e) => setFilterTh(e.target.value)}
              className="min-h-11 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="">{t('allTherapists')}</option>
              {db.staff.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.nom}
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
            <button
              type="button"
              onClick={() => onPrintPlanning(weekStart)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg accent-bg px-3.5 py-2 text-sm font-semibold whitespace-nowrap"
            >
              <Printer className="h-4 w-4" />
              <span>{t('printPlanning')}</span>
            </button>
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

          {/* Day Timeline Table */}
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
                    onOpenRdv(null, {date: selectedDate, th: filterTh || undefined})
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
                            th: filterTh || undefined,
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
                  const thName = filterTh === '' ? getStaffName(db, rdv.th) : '';
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

          {/* Floating + button */}
          <button
            type="button"
            onClick={() => onOpenRdv(null, {date: selectedDate, th: filterTh || undefined})}
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
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center text-sm text-slate-600 dark:text-slate-400">
              {t('noStaffPlanning')}
            </div>
          ) : (
            db.staff.map((st) => {
              const staffRdvs = db.rdv.filter(
                (r) =>
                  r.th === st.id &&
                  r.date >= weekStart &&
                  r.date <= weekEnd &&
                  r.statut !== 'absent',
              );
              const hasSat = staffRdvs.some((r) => r.date === weekDaysAll[5]);
              const hasSun = staffRdvs.some((r) => r.date === weekDaysAll[6]);
              const cols = weekDaysAll.slice(0, 5);
              if (hasSat) cols.push(weekDaysAll[5]);
              if (hasSun) cols.push(weekDaysAll[6]);

              const slotTimes = Array.from(new Set(staffRdvs.map((r) => r.heure))).sort();

              return (
                <section
                  key={st.id}
                  className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                >
                  <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-base font-bold">
                      {t('planningHeader')} : {st.nom}
                    </h2>
                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {t('weekRangePrefix')} {formatDateShort(weekStart, lang)} {t('weekRangeTo')}{' '}
                      {formatDateShort(weekEnd, lang)} · {staffRdvs.length} {t('sessionsCount')}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800">
                          <th className="px-3 py-2 text-start font-semibold w-20">{t('timeLabel')}</th>
                          {cols.map((d) => (
                            <th key={d} className="px-3 py-2 text-start font-semibold min-w-[130px]">
                              {formatDayMonth(d, lang)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {slotTimes.length === 0 ? (
                          <tr>
                            <td
                              colSpan={cols.length + 1}
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
                              {cols.map((d) => {
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
            })
          )}
        </div>
      )}
    </div>
  );
};
