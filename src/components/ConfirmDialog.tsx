import React from 'react';
import {AlertTriangle} from 'lucide-react';
import type {TranslationKey} from '../i18n';
import {Modal} from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  t: (key: TranslationKey) => string;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
  t,
}) => {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      t={t}
      maxWidthClass="max-w-md"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-10 rounded-lg px-4 py-2 text-sm font-semibold text-white whitespace-nowrap ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'accent-bg'
            }`}
          >
            {confirmLabel ?? t('confirm')}
          </button>
        </div>
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            danger
              ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
          }`}
        >
          <AlertTriangle className="h-5 w-5" />
        </div>
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{message}</p>
      </div>
    </Modal>
  );
};
