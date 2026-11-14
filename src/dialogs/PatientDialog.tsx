import React, {useMemo, useState} from 'react';
import {Calendar, FileText, Lock, Printer, Route, Sparkles, Trash2} from 'lucide-react';
import {ConfirmDialog} from '../components/ConfirmDialog';
import {Modal} from '../components/Modal';
import {ANAMNESE_FIELDS, BILAN_TYPES, PATHOLOGIES, STAGES_ORDER, type TranslationKey} from '../i18n';
import {emptyAnamnese, makeId} from '../storage';
import type {Anamnese, Bilan, DB, Patient, Rdv, Stage} from '../types';
import {formatAge, formatDateShort, normalizeSearch} from '../utils';

interface PatientDialogProps {
  open: boolean;
  patient: Patient | null; // null = creating new
  db: DB;
  onClose: () => void;
  onSave: (patient: Patient, isNew: boolean) => void;
  onDelete: (patientId: string) => void;
  onOpenBilan: (patientId: string, bilan: Bilan | null) => void;
  onOpenRdv: (rdv: Rdv) => void;
  onOrient: (patientId: string) => void;
  onPrintDossier: (patientId: string) => void;
  aiReady: boolean;
  onOpenAiSheet: (patient: Patient) => void;
  t: (key: TranslationKey) => string;
}

type TabId = 'infos' | 'anamnese' | 'bilans' | 'seances';

export const PatientDialog: React.FC<PatientDialogProps> = ({
  open,
  patient,
  db,
  onClose,
  onSave,
  onDelete,
  onOpenBilan,
  onOpenRdv,
  onOrient,
  onPrintDossier,
  aiReady,
  onOpenAiSheet,
  t,
}) => {
  const isNew = !patient;
  const lang = db.lang;

  const initialForm = useMemo<Patient>(() => {
    if (patient) {
      return {
        ...patient,
        an: {...patient.an},
      };
    }
    return {
      id: makeId('pat'),
      nom: '',
      naissance: '',
      tel: '',
      parent: '',
      medecin: '',
      patho: '',
      motif: '',
      notes: '',
      stage: 'req',
      th: db.staff.length === 1 ? db.staff[0].id : '',
      an: emptyAnamnese(),
    };
  }, [patient, db.staff]);

  const [form, setForm] = useState<Patient>(initialForm);
  const [tab, setTab] = useState<TabId>('infos');
  const [error, setError] = useState('');
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync form whenever modal opens with a different patient
  React.useEffect(() => {
    if (open) {
      setForm(initialForm);
      setTab('infos');
      setError('');
      setConfirmDuplicate(false);
      setConfirmDelete(false);
    }
  }, [open, initialForm]);

  const isDirty = useMemo(() => {
    return JSON.stringify(form) !== JSON.stringify(initialForm);
  }, [form, initialForm]);

  const patientBilans = useMemo(
    () =>
      patient
        ? db.bilans
            .filter((b) => b.pid === patient.id)
            .sort((a, b) => b.date.localeCompare(a.date))
        : [],
    [db.bilans, patient],
  );

  const patientRdvs = useMemo(
    () =>
      patient
        ? db.rdv
            .filter((r) => r.pid === patient.id)
            .sort((a, b) => `${b.date} ${b.heure}`.localeCompare(`${a.date} ${a.heure}`))
        : [],
    [db.rdv, patient],
  );

  const commitSave = () => {
    const trimmedName = form.nom.trim().slice(0, 200);
    if (!trimmedName) {
      setTab('infos');
      setError(t('nameRequired'));
      return;
    }
    onSave({...form, nom: trimmedName}, isNew);
  };

  const handleAttemptSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedName = form.nom.trim();
    if (!trimmedName) {
      setTab('infos');
      setError(t('nameRequired'));
      return;
    }
    if (isNew) {
      const normNew = normalizeSearch(trimmedName);
      const duplicate = db.patients.some((p) => normalizeSearch(p.nom) === normNew);
      if (duplicate) {
        setConfirmDuplicate(true);
        return;
      }
    }
    commitSave();
  };

  const updateAnamnese = (key: keyof Anamnese, val: string) => {
    setForm((prev) => ({
      ...prev,
      an: {...prev.an, [key]: val.slice(0, 3000)},
    }));
  };

  const ageDisplay = form.naissance
    ? formatAge(form.naissance, lang, t('yearOld'), t('yearsOld'))
    : '';

  const deleteConfirmMsg = `${t('deletePatientConfirmPrefix')} ${patientRdvs.length} ${t(
    'deletePatientConfirmMid',
  )} ${patientBilans.length} ${t('deletePatientConfirmEnd')}`;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={isNew ? t('newPatient') : form.nom || t('patientLabel')}
        t={t}
        isDirty={isDirty}
        maxWidthClass="max-w-3xl"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {!isNew && patient && (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-900 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/50 whitespace-nowrap"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>{t('delete')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onPrintDossier(patient.id)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                  >
                    <Printer className="h-4 w-4" />
                    <span>{t('fullDossierPrint')}</span>
                  </button>
                  {db.staff.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onOrient(patient.id)}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                    >
                      <Route className="h-4 w-4" />
                      <span>{t('orientBtn')}</span>
                    </button>
                  )}
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
        <div role="tablist" className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'infos'}
            onClick={() => setTab('infos')}
            className={`min-h-10 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              tab === 'infos'
                ? 'accent-bg'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {t('tabInfos')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'anamnese'}
            onClick={() => setTab('anamnese')}
            className={`min-h-10 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              tab === 'anamnese'
                ? 'accent-bg'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {t('tabAnamnese')}
          </button>
          {!isNew && (
            <>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'bilans'}
                onClick={() => setTab('bilans')}
                className={`min-h-10 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  tab === 'bilans'
                    ? 'accent-bg'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {t('tabBilans')} ({patientBilans.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'seances'}
                onClick={() => setTab('seances')}
                className={`min-h-10 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  tab === 'seances'
                    ? 'accent-bg'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {t('tabSeances')} ({patientRdvs.length})
              </button>
            </>
          )}
        </div>

        {tab === 'infos' && (
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
              <div>
                <label htmlFor="pat-nom" className="block text-sm font-medium mb-1">
                  {t('nameLabel')} *
                </label>
                <input
                  id="pat-nom"
                  type="text"
                  required
                  maxLength={200}
                  value={form.nom}
                  onChange={(e) => {
                    setForm((prev) => ({...prev, nom: e.target.value}));
                    if (error) setError('');
                  }}
                  className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="pat-naissance" className="block text-sm font-medium mb-1">
                  {t('birthDateLabel')}
                  {ageDisplay && ageDisplay !== '—' && (
                    <span className="ms-2 text-xs font-normal text-slate-500 dark:text-slate-400 tabular-nums">
                      ({ageDisplay})
                    </span>
                  )}
                </label>
                <input
                  id="pat-naissance"
                  type="date"
                  value={form.naissance}
                  onChange={(e) => setForm((prev) => ({...prev, naissance: e.target.value}))}
                  className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="pat-tel" className="block text-sm font-medium mb-1">
                  {t('phoneLabel')}
                </label>
                <input
                  id="pat-tel"
                  type="tel"
                  maxLength={200}
                  value={form.tel}
                  onChange={(e) => setForm((prev) => ({...prev, tel: e.target.value}))}
                  placeholder="0555 00 00 00"
                  className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="pat-parent" className="block text-sm font-medium mb-1">
                  {t('parentLabel')}
                </label>
                <input
                  id="pat-parent"
                  type="text"
                  maxLength={200}
                  value={form.parent}
                  onChange={(e) => setForm((prev) => ({...prev, parent: e.target.value}))}
                  className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="pat-medecin" className="block text-sm font-medium mb-1">
                  {t('doctorLabel')}
                </label>
                <input
                  id="pat-medecin"
                  type="text"
                  maxLength={200}
                  value={form.medecin}
                  onChange={(e) => setForm((prev) => ({...prev, medecin: e.target.value}))}
                  className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="pat-patho" className="block text-sm font-medium mb-1">
                  {t('pathologyLabel')}
                </label>
                <select
                  id="pat-patho"
                  value={form.patho}
                  onChange={(e) => setForm((prev) => ({...prev, patho: e.target.value}))}
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
                <label htmlFor="pat-stage" className="block text-sm font-medium mb-1">
                  {t('stageLabel')}
                </label>
                <select
                  id="pat-stage"
                  value={form.stage}
                  onChange={(e) => setForm((prev) => ({...prev, stage: e.target.value as Stage}))}
                  className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                >
                  {STAGES_ORDER.map((st) => (
                    <option key={st} value={st}>
                      {t(`stage_${st}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="pat-th" className="block text-sm font-medium mb-1">
                  {t('assignedTherapistLabel')}
                </label>
                <select
                  id="pat-th"
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
            </div>

            <div>
              <label htmlFor="pat-motif" className="block text-sm font-medium mb-1">
                {t('motifLabel')}
              </label>
              <textarea
                id="pat-motif"
                rows={3}
                maxLength={10000}
                value={form.motif}
                onChange={(e) => setForm((prev) => ({...prev, motif: e.target.value}))}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="pat-notes" className="block text-sm font-medium mb-1">
                {t('notesLabel')}
              </label>
              <textarea
                id="pat-notes"
                rows={3}
                maxLength={10000}
                value={form.notes}
                onChange={(e) => setForm((prev) => ({...prev, notes: e.target.value}))}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
          </form>
        )}

        {tab === 'anamnese' && (
          <div className="space-y-4">
            {ANAMNESE_FIELDS.map((field) => (
              <div key={field.key}>
                <label htmlFor={`an-${field.key}`} className="block text-sm font-medium mb-1">
                  {lang === 'ar' ? field.ar : field.fr}
                </label>
                <textarea
                  id={`an-${field.key}`}
                  rows={2}
                  maxLength={3000}
                  value={form.an[field.key]}
                  onChange={(e) => updateAnamnese(field.key, e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
            ))}
          </div>
        )}

        {tab === 'bilans' && patient && (
          <div className="space-y-3">
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => onOpenAiSheet(patient)}
                title={!aiReady ? t('aiLockedHint') : undefined}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium whitespace-nowrap ${
                  aiReady
                    ? 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {aiReady ? <Sparkles className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                <span>{t('aiMenuBtn')}</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenBilan(patient.id, null)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg accent-bg px-3.5 py-2 text-sm font-semibold whitespace-nowrap"
              >
                <FileText className="h-4 w-4" />
                <span>{t('newBilanBtn')}</span>
              </button>
            </div>
            {patientBilans.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                {t('noBilansYet')}
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                {patientBilans.map((b) => {
                  const typeLabel = BILAN_TYPES[lang][Number(b.type)] ?? '';
                  const excerpt = b.concl.replace(/■\s*/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onOpenBilan(patient.id, b)}
                      className="flex w-full items-start justify-between gap-3 px-4 py-3 text-start hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">
                          {typeLabel}
                        </div>
                        {excerpt && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {excerpt}
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                        {formatDateShort(b.date, lang)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'seances' && patient && (
          <div className="space-y-3">
            {patientRdvs.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                {t('noSeancesYet')}
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                {patientRdvs.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onOpenRdv(r)}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-start hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium tabular-nums">
                        <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>{formatDateShort(r.date, lang)}</span>
                        <span>{r.heure}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          · {t(`statut_${r.statut}`)}
                        </span>
                      </div>
                      {r.note && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {r.note.slice(0, 90)}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDuplicate}
        title={t('newPatient')}
        message={t('duplicateNameConfirm')}
        onConfirm={() => {
          setConfirmDuplicate(false);
          commitSave();
        }}
        onCancel={() => setConfirmDuplicate(false)}
        t={t}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={t('delete')}
        message={deleteConfirmMsg}
        confirmLabel={t('delete')}
        danger
        onConfirm={() => {
          setConfirmDelete(false);
          if (patient) onDelete(patient.id);
        }}
        onCancel={() => setConfirmDelete(false)}
        t={t}
      />
    </>
  );
};
