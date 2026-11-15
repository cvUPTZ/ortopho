import React, {useEffect, useMemo, useState} from 'react';
import {Plus, Printer, Receipt, Trash2} from 'lucide-react';
import {ConfirmDialog} from '../components/ConfirmDialog';
import {Modal} from '../components/Modal';
import type {TranslationKey} from '../i18n';
import {makeId, todayISO} from '../storage';
import type {DB, Rdv, RdvKind, RdvStatut} from '../types';
import {
  addDaysISO,
  formatCurrency,
  formatDateShort,
  getMondayISO,
  hasOverlap,
  parseISODateLocal,
  rdvPaidTotal,
  sortPatientsByName,
} from '../utils';

export interface RdvSeed {
  date?: string;
  heure?: string;
  th?: string;
  pid?: string;
  kind?: RdvKind;
  dur?: number;
  repeatWeekly?: boolean;
  weeksCount?: number;
}

interface RdvDialogProps {
  open: boolean;
  rdv: Rdv | null; // null = creating
  seed?: RdvSeed;
  db: DB;
  onClose: () => void;
  onSave: (rdvs: Rdv[], isNew: boolean) => void;
  onDelete: (rdvId: string) => void;
  onPrintReceipt: (rdv: Rdv) => void;
  onPrintReport: (rdv: Rdv) => void;
  onNotifyPaymentRemoved: (snapshot: DB) => void;
  onUpdateDbDirect: (nextDb: DB) => void;
  t: (key: TranslationKey) => string;
}

export const RdvDialog: React.FC<RdvDialogProps> = ({
  open,
  rdv,
  seed,
  db,
  onClose,
  onSave,
  onDelete,
  onPrintReceipt,
  onPrintReport,
  onNotifyPaymentRemoved,
  onUpdateDbDirect,
  t,
}) => {
  const isNew = !rdv;
  const lang = db.lang;

  const initialForm = useMemo<Rdv>(() => {
    if (rdv) {
      return {
        ...rdv,
        pay: rdv.pay.map((p) => ({...p})),
      };
    }
    const defaultDur = Number(db.cab.dur) || 30;
    const defaultTh = seed?.th ?? (db.staff.length === 1 ? db.staff[0].id : '');
    return {
      id: makeId('rdv'),
      pid: seed?.pid ?? '',
      date: seed?.date ?? todayISO(),
      heure: seed?.heure ?? '09:00',
      statut: 'prevu',
      tarif: db.tarif,
      pay: [],
      note: '',
      rno: '',
      kind: seed?.kind ?? 'suivi',
      th: defaultTh,
      dur: seed?.dur ?? defaultDur,
      rem: '',
    };
  }, [rdv, seed, db.cab.dur, db.staff, db.tarif]);

  const [form, setForm] = useState<Rdv>(initialForm);
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [weeksCount, setWeeksCount] = useState(4);
  const [repeatDays, setRepeatDays] = useState<number[]>(() => [
    parseISODateLocal(seed?.date ?? todayISO())?.getDay() ?? 1,
  ]);
  const [newPayAmount, setNewPayAmount] = useState<string>('');
  const [newPayDate, setNewPayDate] = useState<string>(todayISO());
  const [error, setError] = useState('');
  const [confirmOverlap, setConfirmOverlap] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initialForm);
      setRepeatWeekly(Boolean(seed?.repeatWeekly));
      setWeeksCount(seed?.weeksCount ?? 4);
      const initialDow = parseISODateLocal(initialForm.date)?.getDay() ?? 1;
      setRepeatDays([initialDow]);
      const paid = rdvPaidTotal(initialForm);
      const rem = Math.max(0, initialForm.tarif - paid);
      setNewPayAmount(rem > 0 ? String(rem) : '');
      setNewPayDate(todayISO());
      setError('');
      setConfirmOverlap(false);
      setConfirmDelete(false);
    }
  }, [open, initialForm, seed?.repeatWeekly, seed?.weeksCount]);

  const isDirty = useMemo(() => {
    return (
      JSON.stringify(form) !== JSON.stringify(initialForm) ||
      (isNew && repeatWeekly && !seed?.repeatWeekly)
    );
  }, [form, initialForm, isNew, repeatWeekly, seed?.repeatWeekly]);

  const sortedPatients = useMemo(() => sortPatientsByName(db.patients, lang), [db.patients, lang]);

  const paidTotal = rdvPaidTotal(form);
  const remaining = form.tarif - paidTotal;

  const handleAddPayment = () => {
    const amount = Number(newPayAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const dateVal = newPayDate || todayISO();
    const updatedPay = [...form.pay, {d: dateVal, m: Math.round(amount)}];
    const nextForm = {...form, pay: updatedPay};
    setForm(nextForm);
    const nextRem = Math.max(0, nextForm.tarif - rdvPaidTotal(nextForm));
    setNewPayAmount(nextRem > 0 ? String(nextRem) : '');
  };

  const handleRemovePayment = (idx: number) => {
    // If editing an existing rdv, allow immediate undo toast by snapshotting db before mutation
    if (!isNew && rdv) {
      const snapshot = structuredClone(db);
      const updatedPay = form.pay.filter((_, i) => i !== idx);
      const nextForm = {...form, pay: updatedPay};
      setForm(nextForm);
      const nextDb: DB = {
        ...db,
        rdv: db.rdv.map((r) => (r.id === rdv.id ? nextForm : r)),
      };
      onUpdateDbDirect(nextDb);
      onNotifyPaymentRemoved(snapshot);
    } else {
      setForm((prev) => ({
        ...prev,
        pay: prev.pay.filter((_, i) => i !== idx),
      }));
    }
  };

  const buildRdvsToSave = (): Rdv[] => {
    const cleanBase: Rdv = {
      ...form,
      dur: Math.min(240, Math.max(5, Math.round(Number(form.dur) || 30))),
      tarif: Math.max(0, Math.round(Number(form.tarif) || 0)),
      note: form.note.slice(0, 10000),
    };
    if (!isNew || !repeatWeekly) {
      return [cleanBase];
    }
    const count = Math.min(52, Math.max(1, Math.round(weeksCount) || 1));
    const orderedWeekdays = [1, 2, 3, 4, 5, 6, 0];
    const selectedDays = orderedWeekdays.filter((d) => repeatDays.includes(d));
    const fallbackDow = parseISODateLocal(cleanBase.date)?.getDay() ?? 1;
    const activeDays = selectedDays.length > 0 ? selectedDays : [fallbackDow];

    const week0Monday = getMondayISO(cleanBase.date);
    const dateSet = new Set<string>();
    for (let w = 0; w < count; w++) {
      for (const dow of activeDays) {
        const offsetFromMonday = dow === 0 ? 6 : dow - 1;
        let candidateDate = addDaysISO(week0Monday, w * 7 + offsetFromMonday);
        if (candidateDate < cleanBase.date) {
          candidateDate = addDaysISO(candidateDate, count * 7);
        }
        dateSet.add(candidateDate);
      }
    }

    const sortedDates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));
    return sortedDates.map((d, idx) => ({
      ...cleanBase,
      id: idx === 0 ? cleanBase.id : makeId('rdv'),
      date: d,
      pay: idx === 0 ? cleanBase.pay : [],
      rno: idx === 0 ? cleanBase.rno : '',
      rem: '',
    }));
  };

  const handleAttemptSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!form.pid) {
      setError(t('patientRequired'));
      return;
    }
    const list = buildRdvsToSave();
    const conflict = list.some((candidate) =>
      hasOverlap(db.rdv, {
        id: isNew ? undefined : candidate.id,
        date: candidate.date,
        heure: candidate.heure,
        dur: candidate.dur,
        th: candidate.th,
      }),
    );
    if (conflict) {
      setConfirmOverlap(true);
      return;
    }
    onSave(list, isNew);
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={isNew ? t('rdvDialogTitleNew') : t('rdvDialogTitleEdit')}
        t={t}
        isDirty={isDirty}
        maxWidthClass="max-w-2xl"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {!isNew && rdv && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-900 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/50 whitespace-nowrap"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>{t('delete')}</span>
                </button>
              )}
              {form.pid && (
                <>
                  <button
                    type="button"
                    onClick={() => onPrintReceipt(form)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                  >
                    <Receipt className="h-4 w-4" />
                    <span>{t('receiptBtn')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onPrintReport(form)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                  >
                    <Printer className="h-4 w-4" />
                    <span>{t('sessionReportPrintBtn')}</span>
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 ms-auto">
              <button
                type="button"
                onClick={onClose}
                className="min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={() => handleAttemptSave()}
                className="min-h-10 rounded-lg accent-bg px-4 py-2 text-sm font-semibold whitespace-nowrap"
              >
                {t('save')}
              </button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleAttemptSave} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="rdv-pid" className="block text-sm font-medium mb-1">
                {t('patientLabel')} *
              </label>
              <select
                id="rdv-pid"
                required
                value={form.pid}
                onChange={(e) => {
                  const pid = e.target.value;
                  const pat = db.patients.find((p) => p.id === pid);
                  setForm((prev) => ({
                    ...prev,
                    pid,
                    th: prev.th || pat?.th || '',
                  }));
                  if (error) setError('');
                }}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="">{t('selectPatientPlaceholder')}</option>
                {sortedPatients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="rdv-date" className="block text-sm font-medium mb-1">
                {t('dateLabel')}
              </label>
              <input
                id="rdv-date"
                type="date"
                required
                value={form.date}
                onChange={(e) => {
                  const nextDate = e.target.value;
                  setForm((prev) => ({...prev, date: nextDate}));
                  if (isNew) {
                    const parsedDow = parseISODateLocal(nextDate)?.getDay();
                    if (parsedDow !== undefined) {
                      setRepeatDays((prev) => (prev.length <= 1 ? [parsedDow] : prev));
                    }
                  }
                }}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="rdv-heure" className="block text-sm font-medium mb-1">
                {t('timeLabel')}
              </label>
              <input
                id="rdv-heure"
                type="time"
                required
                value={form.heure}
                onChange={(e) => setForm((prev) => ({...prev, heure: e.target.value}))}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="rdv-dur" className="block text-sm font-medium mb-1">
                {t('durationMinLabel')}
              </label>
              <input
                id="rdv-dur"
                type="number"
                min={5}
                max={240}
                value={form.dur}
                onChange={(e) => setForm((prev) => ({...prev, dur: Number(e.target.value)}))}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="rdv-tarif" className="block text-sm font-medium mb-1">
                {t('tariffLabel')}
              </label>
              <input
                id="rdv-tarif"
                type="number"
                min={0}
                step={100}
                value={form.tarif}
                onChange={(e) => setForm((prev) => ({...prev, tarif: Number(e.target.value)}))}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="rdv-statut" className="block text-sm font-medium mb-1">
                {t('statusLabel')}
              </label>
              <select
                id="rdv-statut"
                value={form.statut}
                onChange={(e) => setForm((prev) => ({...prev, statut: e.target.value as RdvStatut}))}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="prevu">{t('statut_prevu')}</option>
                <option value="fait">{t('statut_fait')}</option>
                <option value="absent">{t('statut_absent')}</option>
              </select>
            </div>

            <div>
              <label htmlFor="rdv-kind" className="block text-sm font-medium mb-1">
                {t('kindLabel')}
              </label>
              <select
                id="rdv-kind"
                value={form.kind}
                onChange={(e) => setForm((prev) => ({...prev, kind: e.target.value as RdvKind}))}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="suivi">{t('kind_suivi')}</option>
                <option value="diag">{t('kind_diag')}</option>
              </select>
            </div>

            {db.staff.length > 0 && (
              <div className="sm:col-span-2">
                <label htmlFor="rdv-th" className="block text-sm font-medium mb-1">
                  {t('therapistLabel')}
                </label>
                <select
                  id="rdv-th"
                  value={form.th}
                  onChange={(e) => setForm((prev) => ({...prev, th: e.target.value}))}
                  className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                >
                  <option value="">{t('unassigned')}</option>
                  {db.staff.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.nom}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {isNew && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-3 space-y-3">
              <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={repeatWeekly}
                  onChange={(e) => setRepeatWeekly(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span>{t('repeatWeeklyLabel')}</span>
              </label>
              {repeatWeekly && (
                <div className="space-y-3 ps-6">
                  <div>
                    <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                      {t('repeatDaysLabel')}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                        const selected = repeatDays.includes(dow);
                        return (
                          <button
                            key={dow}
                            type="button"
                            aria-pressed={selected}
                            onClick={() =>
                              setRepeatDays((prev) => {
                                if (prev.includes(dow)) {
                                  return prev.length > 1 ? prev.filter((d) => d !== dow) : prev;
                                }
                                return [...prev, dow];
                              })
                            }
                            className={`min-h-9 min-w-11 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                              selected
                                ? 'accent-bg border-transparent'
                                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            {t(`dayShort_${dow}` as TranslationKey)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label htmlFor="rdv-weeks" className="text-sm text-slate-600 dark:text-slate-300">
                      {t('weeksLabel')}
                    </label>
                    <input
                      id="rdv-weeks"
                      type="number"
                      min={1}
                      max={52}
                      value={weeksCount}
                      onChange={(e) => setWeeksCount(Number(e.target.value))}
                      className="w-24 min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm tabular-nums"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="rdv-note" className="block text-sm font-medium mb-1">
              {t('sessionReportLabel')}
            </label>
            <textarea
              id="rdv-note"
              rows={3}
              maxLength={10000}
              value={form.note}
              onChange={(e) => setForm((prev) => ({...prev, note: e.target.value}))}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold">{t('paymentsLabel')}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {t('paidLabel')} : {formatCurrency(paidTotal, lang)} · {t('remainingLabel')} :{' '}
                {remaining < 0
                  ? `${t('creditLabel')} ${formatCurrency(Math.abs(remaining), lang)}`
                  : formatCurrency(remaining, lang)}
              </span>
            </div>

            {form.pay.length > 0 && (
              <ul className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {form.pay.map((p, idx) => (
                  <li key={idx} className="flex items-center justify-between py-2 gap-2">
                    <span className="tabular-nums text-slate-700 dark:text-slate-300">
                      {formatDateShort(p.d, lang)} — <strong>{formatCurrency(p.m, lang)}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemovePayment(idx)}
                      className="min-h-9 rounded-md px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 whitespace-nowrap"
                    >
                      {t('removePaymentBtn')}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-end gap-2 pt-1">
              <div className="flex-1 min-w-[120px]">
                <label htmlFor="rdv-pay-amt" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  {t('addPaymentLabel')}
                </label>
                <input
                  id="rdv-pay-amt"
                  type="number"
                  min={0}
                  step={100}
                  value={newPayAmount}
                  onChange={(e) => setNewPayAmount(e.target.value)}
                  className="w-full min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="rdv-pay-date" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  {t('dateLabel')}
                </label>
                <input
                  id="rdv-pay-date"
                  type="date"
                  value={newPayDate}
                  onChange={(e) => setNewPayDate(e.target.value)}
                  className="min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm tabular-nums"
                />
              </div>
              <button
                type="button"
                onClick={handleAddPayment}
                className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3.5 py-2 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                <span>{t('addPaymentBtn')}</span>
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmOverlap}
        title={t('rdvDialogTitleNew')}
        message={t('overlapConfirm')}
        onConfirm={() => {
          setConfirmOverlap(false);
          onSave(buildRdvsToSave(), isNew);
        }}
        onCancel={() => setConfirmOverlap(false)}
        t={t}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={t('delete')}
        message={t('deleteRdvConfirm')}
        confirmLabel={t('delete')}
        danger
        onConfirm={() => {
          setConfirmDelete(false);
          if (rdv) onDelete(rdv.id);
        }}
        onCancel={() => setConfirmDelete(false)}
        t={t}
      />
    </>
  );
};
