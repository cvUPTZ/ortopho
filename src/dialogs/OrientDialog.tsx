import React, {useEffect, useMemo, useState} from 'react';
import {ConfirmDialog} from '../components/ConfirmDialog';
import {Modal} from '../components/Modal';
import {TherapistSelectOptions} from '../components/TherapistSelectOptions';
import {PATHOLOGIES, type TranslationKey} from '../i18n';
import {makeId, todayISO} from '../storage';
import type {DB, Patient, Rdv} from '../types';
import {addDaysISO, formatCurrency, getDomainTarif, getStaffDomain, getStaffTarif, hasOverlap} from '../utils';

interface OrientDialogProps {
  open: boolean;
  patient: Patient | null;
  db: DB;
  onClose: () => void;
  onConfirm: (patientId: string, th: string, patho: string, rdvs: Rdv[]) => void;
  t: (key: TranslationKey) => string;
}

export const OrientDialog: React.FC<OrientDialogProps> = ({
  open,
  patient,
  db,
  onClose,
  onConfirm,
  t,
}) => {
  const lang = db.lang;
  const defaultDur = Number(db.cab.dur) || 30;

  const [domainId, setDomainId] = useState('');
  const [th, setTh] = useState('');
  const [patho, setPatho] = useState('');
  const [firstDate, setFirstDate] = useState(todayISO());
  const [heure, setHeure] = useState('09:00');
  const [dur, setDur] = useState(defaultDur);
  const [weeks, setWeeks] = useState(12);
  const [tarif, setTarif] = useState(db.tarif);
  const [tarifManuallyEdited, setTarifManuallyEdited] = useState(false);
  const [confirmOverlap, setConfirmOverlap] = useState(false);

  useEffect(() => {
    if (open && patient) {
      const initialTh = patient.th || db.staff[0]?.id || '';
      const thDomId = initialTh
        ? getStaffDomain(db.domains, db.staff.find((s) => s.id === initialTh))?.id ?? ''
        : '';
      const initialDomId = thDomId || db.domains[0]?.id || '';
      setDomainId(initialDomId);
      setTh(initialTh);
      setPatho(patient.patho || '');
      setFirstDate(todayISO());
      setHeure('09:00');
      setDur(defaultDur);
      setWeeks(12);
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
  }, [open, patient, db, defaultDur]);

  const isDirty = useMemo(() => {
    return open && (weeks !== 12 || heure !== '09:00' || firstDate !== todayISO());
  }, [open, weeks, heure, firstDate]);

  if (!patient) return null;

  const buildRdvs = (): Rdv[] => {
    const count = Math.min(52, Math.max(1, Math.round(weeks) || 12));
    const cleanDur = Math.min(240, Math.max(5, Math.round(dur) || defaultDur));
    const cleanTarif = Math.max(0, Math.round(tarif) || 0);
    const list: Rdv[] = [];
    for (let i = 0; i < count; i++) {
      list.push({
        id: makeId('rdv'),
        pid: patient.id,
        date: addDaysISO(firstDate, i * 7),
        heure,
        statut: 'prevu',
        tarif: cleanTarif,
        pay: [],
        note: '',
        rno: '',
        kind: 'suivi',
        th,
        ...(domainId ? {domainId} : {}),
        dur: cleanDur,
        rem: '',
      });
    }
    return list;
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const list = buildRdvs();
    const conflict = list.some((r) =>
      hasOverlap(db.rdv, {date: r.date, heure: r.heure, dur: r.dur, th: r.th}),
    );
    if (conflict) {
      setConfirmOverlap(true);
      return;
    }
    onConfirm(patient.id, th, patho, list);
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`${t('orientDialogTitle')} — ${patient.nom}`}
        t={t}
        isDirty={isDirty}
        maxWidthClass="max-w-lg"
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
              {t('orientSubmit')}
            </button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {db.domains.length > 0 && (
              <div className="sm:col-span-2">
                <label htmlFor="or-domain" className="block text-sm font-medium mb-1">
                  {t('domainLabel')}
                </label>
                <select
                  id="or-domain"
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
                      {dom.name} — {formatCurrency(dom.tarif, lang)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="or-th" className="block text-sm font-medium mb-1">
                {t('therapistLabel')}
              </label>
              <select
                id="or-th"
                value={th}
                onChange={(e) => {
                  const nextTh = e.target.value;
                  setTh(nextTh);
                  const nextDomId = nextTh
                    ? getStaffDomain(db.domains, db.staff.find((s) => s.id === nextTh))?.id ??
                      domainId
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

            <div>
              <label htmlFor="or-patho" className="block text-sm font-medium mb-1">
                {t('pathologyLabel')}
              </label>
              <select
                id="or-patho"
                value={patho}
                onChange={(e) => setPatho(e.target.value)}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="">{t('none')}</option>
                {PATHOLOGIES[lang].map((label, idx) => (
                  <option key={idx} value={String(idx)}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="or-date" className="block text-sm font-medium mb-1">
                {t('firstDateLabel')}
              </label>
              <input
                id="or-date"
                type="date"
                required
                value={firstDate}
                onChange={(e) => setFirstDate(e.target.value)}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="or-heure" className="block text-sm font-medium mb-1">
                {t('timeLabel')}
              </label>
              <input
                id="or-heure"
                type="time"
                required
                value={heure}
                onChange={(e) => setHeure(e.target.value)}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="or-dur" className="block text-sm font-medium mb-1">
                {t('durationMinLabel')}
              </label>
              <input
                id="or-dur"
                type="number"
                min={5}
                max={240}
                value={dur}
                onChange={(e) => setDur(Number(e.target.value))}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="or-weeks" className="block text-sm font-medium mb-1">
                {t('weeksCountLabel')}
              </label>
              <input
                id="or-weeks"
                type="number"
                min={1}
                max={52}
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="or-tarif" className="block text-sm font-medium mb-1">
                {t('tariffLabel')}
              </label>
              <input
                id="or-tarif"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
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
        title={t('orientDialogTitle')}
        message={t('overlapConfirm')}
        onConfirm={() => {
          setConfirmOverlap(false);
          onConfirm(patient.id, th, patho, buildRdvs());
        }}
        onCancel={() => setConfirmOverlap(false)}
        t={t}
      />
    </>
  );
};
