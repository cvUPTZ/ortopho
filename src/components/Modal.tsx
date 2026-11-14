import React, {useEffect, useId, useRef, useState} from 'react';
import {X} from 'lucide-react';
import type {TranslationKey} from '../i18n';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  t: (key: TranslationKey) => string;
  isDirty?: boolean;
  maxWidthClass?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  t,
  isDirty = false,
  maxWidthClass = 'max-w-2xl',
  children,
  footer,
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmDiscard(false);
      return;
    }
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        panel.focus();
      }
    }, 10);

    return () => {
      window.clearTimeout(timer);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  const requestClose = () => {
    if (isDirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    setConfirmDiscard(false);
    onClose();
  };

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs.length > 0 && dialogs[dialogs.length - 1] !== panelRef.current) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (confirmDiscard) {
          setConfirmDiscard(false);
        } else {
          requestClose();
        }
        return;
      }

      if (e.key === 'Tab' && panelRef.current) {
        const focusables = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter((el) => el.offsetParent !== null);
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || !panelRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last || !panelRef.current.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/55 p-0 sm:p-4 backdrop-blur-[1px] no-print"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          requestClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-[92dvh] w-full ${maxWidthClass} flex-col rounded-t-xl sm:rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xl outline-none`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 shrink-0">
          <h2 id={titleId} className="text-lg font-bold tracking-tight truncate">
            {title}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label={t('close')}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {confirmDiscard && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/50 px-5 py-3 text-sm"
          >
            <div className="font-medium text-amber-950 dark:text-amber-200">
              {t('discardTitle')} <span className="font-normal text-amber-800 dark:text-amber-300">{t('discardMessage')}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmDiscard(false)}
                className="min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
              >
                {t('discardNo')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDiscard(false);
                  onClose();
                }}
                className="min-h-10 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 whitespace-nowrap"
              >
                {t('discardYes')}
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-3 shrink-0 bg-slate-50/70 dark:bg-slate-900/80 rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
