import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookMarked,
  FilePlus2,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  APHASIA_TASKS_OPTIONS,
  ARTICULATION_SOUNDS,
  AiCallError,
  FLUENCY_TECHNIQUES,
  MATH_OPS_OPTIONS,
  OTHER_FOCUS_OPTIONS,
  VALID_ACTIVITY_TYPES,
  VOCAB_THEMES,
  VOICE_FOCUS_OPTIONS,
  buildExercisePayload,
  defaultTargetForCategory,
  exerciseSheetToBilanText,
  generateExerciseSheet,
  prefillFromPatient,
  recordGenerationTimestamp,
  regenerateSingleActivity,
  remainingGenerationsThisHour,
  validatePrivacyText,
} from '../aiExercise';
import {Modal} from '../components/Modal';
import type {TranslationKey} from '../i18n';
import {makeId, todayISO} from '../storage';
import type {
  ActivityType,
  AgeBand,
  AiExerciseRequestPayload,
  Bilan,
  DB,
  DisorderCategory,
  ExerciseActivity,
  ExerciseItem,
  ExerciseSheet,
  ExerciseTargetParams,
  OutputLanguage,
  Patient,
  SavedExerciseSheet,
  SheetLength,
} from '../types';

interface ExerciseSheetDialogProps {
  open: boolean;
  patient: Patient | null; // optional: for local header & local prefill ONLY
  db: DB;
  sessionConsentChecked: boolean;
  onChangeSessionConsent: (checked: boolean) => void;
  onClose: () => void;
  onRecordSendLog: (model: string, params: AiExerciseRequestPayload) => void;
  onSaveToPatient: (bilan: Bilan) => void;
  onSaveToLibrary: (entry: SavedExerciseSheet) => void;
  onDeleteFromLibrary: (sheetId: string) => void;
  onPrintSheet: (
    sheet: ExerciseSheet,
    outputLanguage: OutputLanguage,
    validated: boolean,
  ) => void;
  t: (key: TranslationKey) => string;
}

type SheetTab = 'generate' | 'editor' | 'library';

const AGE_BANDS: AgeBand[] = ['3-4', '5-6', '7-8', '9-11', '12-15', 'adult'];
const CATEGORIES: DisorderCategory[] = [
  'articulation',
  'language_delay',
  'comprehension',
  'fluency',
  'dyslexia',
  'dysorthography',
  'voice',
  'dyscalculia',
  'aphasia',
  'other',
];

export const ExerciseSheetDialog: React.FC<ExerciseSheetDialogProps> = ({
  open,
  patient,
  db,
  sessionConsentChecked,
  onChangeSessionConsent,
  onClose,
  onRecordSendLog,
  onSaveToPatient,
  onSaveToLibrary,
  onDeleteFromLibrary,
  onPrintSheet,
  t,
}) => {
  const lang = db.lang;

  const [tab, setTab] = useState<SheetTab>('generate');
  const [ageBand, setAgeBand] = useState<AgeBand>('5-6');
  const [category, setCategory] = useState<DisorderCategory>('articulation');
  const [target, setTarget] = useState<ExerciseTargetParams>(() =>
    defaultTargetForCategory('articulation'),
  );
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>(
    lang === 'ar' ? 'ar_msa' : 'fr',
  );
  const [difficulty, setDifficulty] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [length, setLength] = useState<SheetLength>('short');
  const [minutesPerDay, setMinutesPerDay] = useState<number>(10);
  const [daysPerWeek, setDaysPerWeek] = useState<number>(5);
  const [interests, setInterests] = useState<string>('');
  const [specialNote, setSpecialNote] = useState<string>('');

  const [sheet, setSheet] = useState<ExerciseSheet | null>(null);
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);
  const [validated, setValidated] = useState<boolean>(false);

  const [busy, setBusy] = useState<boolean>(false);
  const [regenActIdx, setRegenActIdx] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [rateLeft, setRateLeft] = useState<number>(() => remainingGenerationsThisHour());

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }
    const prefill = prefillFromPatient(patient);
    setTab('generate');
    setAgeBand(prefill.ageBand);
    setCategory(prefill.category);
    setTarget(defaultTargetForCategory(prefill.category));
    setOutputLanguage(lang === 'ar' ? 'ar_msa' : 'fr');
    setDifficulty(2);
    setLength('short');
    setMinutesPerDay(10);
    setDaysPerWeek(5);
    setInterests('');
    setSpecialNote('');
    setSheet(null);
    setActiveLibraryId(null);
    setValidated(false);
    setBusy(false);
    setRegenActIdx(null);
    setErrorMsg('');
    setRateLeft(remainingGenerationsThisHour());
  }, [open, patient, lang]);

  const interestsValid = validatePrivacyText(interests);
  const specialNoteValid = validatePrivacyText(specialNote);

  const payload = useMemo<AiExerciseRequestPayload>(
    () =>
      buildExercisePayload({
        ageBand,
        category,
        target,
        outputLanguage,
        difficulty,
        length,
        minutesPerDay,
        daysPerWeek,
        interests,
        specialNote,
      }),
    [
      ageBand,
      category,
      target,
      outputLanguage,
      difficulty,
      length,
      minutesPerDay,
      daysPerWeek,
      interests,
      specialNote,
    ],
  );

  const mapErrorMessage = (err: unknown): string => {
    const code = err instanceof AiCallError ? err.code : 'network';
    switch (code) {
      case 'key':
        return t('aiErrKey');
      case 'quota':
        return t('aiErrQuota');
      case 'blocked':
        return t('aiErrBlocked');
      case 'malformed':
        return t('aiErrMalformed');
      case 'timeout':
        return t('aiErrTimeout');
      case 'cancelled':
        return t('aiErrCancelled');
      default:
        return t('aiErrNetwork');
    }
  };

  const handleGenerate = async () => {
    if (busy || !interestsValid || !specialNoteValid || !sessionConsentChecked) return;
    if (remainingGenerationsThisHour() <= 0) {
      setErrorMsg(t('aiRateLimitReached'));
      return;
    }

    setErrorMsg('');
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;

    recordGenerationTimestamp();
    setRateLeft(remainingGenerationsThisHour());
    onRecordSendLog(db.ai.model || 'gemini-2.5-flash', payload);

    try {
      const result = await generateExerciseSheet({
        model: db.ai.model || 'gemini-2.5-flash',
        payload,
        signal: controller.signal,
      });
      setSheet(result);
      setActiveLibraryId(null);
      setValidated(false);
      setTab('editor');
    } catch (err) {
      setErrorMsg(mapErrorMessage(err));
    } finally {
      setBusy(false);
      abortRef.current = null;
      setRateLeft(remainingGenerationsThisHour());
    }
  };

  const handleRegenerateActivity = async (idx: number) => {
    if (!sheet || busy || regenActIdx !== null) return;
    if (remainingGenerationsThisHour() <= 0) {
      setErrorMsg(t('aiRateLimitReached'));
      return;
    }

    setErrorMsg('');
    setRegenActIdx(idx);
    const controller = new AbortController();
    abortRef.current = controller;

    recordGenerationTimestamp();
    setRateLeft(remainingGenerationsThisHour());
    onRecordSendLog(db.ai.model || 'gemini-2.5-flash', payload);

    try {
      const nextAct = await regenerateSingleActivity({
        model: db.ai.model || 'gemini-2.5-flash',
        payload,
        existingSheet: sheet,
        activityIndex: idx,
        signal: controller.signal,
      });
      setSheet((prev) =>
        prev
          ? {
              ...prev,
              activities: prev.activities.map((a, i) => (i === idx ? nextAct : a)),
            }
          : prev,
      );
      setValidated(false);
    } catch (err) {
      setErrorMsg(mapErrorMessage(err));
    } finally {
      setRegenActIdx(null);
      abortRef.current = null;
      setRateLeft(remainingGenerationsThisHour());
    }
  };

  const handleCancelGeneration = () => {
    abortRef.current?.abort();
  };

  const toggleInArray = (list: string[] | undefined, value: string): string[] => {
    const cur = list ?? [];
    return cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
  };

  const handleSaveToPatient = () => {
    if (!patient || !sheet) return;
    const {tests, concl} = exerciseSheetToBilanText(sheet, lang);
    const bilan: Bilan = {
      id: makeId('bil'),
      pid: patient.id,
      date: todayISO(),
      type: '6', // Fiche d'exercices pour les parents
      tests,
      concl,
    };
    onSaveToPatient(bilan);
  };

  const handleSaveLibrary = () => {
    if (!sheet) return;
    const now = Date.now();
    const id = activeLibraryId ?? makeId('sheet');
    const existing = db.aiSheets.find((s) => s.id === id);
    onSaveToLibrary({
      id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      params: payload,
      sheet: structuredClone(sheet),
    });
    setActiveLibraryId(id);
  };

  const updateActivity = (idx: number, patch: Partial<ExerciseActivity>) => {
    setSheet((prev) =>
      prev
        ? {
            ...prev,
            activities: prev.activities.map((a, i) => (i === idx ? {...a, ...patch} : a)),
          }
        : prev,
    );
  };

  const moveActivity = (idx: number, dir: -1 | 1) => {
    setSheet((prev) => {
      if (!prev) return prev;
      const targetIdx = idx + dir;
      if (targetIdx < 0 || targetIdx >= prev.activities.length) return prev;
      const next = [...prev.activities];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return {...prev, activities: next};
    });
  };

  const updateItem = (actIdx: number, itemIdx: number, patch: Partial<ExerciseItem>) => {
    setSheet((prev) =>
      prev
        ? {
            ...prev,
            activities: prev.activities.map((a, i) =>
              i === actIdx
                ? {
                    ...a,
                    items: a.items.map((it, j) => (j === itemIdx ? {...it, ...patch} : it)),
                  }
                : a,
            ),
          }
        : prev,
    );
  };

  const headerTitle = patient
    ? `${t('aiMenuBtn')} — ${patient.nom}`
    : t('aiMenuBtn');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={headerTitle}
      t={t}
      isDirty={Boolean(sheet)}
      maxWidthClass="max-w-4xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {t('aiFootnote')}
          </p>
          <div className="flex flex-wrap items-center gap-2 ms-auto">
            {tab === 'editor' && sheet && (
              <>
                <button
                  type="button"
                  onClick={handleSaveLibrary}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs sm:text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                >
                  <BookMarked className="h-4 w-4" />
                  <span>{t('aiSaveToLibraryBtn')}</span>
                </button>
                {patient && (
                  <button
                    type="button"
                    onClick={handleSaveToPatient}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs sm:text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                  >
                    <Save className="h-4 w-4" />
                    <span>{t('aiSaveToPatientBtn')}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onPrintSheet(sheet, outputLanguage, validated)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg accent-bg px-3.5 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap"
                >
                  <Printer className="h-4 w-4" />
                  <span>{t('print')}</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium whitespace-nowrap"
            >
              {t('close')}
            </button>
          </div>
        </div>
      }
    >
      {/* Tabs */}
      <div
        role="tablist"
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 pb-3 mb-4"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'generate'}
          onClick={() => setTab('generate')}
          className={`min-h-10 rounded-lg px-3.5 py-2 text-sm font-medium whitespace-nowrap ${
            tab === 'generate'
              ? 'accent-bg'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {t('aiTabGenerate')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'editor'}
          disabled={!sheet}
          onClick={() => sheet && setTab('editor')}
          className={`min-h-10 rounded-lg px-3.5 py-2 text-sm font-medium whitespace-nowrap disabled:opacity-45 ${
            tab === 'editor'
              ? 'accent-bg'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {t('aiTabEditor')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'library'}
          onClick={() => setTab('library')}
          className={`min-h-10 rounded-lg px-3.5 py-2 text-sm font-medium whitespace-nowrap ${
            tab === 'library'
              ? 'accent-bg'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {t('aiTabLibrary')} ({db.aiSheets.length})
        </button>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-300"
        >
          {errorMsg}
        </div>
      )}

      {/* TAB 1: Parameters & Generation */}
      {tab === 'generate' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ai-age-band" className="block text-sm font-medium mb-1">
                {t('aiAgeBandLabel')}
              </label>
              <select
                id="ai-age-band"
                value={ageBand}
                onChange={(e) => setAgeBand(e.target.value as AgeBand)}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
              >
                {AGE_BANDS.map((band) => (
                  <option key={band} value={band}>
                    {band === 'adult' ? t('aiAgeBandAdult') : `${band} ${t('yearsOld')}`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ai-category" className="block text-sm font-medium mb-1">
                {t('aiCategoryLabel')}
              </label>
              <select
                id="ai-category"
                value={category}
                onChange={(e) => {
                  const next = e.target.value as DisorderCategory;
                  setCategory(next);
                  setTarget(defaultTargetForCategory(next));
                }}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {t(`aiCat_${cat}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dynamic Category Target Fields */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/50 dark:bg-slate-950/30">
            {category === 'articulation' && (
              <>
                <div>
                  <span className="block text-sm font-medium mb-2">{t('aiSoundsLabel')}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {ARTICULATION_SOUNDS.map((snd) => {
                      const active = (target.sounds ?? []).includes(snd);
                      return (
                        <button
                          key={snd}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            setTarget((prev) => ({
                              ...prev,
                              sounds: toggleInArray(prev.sounds, snd),
                            }))
                          }
                          className={`min-h-10 rounded-lg border px-3 py-1 text-sm font-mono transition-colors ${
                            active
                              ? 'accent-bg border-transparent'
                              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {snd}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label htmlFor="ai-pos" className="block text-sm font-medium mb-1">
                    {t('aiPositionLabel')}
                  </label>
                  <select
                    id="ai-pos"
                    value={target.position ?? 'initial'}
                    onChange={(e) =>
                      setTarget((prev) => ({
                        ...prev,
                        position: e.target.value as ExerciseTargetParams['position'],
                      }))
                    }
                    className="w-full sm:w-64 min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    <option value="initial">{t('aiPos_initial')}</option>
                    <option value="medial">{t('aiPos_medial')}</option>
                    <option value="final">{t('aiPos_final')}</option>
                    <option value="clusters">{t('aiPos_clusters')}</option>
                  </select>
                </div>
              </>
            )}

            {(category === 'language_delay' || category === 'comprehension') && (
              <>
                <div>
                  <span className="block text-sm font-medium mb-2">{t('aiVocabThemesLabel')}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {VOCAB_THEMES.map((th) => {
                      const active = (target.vocabThemes ?? []).includes(th);
                      return (
                        <button
                          key={th}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            setTarget((prev) => ({
                              ...prev,
                              vocabThemes: toggleInArray(prev.vocabThemes, th),
                            }))
                          }
                          className={`min-h-10 rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                            active
                              ? 'accent-bg border-transparent'
                              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
                          }`}
                        >
                          {t(`aiTheme_${th}`)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label htmlFor="ai-sent-len" className="block text-sm font-medium mb-1">
                      {t('aiSentenceLengthLabel')}
                    </label>
                    <select
                      id="ai-sent-len"
                      value={target.sentenceLength ?? 'short_sentences'}
                      onChange={(e) =>
                        setTarget((prev) => ({
                          ...prev,
                          sentenceLength: e.target.value as ExerciseTargetParams['sentenceLength'],
                        }))
                      }
                      className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                    >
                      <option value="2-3_words">{t('aiLen_2_3')}</option>
                      <option value="short_sentences">{t('aiLen_short')}</option>
                      <option value="complex_sentences">{t('aiLen_complex')}</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 min-h-11 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(target.focusVerbs)}
                      onChange={(e) =>
                        setTarget((prev) => ({...prev, focusVerbs: e.target.checked}))
                      }
                      className="h-4 w-4 rounded"
                    />
                    <span>{t('aiFocusVerbs')}</span>
                  </label>
                  <label className="flex items-center gap-2 min-h-11 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(target.focusPrepositions)}
                      onChange={(e) =>
                        setTarget((prev) => ({...prev, focusPrepositions: e.target.checked}))
                      }
                      className="h-4 w-4 rounded"
                    />
                    <span>{t('aiFocusPrepositions')}</span>
                  </label>
                </div>
              </>
            )}

            {(category === 'dyslexia' || category === 'dysorthography') && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="ai-read-unit" className="block text-sm font-medium mb-1">
                    {t('aiReadingUnitLabel')}
                  </label>
                  <select
                    id="ai-read-unit"
                    value={target.readingUnit ?? 'words'}
                    onChange={(e) =>
                      setTarget((prev) => ({
                        ...prev,
                        readingUnit: e.target.value as ExerciseTargetParams['readingUnit'],
                      }))
                    }
                    className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    <option value="letters">{t('aiRead_letters')}</option>
                    <option value="syllables">{t('aiRead_syllables')}</option>
                    <option value="words">{t('aiRead_words')}</option>
                    <option value="sentences">{t('aiRead_sentences')}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="ai-word-type" className="block text-sm font-medium mb-1">
                    {t('aiWordTypeLabel')}
                  </label>
                  <select
                    id="ai-word-type"
                    value={target.wordType ?? 'regular'}
                    onChange={(e) =>
                      setTarget((prev) => ({
                        ...prev,
                        wordType: e.target.value as ExerciseTargetParams['wordType'],
                      }))
                    }
                    className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    <option value="regular">{t('aiWord_regular')}</option>
                    <option value="irregular">{t('aiWord_irregular')}</option>
                    <option value="pseudo_words">{t('aiWord_pseudo')}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="ai-read-lvl" className="block text-sm font-medium mb-1">
                    {t('aiReadingLevelLabel')}
                  </label>
                  <select
                    id="ai-read-lvl"
                    value={target.readingLevel ?? 'beginner'}
                    onChange={(e) =>
                      setTarget((prev) => ({
                        ...prev,
                        readingLevel: e.target.value as ExerciseTargetParams['readingLevel'],
                      }))
                    }
                    className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    <option value="beginner">{t('aiLevel_beginner')}</option>
                    <option value="intermediate">{t('aiLevel_intermediate')}</option>
                    <option value="advanced">{t('aiLevel_advanced')}</option>
                  </select>
                </div>
              </div>
            )}

            {category === 'fluency' && (
              <div>
                <span className="block text-sm font-medium mb-2">{t('aiFluencyTechLabel')}</span>
                <div className="flex flex-wrap gap-2">
                  {FLUENCY_TECHNIQUES.map((tech) => {
                    const active = (target.fluencyTechniques ?? []).includes(tech);
                    return (
                      <button
                        key={tech}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setTarget((prev) => ({
                            ...prev,
                            fluencyTechniques: toggleInArray(prev.fluencyTechniques, tech),
                          }))
                        }
                        className={`min-h-10 rounded-lg border px-3 py-1 text-xs font-medium ${
                          active
                            ? 'accent-bg border-transparent'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
                        }`}
                      >
                        {t(`aiFlu_${tech}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {category === 'voice' && (
              <div>
                <span className="block text-sm font-medium mb-2">{t('aiVoiceFocusLabel')}</span>
                <div className="flex flex-wrap gap-2">
                  {VOICE_FOCUS_OPTIONS.map((vf) => {
                    const active = (target.voiceFocus ?? []).includes(vf);
                    return (
                      <button
                        key={vf}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setTarget((prev) => ({
                            ...prev,
                            voiceFocus: toggleInArray(prev.voiceFocus, vf),
                          }))
                        }
                        className={`min-h-10 rounded-lg border px-3 py-1 text-xs font-medium ${
                          active
                            ? 'accent-bg border-transparent'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
                        }`}
                      >
                        {t(
                          vf === 'vocal_hygiene'
                            ? 'aiVoice_hygiene'
                            : vf === 'breathing'
                              ? 'aiVoice_breathing'
                              : 'aiVoice_resonance',
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {category === 'dyscalculia' && (
              <div className="space-y-3">
                <div>
                  <label htmlFor="ai-count-range" className="block text-sm font-medium mb-1">
                    {t('aiCountingRangeLabel')}
                  </label>
                  <select
                    id="ai-count-range"
                    value={target.countingRange ?? '1-20'}
                    onChange={(e) =>
                      setTarget((prev) => ({
                        ...prev,
                        countingRange: e.target.value as ExerciseTargetParams['countingRange'],
                      }))
                    }
                    className="w-full sm:w-48 min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
                  >
                    <option value="1-10">1 – 10</option>
                    <option value="1-20">1 – 20</option>
                    <option value="1-100">1 – 100</option>
                    <option value="100+">100+</option>
                  </select>
                </div>
                <div>
                  <span className="block text-sm font-medium mb-2">{t('aiMathOpsLabel')}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {MATH_OPS_OPTIONS.map((op) => {
                      const active = (target.mathOps ?? []).includes(op);
                      return (
                        <button
                          key={op}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            setTarget((prev) => ({
                              ...prev,
                              mathOps: toggleInArray(prev.mathOps, op),
                            }))
                          }
                          className={`min-h-10 rounded-lg border px-3 py-1 text-xs font-medium ${
                            active
                              ? 'accent-bg border-transparent'
                              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
                          }`}
                        >
                          {t(`aiMath_${op}`)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {category === 'aphasia' && (
              <div>
                <span className="block text-sm font-medium mb-2">{t('aiAphasiaTasksLabel')}</span>
                <div className="flex flex-wrap gap-2">
                  {APHASIA_TASKS_OPTIONS.map((task) => {
                    const active = (target.aphasiaTasks ?? []).includes(task);
                    const key: TranslationKey =
                      task === 'naming_categories'
                        ? 'aiAph_naming'
                        : task === 'sentence_completion'
                          ? 'aiAph_completion'
                          : 'aiAph_daily';
                    return (
                      <button
                        key={task}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setTarget((prev) => ({
                            ...prev,
                            aphasiaTasks: toggleInArray(prev.aphasiaTasks, task),
                          }))
                        }
                        className={`min-h-10 rounded-lg border px-3 py-1 text-xs font-medium ${
                          active
                            ? 'accent-bg border-transparent'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
                        }`}
                      >
                        {t(key)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {category === 'other' && (
              <div>
                <label htmlFor="ai-other-focus" className="block text-sm font-medium mb-1">
                  {t('aiOtherFocusLabel')}
                </label>
                <select
                  id="ai-other-focus"
                  value={target.otherFocus ?? 'general_stimulation'}
                  onChange={(e) =>
                    setTarget((prev) => ({...prev, otherFocus: e.target.value}))
                  }
                  className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                >
                  {OTHER_FOCUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {t(`aiOther_${opt}`)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Language, Difficulty, Length, Routine */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="ai-out-lang" className="block text-sm font-medium mb-1">
                {t('aiOutputLangLabel')}
              </label>
              <select
                id="ai-out-lang"
                value={outputLanguage}
                onChange={(e) => setOutputLanguage(e.target.value as OutputLanguage)}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="fr">{t('aiLang_fr')}</option>
                <option value="ar_msa">{t('aiLang_ar_msa')}</option>
                <option value="ar_darija_instructions">{t('aiLang_ar_darija')}</option>
                <option value="bilingual_fr_ar">{t('aiLang_bilingual')}</option>
              </select>
            </div>

            <div>
              <label htmlFor="ai-difficulty" className="block text-sm font-medium mb-1">
                {t('aiDifficultyLabel')}
              </label>
              <select
                id="ai-difficulty"
                value={difficulty}
                onChange={(e) =>
                  setDifficulty(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)
                }
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
              >
                {[1, 2, 3, 4, 5].map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl} / 5
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ai-length" className="block text-sm font-medium mb-1">
                {t('aiLengthLabel')}
              </label>
              <select
                id="ai-length"
                value={length}
                onChange={(e) => setLength(e.target.value as SheetLength)}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="short">{t('aiLength_short')}</option>
                <option value="standard">{t('aiLength_standard')}</option>
              </select>
            </div>

            <div>
              <label htmlFor="ai-min-day" className="block text-sm font-medium mb-1">
                {t('aiRoutineMinLabel')}
              </label>
              <input
                id="ai-min-day"
                type="number"
                min={5}
                max={30}
                value={minutesPerDay}
                onChange={(e) => setMinutesPerDay(Number(e.target.value))}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="ai-days-wk" className="block text-sm font-medium mb-1">
                {t('aiRoutineDaysLabel')}
              </label>
              <input
                id="ai-days-wk"
                type="number"
                min={1}
                max={7}
                value={daysPerWeek}
                onChange={(e) => setDaysPerWeek(Number(e.target.value))}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="ai-interests" className="block text-sm font-medium mb-1">
                {t('aiInterestsLabel')}
              </label>
              <input
                id="ai-interests"
                type="text"
                maxLength={60}
                value={interests}
                placeholder={t('aiInterestsPlaceholder')}
                onChange={(e) => setInterests(e.target.value)}
                className={`w-full min-h-11 rounded-lg border bg-white dark:bg-slate-950 px-3 py-2 text-sm ${
                  interestsValid
                    ? 'border-slate-300 dark:border-slate-700'
                    : 'border-red-500'
                }`}
              />
              {!interestsValid && (
                <p role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                  {t('aiPrivacyGuardError')}
                </p>
              )}
            </div>

            <div className="sm:col-span-4">
              <label htmlFor="ai-special-note" className="block text-sm font-medium mb-1">
                {t('aiSpecialNoteLabel')}
              </label>
              <input
                id="ai-special-note"
                type="text"
                maxLength={120}
                value={specialNote}
                placeholder={t('aiSpecialNotePlaceholder')}
                onChange={(e) => setSpecialNote(e.target.value)}
                className={`w-full min-h-11 rounded-lg border bg-white dark:bg-slate-950 px-3 py-2 text-sm ${
                  specialNoteValid
                    ? 'border-slate-300 dark:border-slate-700'
                    : 'border-red-500'
                }`}
              />
              {!specialNoteValid && (
                <p role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                  {t('aiPrivacyGuardError')}
                </p>
              )}
            </div>
          </div>

          {/* What will be sent panel */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold">{t('aiWhatSentTitle')}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {t('aiRateLimitLabel')} {rateLeft} / 10
              </span>
            </div>
            <pre
              dir="ltr"
              className="max-h-48 overflow-auto rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-xs font-mono text-slate-700 dark:text-slate-300"
            >
              {JSON.stringify(payload, null, 2)}
            </pre>

            <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={sessionConsentChecked}
                onChange={(e) => onChangeSessionConsent(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span>{t('aiWhatSentCheck')}</span>
            </label>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                disabled={
                  busy ||
                  !sessionConsentChecked ||
                  !interestsValid ||
                  !specialNoteValid ||
                  rateLeft <= 0
                }
                onClick={handleGenerate}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg accent-bg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t('aiGeneratingLabel')}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>{t('aiGenerateBtn')}</span>
                  </>
                )}
              </button>

              {busy && (
                <button
                  type="button"
                  onClick={handleCancelGeneration}
                  className="min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium"
                >
                  {t('cancel')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Editable Generated Sheet */}
      {tab === 'editor' && sheet && (
        <div className="space-y-5">
          {/* Verification banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50 p-3.5 text-sm text-amber-950 dark:text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="font-medium">{t('aiDraftBanner')}</span>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={validated}
                onChange={(e) => setValidated(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span>{t('aiReviewedCheckbox')}</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={busy || rateLeft <= 0}
              onClick={handleGenerate}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span>{busy ? t('aiGeneratingLabel') : t('aiRegenerateBtn')}</span>
            </button>
            {busy && (
              <button
                type="button"
                onClick={handleCancelGeneration}
                className="min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium"
              >
                {t('cancel')}
              </button>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                {t('aiTitleField')}
              </label>
              <input
                type="text"
                value={sheet.title}
                onChange={(e) => setSheet({...sheet, title: e.target.value})}
                className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-base font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                {t('aiObjectiveField')}
              </label>
              <textarea
                rows={2}
                value={sheet.objective}
                onChange={(e) => setSheet({...sheet, objective: e.target.value})}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Parent Tips */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{t('aiTipsField')}</span>
              {sheet.parentTips.length < 5 && (
                <button
                  type="button"
                  onClick={() =>
                    setSheet({...sheet, parentTips: [...sheet.parentTips, '']})
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold accent-text"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t('aiAddTipBtn')}</span>
                </button>
              )}
            </div>
            <div className="space-y-2">
              {sheet.parentTips.map((tip, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={tip}
                    onChange={(e) =>
                      setSheet({
                        ...sheet,
                        parentTips: sheet.parentTips.map((x, idx) =>
                          idx === i ? e.target.value : x,
                        ),
                      })
                    }
                    className="flex-1 min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    aria-label={t('delete')}
                    onClick={() =>
                      setSheet({
                        ...sheet,
                        parentTips: sheet.parentTips.filter((_, idx) => idx !== i),
                      })
                    }
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Activities */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{t('aiActivitiesField')}</span>
              <button
                type="button"
                onClick={() =>
                  setSheet({
                    ...sheet,
                    activities: [
                      ...sheet.activities,
                      {
                        name: t('aiActivitiesField'),
                        type: 'other',
                        instructions: '',
                        items: [{text: ''}],
                      },
                    ],
                  })
                }
                className="inline-flex items-center gap-1 text-xs font-semibold accent-text"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{t('aiAddActivityBtn')}</span>
              </button>
            </div>

            {sheet.activities.map((act, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-1 min-w-[200px] items-center gap-2">
                    <input
                      type="text"
                      aria-label={t('aiActivityNameField')}
                      value={act.name}
                      onChange={(e) => updateActivity(idx, {name: e.target.value})}
                      className="flex-1 min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm font-semibold"
                    />
                    <select
                      aria-label={t('kindLabel')}
                      value={act.type}
                      onChange={(e) =>
                        updateActivity(idx, {type: e.target.value as ActivityType})
                      }
                      className="min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
                    >
                      {VALID_ACTIVITY_TYPES.map((tp) => (
                        <option key={tp} value={tp}>
                          {tp}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={regenActIdx !== null || busy || rateLeft <= 0}
                      onClick={() => handleRegenerateActivity(idx)}
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-45"
                    >
                      {regenActIdx === idx ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      <span>{t('aiRegenerateActivityBtn')}</span>
                    </button>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveActivity(idx, -1)}
                      aria-label="Up"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === sheet.activities.length - 1}
                      onClick={() => moveActivity(idx, 1)}
                      aria-label="Down"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={sheet.activities.length <= 1}
                      onClick={() =>
                        setSheet({
                          ...sheet,
                          activities: sheet.activities.filter((_, i) => i !== idx),
                        })
                      }
                      aria-label={t('delete')}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    {t('aiActivityInstructionsField')}
                  </label>
                  <textarea
                    rows={2}
                    value={act.instructions}
                    onChange={(e) => updateActivity(idx, {instructions: e.target.value})}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  {act.items.map((it, itemIdx) => (
                    <div key={itemIdx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        aria-label={t('aiItemTextField')}
                        placeholder={t('aiItemTextField')}
                        value={it.text}
                        onChange={(e) => updateItem(idx, itemIdx, {text: e.target.value})}
                        className="sm:col-span-5 min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm"
                      />
                      <input
                        type="text"
                        aria-label={t('aiItemTargetField')}
                        placeholder={t('aiItemTargetField')}
                        value={it.target ?? ''}
                        onChange={(e) => updateItem(idx, itemIdx, {target: e.target.value})}
                        className="sm:col-span-3 min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                      />
                      <input
                        type="text"
                        aria-label={t('aiItemTranslationField')}
                        placeholder={t('aiItemTranslationField')}
                        value={it.translation ?? ''}
                        onChange={(e) =>
                          updateItem(idx, itemIdx, {translation: e.target.value})
                        }
                        className="sm:col-span-3 min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm"
                      />
                      <button
                        type="button"
                        aria-label={t('delete')}
                        onClick={() =>
                          updateActivity(idx, {
                            items: act.items.filter((_, j) => j !== itemIdx),
                          })
                        }
                        className="sm:col-span-1 inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      updateActivity(idx, {items: [...act.items, {text: ''}]})
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold accent-text"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{t('aiAddItemBtn')}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Progress Grid & Closing Note */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                {t('aiProgressGridField')}
              </span>
              <div className="grid grid-cols-7 gap-1.5">
                {sheet.progressGrid.map((d, i) => (
                  <input
                    key={i}
                    type="text"
                    value={d}
                    onChange={(e) =>
                      setSheet({
                        ...sheet,
                        progressGrid: sheet.progressGrid.map((x, idx) =>
                          idx === i ? e.target.value : x,
                        ),
                      })
                    }
                    className="min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-1 text-center text-xs"
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                {t('aiClosingNoteField')}
              </label>
              <input
                type="text"
                value={sheet.closingNote}
                onChange={(e) => setSheet({...sheet, closingNote: e.target.value})}
                className="w-full min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Local Library ("Mes fiches") */}
      {tab === 'library' && (
        <div className="space-y-3">
          {db.aiSheets.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              {t('aiLibraryEmpty')}
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
              {db.aiSheets.map((saved) => (
                <div
                  key={saved.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{saved.sheet.title}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {t(`aiCat_${saved.params.category}`)} · {saved.params.ageBand} ·{' '}
                      {new Date(saved.updatedAt).toLocaleDateString(
                        lang === 'ar' ? 'ar-DZ-u-nu-latn' : 'fr-FR',
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setSheet(structuredClone(saved.sheet));
                        setOutputLanguage(saved.params.outputLanguage);
                        setAgeBand(saved.params.ageBand);
                        setCategory(saved.params.category);
                        setTarget(saved.params.target);
                        setActiveLibraryId(saved.id);
                        setValidated(false);
                        setTab('editor');
                      }}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg accent-bg px-3 py-1.5 text-xs font-semibold"
                    >
                      <FilePlus2 className="h-3.5 w-3.5" />
                      <span>{t('aiUseSheetBtn')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteFromLibrary(saved.id)}
                      aria-label={t('delete')}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
