import React, {useEffect, useMemo, useState} from 'react';
import {Plus, Trash2} from 'lucide-react';
import {Modal} from '../components/Modal';
import type {TranslationKey} from '../i18n';
import {todayISO} from '../storage';
import type {Lang, Patient, Rdv} from '../types';
import {formatCurrency, formatDateShort, rdvBilledAmount, rdvPaidTotal} from '../utils';

interface VersementDialogProps {
  open: boolean;
  patient: Patient | null;
  scopeLabel: string;
  sessions: Rdv[];
  lang: Lang;
  onClose: () => void;
  onAddVersement: (targetRdvIds: string[], amount: number, payDate: string) => void;
  onRemoveVersement: (rdvId: string, payIndex: number) => void;
  onOpenRdv: (rdv: Rdv) => void;
  t: (key: TranslationKey) => string;
}

interface FlattenedVersement {
  rdv: Rdv;
  payIndex: number;
  date: string;
  amount: number;
}

export const VersementDialog: React.FC<VersementDialogProps> = ({
  open,
  patient,
  scopeLabel,
  sessions,
  lang,
  onClose,
  onAddVersement,
  onRemoveVersement,
  onOpenRdv,
  t,
}) => {
  const orderedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => `${a.date} ${a.heure}`.localeCompare(`${b.date} ${b.heure}`)),
    [sessions],
  );

  const stats = useMemo(() => {
    let billed = 0;
    let plannedTarif = 0;
    let paid = 0;
    for (const r of orderedSessions) {
      billed += rdvBilledAmount(r);
      if (r.statut === 'prevu') plannedTarif += r.tarif;
      paid += rdvPaidTotal(r);
    }
    const remaining = billed - paid;
    const totalExpected = billed + plannedTarif;
    const plannedRemaining = Math.max(0, totalExpected - paid);
    return {billed, plannedTarif, paid, remaining, plannedRemaining};
  }, [orderedSessions]);

  const versements = useMemo<FlattenedVersement[]>(() => {
    const items: FlattenedVersement[] = [];
    for (const r of orderedSessions) {
      r.pay.forEach((p, idx) => {
        items.push({rdv: r, payIndex: idx, date: p.d, amount: p.m});
      });
    }
    items.sort((a, b) => {
      const dCmp = b.date.localeCompare(a.date);
      if (dCmp !== 0) return dCmp;
      return `${b.rdv.date} ${b.rdv.heure}`.localeCompare(`${a.rdv.date} ${a.rdv.heure}`);
    });
    return items;
  }, [orderedSessions]);

  const defaultAmount =
    stats.remaining > 0
      ? stats.remaining
      : stats.plannedRemaining > 0
        ? stats.plannedRemaining
        : 0;

  const [amountInput, setAmountInput] = useState<string>(
    defaultAmount > 0 ? String(Math.round(defaultAmount)) : '',
  );
  const [dateInput, setDateInput] = useState<string>(todayISO());

  useEffect(() => {
    if (open) {
      const nextDefault =
        stats.remaining > 0
          ? stats.remaining
          : stats.plannedRemaining > 0
            ? stats.plannedRemaining
            : 0;
      setAmountInput(nextDefault > 0 ? String(Math.round(nextDefault)) : '');
      setDateInput(todayISO());
    }
  }, [open, patient?.id, scopeLabel, stats.remaining, stats.plannedRemaining]);

  const parsedAmount = Math.round(Number(amountInput));
  const canSubmit =
    orderedSessions.length > 0 && Number.isFinite(parsedAmount) && parsedAmount > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onAddVersement(
      orderedSessions.map((r) => r.id),
      parsedAmount,
      dateInput || todayISO(),
    );
  };

  if (!patient) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${t('versementDialogTitle')} — ${patient.nom}`}
      t={t}
      maxWidthClass="max-w-xl"
      footer={
        <div className="flex w-full items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            {t('close')}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Scope & Financial Summary */}
        <div className="space-y-3">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {scopeLabel} · {orderedSessions.length}{' '}
            {orderedSessions.length > 1 ? t('sessionsCount') : t('sessionSingular')}
          </div>

          <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
            <div className="px-3 py-2.5">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {t('totalBilled')}
              </div>
              <div className="mt-0.5 text-sm font-bold tabular-nums">
                {formatCurrency(stats.billed, lang)}
              </div>
              {stats.plannedTarif > 0 && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  + {formatCurrency(stats.plannedTarif, lang)} {t('versementPlannedBilledLabel').toLowerCase()}
                </div>
              )}
            </div>

            <div className="px-3 py-2.5">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {t('colPaid')}
              </div>
              <div className="mt-0.5 text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatCurrency(stats.paid, lang)}
              </div>
            </div>

            <div className="px-3 py-2.5">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {t('colRemaining')}
              </div>
              <div
                className={`mt-0.5 text-sm font-bold tabular-nums ${
                  stats.remaining > 0
                    ? 'text-rose-700 dark:text-rose-400'
                    : stats.remaining < 0
                      ? 'text-teal-700 dark:text-teal-400'
                      : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {stats.remaining < 0
                  ? `${t('creditLabel')} ${formatCurrency(Math.abs(stats.remaining), lang)}`
                  : formatCurrency(stats.remaining, lang)}
              </div>
            </div>
          </div>
        </div>

        {/* Add Versement Form */}
        {orderedSessions.length === 0 ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
            {t('versementNoSessionsScope')}
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">{t('addPaymentLabel')}</span>
              {(stats.remaining > 0 || stats.plannedRemaining > 0) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {stats.remaining > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setAmountInput(String(Math.round(stats.remaining)))}
                        className="rounded border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-medium hover:bg-slate-100 dark:hover:bg-slate-800 tabular-nums"
                      >
                        {t('versementQuickFull')} ({formatCurrency(stats.remaining, lang)})
                      </button>
                      {stats.remaining >= 200 && (
                        <button
                          type="button"
                          onClick={() => setAmountInput(String(Math.round(stats.remaining / 2)))}
                          className="rounded border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-medium hover:bg-slate-100 dark:hover:bg-slate-800 tabular-nums"
                        >
                          {t('versementQuickHalf')} ({formatCurrency(Math.round(stats.remaining / 2), lang)})
                        </button>
                      )}
                    </>
                  )}
                  {stats.plannedRemaining > 0 && stats.plannedRemaining !== stats.remaining && (
                    <button
                      type="button"
                      onClick={() => setAmountInput(String(Math.round(stats.plannedRemaining)))}
                      className="rounded border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-medium hover:bg-slate-100 dark:hover:bg-slate-800 tabular-nums"
                    >
                      {t('versementQuickPlanned')} ({formatCurrency(stats.plannedRemaining, lang)})
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-2.5">
              <div className="flex-1 min-w-[140px]">
                <label
                  htmlFor="vers-amt"
                  className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
                >
                  {t('versementAmountLabel')}
                </label>
                <input
                  id="vers-amt"
                  type="number"
                  min={1}
                  step={100}
                  required
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="0"
                  className="w-full min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm tabular-nums"
                />
              </div>

              <div>
                <label
                  htmlFor="vers-date"
                  className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
                >
                  {t('versementDateLabel')}
                </label>
                <input
                  id="vers-date"
                  type="date"
                  required
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  className="min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm tabular-nums"
                />
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg accent-bg px-4 py-2 text-sm font-semibold disabled:opacity-40 whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                <span>{t('addPaymentBtn')}</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('versementAllocationNote')}
            </p>
          </form>
        )}

        {/* Versements History */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t('versementHistoryTitle')}</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {versements.length}
            </span>
          </div>

          {versements.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
              {t('versementEmptyHistory')}
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
              {versements.map((v, idx) => (
                <li
                  key={`${v.rdv.id}-${v.payIndex}-${idx}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 tabular-nums">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(v.amount, lang)}
                      </span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                        ·
                      </span>
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        {formatDateShort(v.date, lang)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenRdv(v.rdv);
                      }}
                      className="text-[11px] text-slate-500 dark:text-slate-400 hover:underline tabular-nums mt-0.5 text-start"
                    >
                      {t('versementScopeSession')} : {formatDateShort(v.rdv.date, lang)} ·{' '}
                      {v.rdv.heure} · {t(`statut_${v.rdv.statut}`)}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveVersement(v.rdv.id, v.payIndex)}
                    className="inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 whitespace-nowrap"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{t('removePaymentBtn')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
};
