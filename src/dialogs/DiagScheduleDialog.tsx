import React, {useEffect, useMemo, useState} from 'react';
import {ConfirmDialog} from '../components/ConfirmDialog';
import {Modal} from '../components/Modal';
import {TherapistSelectOptions} from '../components/TherapistSelectOptions';
import type {TranslationKey} from '../i18n';
import {makeId, todayISO} from '../storage';
import type {DB, Patient, Rdv} from '../types';
import {formatCurrency, getDomainTarif, getStaffDomain, getStaffTarif, hasOverlap} from '../utils';

interface DiagScheduleDialogProps {
  open: boolean;
  patient: Patient | null;
  db: DB;
  onClose: () => void;
  onConfirm: (patientId: string, rdv: Rdv) => void;
  t: (key: TranslationKey) => string;
}

export const DiagScheduleDialog: React.FC<DiagScheduleDialogProps> = ({
  open,
  patient,
  db,
  onClose,
  onConfirm,
  t,
}) => {
  const [domainId, setDomainId] = useState('');
  const [th, setTh] = useState('');
  const [date, setDate] = useState(todayISO());
  const [heure, setHeure] = useState('09:00');
  const [dur, setDur] = useState(60);
  const [tarif, setTarif] = useState(db.tarif);
  const [tarifManuallyEdited, setTarifManuallyEdited] = useState(false);
  const [confirmOverlap, setConfirmOverlap] = useState(false);

  useEffect(() => {
    if (open) {
      const initialTh = patient?.th || db.staff[0]?.id || '';
      const thDomId = initialTh
        ? getStaffDomain(db.domains, db.staff.find((s) => s.id === initialTh))?.id ?? ''
        : '';
      const initialDomId = thDomId || db.domains[0]?.id || '';
      setDomainId(initialDomId);
      setTh(initialTh);
      setDate(todayISO());
      setHeure('09:00');
      setDur(60);
      setTarif(
        initialTh
          ? getStaffTarif(db, initialTh)
          : initialDomId
            ? getDomainTarif(db, initialDomId)
            : db.tarif,
      );
      setTarifManuallyEdited(false);
      setConfirmOverlap(false);
    }
  }, [open, patient, db]);

  const isDirty = useMemo(() => {
    return open && (heure !== '09:00' || dur !== 60 || date !== todayISO());
  }, [open, heure, dur, date]);

  if (!patient) return null;

  const buildRdv = (): Rdv => ({
    id: makeId('rdv'),
    pid: patient.id,
    date,
    heure,
    statut: 'prevu',
    tarif: Math.max(0, Math.round(Number(tarif) || 0)),
    pay: [],
    note: '',
    rno: '',
    kind: 'diag',
    th,
    ...(domainId ? {domainId} : {}),
    dur: Math.min(240, Math.max(5, Math.round(dur) || 60)),
    rem: '',
  });

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cand = buildRdv();
    if (hasOverlap(db.rdv, {date: cand.date, heure: cand.heure, dur: cand.dur, th: cand.th})) {
      setConfirmOverlap(true);
      return;
    }
    onConfirm(patient.id, cand);
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`${t('diagDialogTitle')} — ${patient.nom}`}
        t={t}
        isDirty={isDirty}
        maxWidthClass="max-w-md"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium whitespace-nowrap"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={() => handleSubmit()}
              className="min-h-10 rounded-lg accent-bg px-4 py-2 text-sm font-semibold whitespace-nowrap"
            >
              {t('save')}
            </button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {db.domains.length > 0 && (
            <div>
              <label htmlFor="diag-domain" className="block text-sm font-medium mb-1">
                {t('domainLabel')}
              </label>
              <select
                id="diag-domain"
                value={domainId}
                onChange={(e) => {
                  const nextDomId = e.target.value;
                  setDomainId(nextDomId);
                  const domainStaff = nextDomId
                    ? db.staff.filter((s) => getStaffDomain(db.domains, s)?.id === nextDomId)
                    : db.staff;
                  const currentValid = th && domainStaff.some((s) => s.id === th);
                  const nextTh = currentValid ? th : nextDomId ? domainStaff[0]?.id ?? '' : th;
                  setTh(nextTh);
                  if (!tarifManuallyEdited) {
                    setTarif(
                      nextTh
                        ? getStaffTarif(db, nextTh)
                        : nextDomId
                          ? getDomainTarif(db, nextDomId)
                          : db.tarif,
                    );
                  }
                }}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="">{t('allDomains')}</option>
                {db.domains.map((dom) => (
                  <option key={dom.id} value={dom.id}>
                    {dom.name} — {formatCurrency(dom.tarif, db.lang)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="diag-th" className="block text-sm font-medium mb-1">
              {t('therapistLabel')}
            </label>
            <select
              id="diag-th"
              value={th}
              onChange={(e) => {
                const nextTh = e.target.value;
                setTh(nextTh);
                const nextDomId = nextTh
                  ? getStaffDomain(db.domains, db.staff.find((s) => s.id === nextTh))?.id ?? domainId
                  : domainId;
                setDomainId(nextDomId);
                if (!tarifManuallyEdited) {
                  setTarif(
                    nextTh
                      ? getStaffTarif(db, nextTh)
                      : nextDomId
                        ? getDomainTarif(db, nextDomId)
                        : db.tarif,
                  );
                }
              }}
              className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            >
              <option value="">{t('unassigned')}</option>
              <TherapistSelectOptions db={db} t={t} domainId={domainId || undefined} />
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="diag-date" className="block text-sm font-medium mb-1">
                {t('dateLabel')}
              </label>
              <input
                id="diag-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="diag-heure" className="block text-sm font-medium mb-1">
                {t('timeLabel')}
              </label>
              <input
                id="diag-heure"
                type="time"
                required
                value={heure}
                onChange={(e) => setHeure(e.target.value)}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="diag-dur" className="block text-sm font-medium mb-1">
                {t('durationMinLabel')}
              </label>
              <input
                id="diag-dur"
                type="number"
                min={5}
                max={240}
                value={dur}
                onChange={(e) => setDur(Number(e.target.value))}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="diag-tarif" className="block text-sm font-medium mb-1">
                {t('tariffLabel')}
              </label>
              <input
                id="diag-tarif"
                type="number"
                min={0}
                step={100}
                value={tarif}
                onChange={(e) => {
                  setTarifManuallyEdited(true);
                  setTarif(Number(e.target.value));
                }}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
              />
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmOverlap}
        title={t('diagDialogTitle')}
        message={t('overlapConfirm')}
        onConfirm={() => {
          setConfirmOverlap(false);
          onConfirm(patient.id, buildRdv());
        }}
        onCancel={() => setConfirmOverlap(false)}
        t={t}
      />
    </>
  );
};
