import React, {useEffect} from 'react';
import {RotateCcw, X} from 'lucide-react';
import type {TranslationKey} from '../i18n';

export interface ToastItem {
  id: string;
  message: string;
  canUndo?: boolean;
  tone?: 'info' | 'error';
}

interface ToastProps {
  toast: ToastItem | null;
  onDismiss: () => void;
  onUndo?: () => void;
  t: (key: TranslationKey) => string;
}

export const Toast: React.FC<ToastProps> = ({toast, onDismiss, onUndo, t}) => {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      onDismiss();
    }, 9000);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const isError = toast.tone === 'error';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 sm:bottom-5 inset-x-4 sm:inset-x-auto sm:end-5 z-50 flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900 text-white dark:border-slate-700 dark:bg-slate-800 px-4 py-3 shadow-lg sm:max-w-md no-print"
    >
      <span className={`text-sm font-medium ${isError ? 'text-red-300' : 'text-slate-100'}`}>
        {toast.message}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        {toast.canUndo && onUndo && (
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{t('undo')}</span>
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('close')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
