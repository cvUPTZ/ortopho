import React, {useEffect, useState} from 'react';
import {AlertTriangle, Lock} from 'lucide-react';
import {Modal} from '../components/Modal';
import {decryptPayload, isEncryptedPayload} from '../crypto';
import type {TranslationKey} from '../i18n';
import {sanitize} from '../storage';
import type {DB, EncryptedPayload, Lang} from '../types';

interface ImportDialogProps {
  open: boolean;
  rawText: string;
  currentLang: Lang;
  onClose: () => void;
  onConfirmImport: (db: DB) => void;
  t: (key: TranslationKey) => string;
}

export const ImportDialog: React.FC<ImportDialogProps> = ({
  open,
  rawText,
  currentLang,
  onClose,
  onConfirmImport,
  t,
}) => {
  const [encryptedPayload, setEncryptedPayload] = useState<EncryptedPayload | null>(null);
  const [parsedDb, setParsedDb] = useState<DB | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPin('');
    setError('');
    setBusy(false);
    setEncryptedPayload(null);
    setParsedDb(null);

    try {
      const json: unknown = JSON.parse(rawText);
      if (!json || typeof json !== 'object') {
        setError(t('importInvalidFile'));
        return;
      }
      if (isEncryptedPayload(json)) {
        setEncryptedPayload(json);
        return;
      }
      const obj = json as Record<string, unknown>;
      if (!Array.isArray(obj.patients) || !Array.isArray(obj.rdv)) {
        setError(t('importInvalidFile'));
        return;
      }
      setParsedDb(sanitize(obj, currentLang));
    } catch {
      setError(t('importInvalidFile'));
    }
  }, [open, rawText, currentLang, t]);

  const handleDecrypt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!encryptedPayload || !pin || busy) return;
    setError('');
    setBusy(true);
    try {
      const decrypted = await decryptPayload(encryptedPayload, pin);
      if (!decrypted || typeof decrypted !== 'object') {
        setError(t('wrongPin'));
        return;
      }
      const obj = decrypted as Record<string, unknown>;
      if (!Array.isArray(obj.patients) || !Array.isArray(obj.rdv)) {
        setError(t('importInvalidFile'));
        return;
      }
      setParsedDb(sanitize(obj, currentLang));
      setEncryptedPayload(null);
    } catch {
      setError(t('wrongPin'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('importDialogTitle')}
      t={t}
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
          {parsedDb && (
            <button
              type="button"
              onClick={() => onConfirmImport(parsedDb)}
              className="min-h-10 rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-sm font-semibold text-white whitespace-nowrap"
            >
              {t('importReplaceBtn')}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </div>
        )}

        {encryptedPayload && !parsedDb && (
          <form onSubmit={handleDecrypt} className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Lock className="h-4 w-4 text-slate-500" />
              <span>{t('importEnterPin')}</span>
            </div>
            <input
              type="password"
              autoFocus
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                if (error) setError('');
              }}
              className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={!pin || busy}
              className="min-h-10 rounded-lg accent-bg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {t('importDecryptBtn')}
            </button>
          </form>
        )}

        {parsedDb && (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 text-sm space-y-1.5">
              <div className="font-semibold">{t('importSummaryTitle')}</div>
              <div className="text-slate-600 dark:text-slate-300 tabular-nums">
                {t('navPatients')} : <strong>{parsedDb.patients.length}</strong> · {t('sessionsCount')} :{' '}
                <strong>{parsedDb.rdv.length}</strong> · {t('tabBilans')} :{' '}
                <strong>{parsedDb.bilans.length}</strong>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{t('importConfirmWarning')}</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
