import React, {useEffect, useState} from 'react';
import {AlertTriangle, Lock, Unlock} from 'lucide-react';
import {ConfirmDialog} from '../components/ConfirmDialog';
import {Modal} from '../components/Modal';
import {isWebCryptoAvailable} from '../crypto';
import type {TranslationKey} from '../i18n';

interface PinDialogProps {
  open: boolean;
  hasPin: boolean;
  onClose: () => void;
  onSetPin: (newPin: string) => Promise<void>;
  onRemovePin: () => Promise<void>;
  t: (key: TranslationKey) => string;
}

export const PinDialog: React.FC<PinDialogProps> = ({
  open,
  hasPin,
  onClose,
  onSetPin,
  onRemovePin,
  t,
}) => {
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const cryptoReady = isWebCryptoAvailable();

  useEffect(() => {
    if (open) {
      setPin1('');
      setPin2('');
      setError('');
      setBusy(false);
      setConfirmRemove(false);
    }
  }, [open]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!cryptoReady || busy) return;
    if (pin1.length < 4) {
      setError(t('pinTooShortError'));
      return;
    }
    if (pin1 !== pin2) {
      setError(t('pinMismatchError'));
      return;
    }
    setBusy(true);
    try {
      await onSetPin(pin1);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={t('pinDialogTitle')}
        t={t}
        isDirty={pin1.length > 0 || pin2.length > 0}
        maxWidthClass="max-w-md"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            {hasPin && (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-900 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/50 whitespace-nowrap"
              >
                <Unlock className="h-4 w-4" />
                <span>{t('pinRemoveBtn')}</span>
              </button>
            )}
            <div className="flex items-center gap-2 ms-auto">
              <button
                type="button"
                onClick={onClose}
                className="min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium whitespace-nowrap"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={busy || !cryptoReady}
                onClick={() => handleSubmit()}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg accent-bg px-4 py-2 text-sm font-semibold whitespace-nowrap disabled:opacity-50"
              >
                <Lock className="h-4 w-4" />
                <span>{t('pinSetBtn')}</span>
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {hasPin ? t('pinActiveNotice') : t('pinInactiveNotice')}
          </p>

          {!cryptoReady && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300"
            >
              {t('cryptoUnavailable')}
            </div>
          )}

          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{t('pinWarning')}</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="pin-new" className="block text-sm font-medium mb-1">
                {t('pinNewLabel')}
              </label>
              <input
                id="pin-new"
                type="password"
                autoComplete="new-password"
                value={pin1}
                onChange={(e) => {
                  setPin1(e.target.value);
                  if (error) setError('');
                }}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="pin-confirm" className="block text-sm font-medium mb-1">
                {t('pinConfirmLabel')}
              </label>
              <input
                id="pin-confirm"
                type="password"
                autoComplete="new-password"
                value={pin2}
                onChange={(e) => {
                  setPin2(e.target.value);
                  if (error) setError('');
                }}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </form>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmRemove}
        title={t('pinRemoveBtn')}
        message={t('pinRemoveConfirm')}
        confirmLabel={t('confirm')}
        danger
        onConfirm={async () => {
          setConfirmRemove(false);
          await onRemovePin();
          onClose();
        }}
        onCancel={() => setConfirmRemove(false)}
        t={t}
      />
    </>
  );
};
