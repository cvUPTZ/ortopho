import React, {useState} from 'react';
import {Languages, Lock} from 'lucide-react';
import {isWebCryptoAvailable} from '../crypto';
import type {TranslationKey} from '../i18n';
import type {Lang} from '../types';

interface LockScreenProps {
  lang: Lang;
  onToggleLang: () => void;
  onUnlock: (pin: string) => Promise<boolean>;
  t: (key: TranslationKey) => string;
}

export const LockScreen: React.FC<LockScreenProps> = ({lang, onToggleLang, onUnlock, t}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const cryptoReady = isWebCryptoAvailable();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || busy) return;
    setError('');
    setBusy(true);
    try {
      const ok = await onUnlock(pin);
      if (!ok) {
        setError(t('wrongPin'));
      }
    } catch {
      setError(t('wrongPin'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-8">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg accent-bg shrink-0">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t('lockTitle')}</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleLang}
            aria-label={t('switchLangAria')}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Languages className="h-4 w-4" />
            <span>{lang === 'fr' ? 'عربي' : 'Français'}</span>
          </button>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">{t('lockSubtitle')}</p>

        {!cryptoReady && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-300"
          >
            {t('cryptoUnavailable')}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="lock-pin-input"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              {t('pinLabel')}
            </label>
            <input
              id="lock-pin-input"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                if (error) setError('');
              }}
              className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-base text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!pin || busy || !cryptoReady}
            className="w-full min-h-11 rounded-lg accent-bg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {t('unlockBtn')}
          </button>
        </form>
      </div>
    </div>
  );
};
