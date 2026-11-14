import React, {useEffect, useMemo, useState} from 'react';
import {Printer, Trash2} from 'lucide-react';
import {ConfirmDialog} from '../components/ConfirmDialog';
import {Modal} from '../components/Modal';
import {BILAN_TYPES, type TranslationKey} from '../i18n';
import {makeId, todayISO} from '../storage';
import {
  getBilanTemplates,
  isUntouchedConclTemplate,
  isUntouchedTestsTemplate,
} from '../templates';
import type {Bilan, Lang} from '../types';

interface BilanDialogProps {
  open: boolean;
  patientId: string;
  patientName: string;
  bilan: Bilan | null; // null = new
  lang: Lang;
  onClose: () => void;
  onSave: (bilan: Bilan, isNew: boolean) => void;
  onDelete: (bilanId: string) => void;
  onPrint: (bilan: Bilan) => void;
  t: (key: TranslationKey) => string;
}

export const BilanDialog: React.FC<BilanDialogProps> = ({
  open,
  patientId,
  patientName,
  bilan,
  lang,
  onClose,
  onSave,
  onDelete,
  onPrint,
  t,
}) => {
  const isNew = !bilan;

  const initialForm = useMemo<Bilan>(() => {
    if (bilan) return {...bilan};
    const tpl = getBilanTemplates('0', lang);
    return {
      id: makeId('bil'),
      pid: patientId,
      date: todayISO(),
      type: '0',
      tests: tpl.tests,
      concl: tpl.concl,
    };
  }, [bilan, patientId, lang]);

  const [form, setForm] = useState<Bilan>(initialForm);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initialForm);
      setConfirmDelete(false);
    }
  }, [open, initialForm]);

  const isDirty = useMemo(() => {
    return JSON.stringify(form) !== JSON.stringify(initialForm);
  }, [form, initialForm]);

  const handleTypeChange = (nextType: string) => {
    const nextTpl = getBilanTemplates(nextType, lang);
    setForm((prev) => ({
      ...prev,
      type: nextType,
      tests: isUntouchedTestsTemplate(prev.tests) ? nextTpl.tests : prev.tests,
      concl: isUntouchedConclTemplate(prev.concl) ? nextTpl.concl : prev.concl,
    }));
  };

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!form.date) return;
    onSave(
      {
        ...form,
        tests: form.tests.slice(0, 20000),
        concl: form.concl.slice(0, 20000),
      },
      isNew,
    );
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`${isNew ? t('bilanDialogTitleNew') : t('bilanDialogTitleEdit')} — ${patientName}`}
        t={t}
        isDirty={isDirty}
        maxWidthClass="max-w-3xl"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {!isNew && bilan && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-900 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/50 whitespace-nowrap"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>{t('delete')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onPrint(form)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
              >
                <Printer className="h-4 w-4" />
                <span>{t('print')}</span>
              </button>
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
                onClick={() => handleSave()}
                className="min-h-10 rounded-lg accent-bg px-4 py-2 text-sm font-semibold whitespace-nowrap"
              >
                {t('save')}
              </button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="bil-date" className="block text-sm font-medium mb-1">
                {t('dateLabel')} *
              </label>
              <input
                id="bil-date"
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm((prev) => ({...prev, date: e.target.value}))}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="bil-type" className="block text-sm font-medium mb-1">
                {t('bilanTypeLabel')}
              </label>
              <select
                id="bil-type"
                value={form.type}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              >
                {BILAN_TYPES[lang].map((label, idx) => (
                  <option key={idx} value={String(idx)}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="bil-tests" className="block text-sm font-medium mb-1">
              {t('bilanTestsLabel')}
            </label>
            <textarea
              id="bil-tests"
              rows={9}
              maxLength={20000}
              value={form.tests}
              onChange={(e) => setForm((prev) => ({...prev, tests: e.target.value}))}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm leading-relaxed"
            />
          </div>

          <div>
            <label htmlFor="bil-concl" className="block text-sm font-medium mb-1">
              {t('bilanConclLabel')}
            </label>
            <textarea
              id="bil-concl"
              rows={6}
              maxLength={20000}
              value={form.concl}
              onChange={(e) => setForm((prev) => ({...prev, concl: e.target.value}))}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm leading-relaxed"
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title={t('delete')}
        message={t('deleteBilanConfirm')}
        confirmLabel={t('delete')}
        danger
        onConfirm={() => {
          setConfirmDelete(false);
          if (bilan) onDelete(bilan.id);
        }}
        onCancel={() => setConfirmDelete(false)}
        t={t}
      />
    </>
  );
};
