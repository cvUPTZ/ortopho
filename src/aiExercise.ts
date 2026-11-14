import type {
  ActivityType,
  AgeBand,
  AiExerciseRequestPayload,
  DisorderCategory,
  ExerciseActivity,
  ExerciseItem,
  ExerciseSheet,
  ExerciseTargetParams,
  Lang,
  OutputLanguage,
  Patient,
} from './types';
import {computeAge} from './utils';

export const ARTICULATION_SOUNDS = [
  '/s/',
  '/ʃ/',
  '/r/',
  '/k/',
  '/ʕ/',
  '/q/',
  '/ʒ/',
  '/z/',
  '/t/',
  '/d/',
  '/l/',
  '/f/',
  '/x/',
  '/ħ/',
  '/θ/',
] as const;

export const VOCAB_THEMES = [
  'family',
  'body',
  'food',
  'school',
  'animals',
  'home',
  'clothes',
  'transport',
] as const;

export const FLUENCY_TECHNIQUES = ['easy_onset', 'slow_rate', 'breathing', 'pausing'] as const;
export const VOICE_FOCUS_OPTIONS = ['breathing', 'vocal_hygiene', 'resonance'] as const;
export const MATH_OPS_OPTIONS = [
  'counting',
  'comparison',
  'addition',
  'subtraction',
  'word_problems',
] as const;
export const APHASIA_TASKS_OPTIONS = [
  'naming_categories',
  'sentence_completion',
  'daily_life_phrases',
] as const;
export const OTHER_FOCUS_OPTIONS = [
  'oral_motor',
  'pragmatics',
  'attention_memory',
  'general_stimulation',
] as const;

export const VALID_ACTIVITY_TYPES: readonly ActivityType[] = [
  'wordList',
  'minimalPairs',
  'sentences',
  'shortStory',
  'game',
  'breathingOrVoice',
  'counting',
  'other',
];

export function computeAgeBand(naissance: string): AgeBand {
  const age = computeAge(naissance);
  if (age === null) return '5-6';
  if (age <= 4) return '3-4';
  if (age <= 6) return '5-6';
  if (age <= 8) return '7-8';
  if (age <= 11) return '9-11';
  if (age <= 15) return '12-15';
  return 'adult';
}

export function mapPathoToCategory(patho: string): DisorderCategory {
  switch (patho) {
    case '0':
      return 'language_delay';
    case '1':
      return 'articulation';
    case '2':
      return 'fluency';
    case '3':
      return 'dyslexia';
    case '4':
      return 'dyscalculia';
    case '5':
      return 'voice';
    case '6':
      return 'aphasia';
    case '7':
      return 'language_delay';
    default:
      return 'other';
  }
}

export function prefillFromPatient(patient: Patient | null): {
  ageBand: AgeBand;
  category: DisorderCategory;
} {
  if (!patient) {
    return {ageBand: '5-6', category: 'articulation'};
  }
  return {
    ageBand: computeAgeBand(patient.naissance),
    category: mapPathoToCategory(patient.patho),
  };
}

/**
 * Rejects text containing digits, '@', URLs, or two consecutive capitalized words (likely a person's name).
 */
export function validatePrivacyText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/\d/.test(trimmed)) return false;
  if (trimmed.includes('@')) return false;
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|dz|fr|io|app|me)\b/i.test(trimmed)) {
    return false;
  }
  // Two consecutive capitalized words (Unicode uppercase followed by lowercase/hyphen/apostrophe)
  if (/\p{Lu}[\p{Ll}\p{M}'’-]*\s+\p{Lu}[\p{Ll}\p{M}'’-]*/u.test(trimmed)) {
    return false;
  }
  return true;
}

export function defaultTargetForCategory(category: DisorderCategory): ExerciseTargetParams {
  switch (category) {
    case 'articulation':
      return {sounds: ['/ʃ/'], position: 'initial'};
    case 'language_delay':
    case 'comprehension':
      return {
        vocabThemes: ['family', 'food'],
        sentenceLength: 'short_sentences',
        focusVerbs: true,
        focusPrepositions: false,
      };
    case 'dyslexia':
    case 'dysorthography':
      return {
        readingUnit: 'words',
        wordType: 'regular',
        readingLevel: 'beginner',
      };
    case 'fluency':
      return {fluencyTechniques: ['easy_onset', 'slow_rate']};
    case 'voice':
      return {voiceFocus: ['breathing', 'vocal_hygiene']};
    case 'dyscalculia':
      return {countingRange: '1-20', mathOps: ['counting', 'addition']};
    case 'aphasia':
      return {aphasiaTasks: ['naming_categories', 'daily_life_phrases']};
    default:
      return {otherFocus: 'general_stimulation'};
  }
}

export function buildExercisePayload(input: {
  ageBand: AgeBand;
  category: DisorderCategory;
  target: ExerciseTargetParams;
  outputLanguage: OutputLanguage;
  difficulty: 1 | 2 | 3 | 4 | 5;
  length: 'short' | 'standard';
  minutesPerDay: number;
  daysPerWeek: number;
  interests?: string;
  specialNote?: string;
}): AiExerciseRequestPayload {
  const cleanTarget: ExerciseTargetParams = {};
  switch (input.category) {
    case 'articulation':
      cleanTarget.sounds = Array.isArray(input.target.sounds) && input.target.sounds.length > 0
        ? input.target.sounds.slice(0, 5)
        : ['/s/'];
      cleanTarget.position = input.target.position ?? 'initial';
      break;
    case 'language_delay':
    case 'comprehension':
      cleanTarget.vocabThemes =
        Array.isArray(input.target.vocabThemes) && input.target.vocabThemes.length > 0
          ? input.target.vocabThemes.slice(0, 6)
          : ['family'];
      cleanTarget.sentenceLength = input.target.sentenceLength ?? 'short_sentences';
      cleanTarget.focusVerbs = Boolean(input.target.focusVerbs);
      cleanTarget.focusPrepositions = Boolean(input.target.focusPrepositions);
      break;
    case 'dyslexia':
    case 'dysorthography':
      cleanTarget.readingUnit = input.target.readingUnit ?? 'words';
      cleanTarget.wordType = input.target.wordType ?? 'regular';
      cleanTarget.readingLevel = input.target.readingLevel ?? 'beginner';
      break;
    case 'fluency':
      cleanTarget.fluencyTechniques =
        Array.isArray(input.target.fluencyTechniques) && input.target.fluencyTechniques.length > 0
          ? input.target.fluencyTechniques
          : ['easy_onset'];
      break;
    case 'voice':
      cleanTarget.voiceFocus =
        Array.isArray(input.target.voiceFocus) && input.target.voiceFocus.length > 0
          ? input.target.voiceFocus
          : ['breathing'];
      break;
    case 'dyscalculia':
      cleanTarget.countingRange = input.target.countingRange ?? '1-20';
      cleanTarget.mathOps =
        Array.isArray(input.target.mathOps) && input.target.mathOps.length > 0
          ? input.target.mathOps
          : ['counting'];
      break;
    case 'aphasia':
      cleanTarget.aphasiaTasks =
        Array.isArray(input.target.aphasiaTasks) && input.target.aphasiaTasks.length > 0
          ? input.target.aphasiaTasks
          : ['naming_categories'];
      break;
    default:
      cleanTarget.otherFocus = input.target.otherFocus ?? 'general_stimulation';
      break;
  }

  const interests = (input.interests ?? '').trim().slice(0, 60);
  const specialNote = (input.specialNote ?? '').trim().slice(0, 120);

  const payload: AiExerciseRequestPayload = {
    ageBand: input.ageBand,
    category: input.category,
    target: cleanTarget,
    outputLanguage: input.outputLanguage,
    difficulty: Math.min(5, Math.max(1, Math.round(input.difficulty))) as 1 | 2 | 3 | 4 | 5,
    length: input.length,
    routine: {
      minutesPerDay: Math.min(30, Math.max(5, Math.round(input.minutesPerDay))),
      daysPerWeek: Math.min(7, Math.max(1, Math.round(input.daysPerWeek))),
    },
  };

  if (interests && validatePrivacyText(interests)) {
    payload.interests = interests;
  }
  if (specialNote && validatePrivacyText(specialNote)) {
    payload.specialNote = specialNote;
  }

  return payload;
}

export function validateExerciseSheet(raw: unknown): ExerciseSheet | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.title !== 'string' || !obj.title.trim()) return null;
  if (typeof obj.objective !== 'string' || !obj.objective.trim()) return null;
  if (!Array.isArray(obj.activities) || obj.activities.length === 0) return null;

  const parentTips: string[] = Array.isArray(obj.parentTips)
    ? obj.parentTips
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim().slice(0, 400))
        .slice(0, 5)
    : [];

  const activities: ExerciseActivity[] = [];
  for (const act of obj.activities.slice(0, 8)) {
    if (!act || typeof act !== 'object') continue;
    const a = act as Record<string, unknown>;
    if (typeof a.name !== 'string' || !a.name.trim()) continue;
    if (typeof a.instructions !== 'string' || !a.instructions.trim()) continue;
    const actType: ActivityType = VALID_ACTIVITY_TYPES.includes(a.type as ActivityType)
      ? (a.type as ActivityType)
      : 'other';

    const items: ExerciseItem[] = [];
    if (Array.isArray(a.items)) {
      for (const it of a.items.slice(0, 30)) {
        if (!it || typeof it !== 'object') continue;
        const item = it as Record<string, unknown>;
        if (typeof item.text !== 'string' || !item.text.trim()) continue;
        const cleanItem: ExerciseItem = {text: item.text.trim().slice(0, 300)};
        if (typeof item.translation === 'string' && item.translation.trim()) {
          cleanItem.translation = item.translation.trim().slice(0, 300);
        }
        if (typeof item.target === 'string' && item.target.trim()) {
          cleanItem.target = item.target.trim().slice(0, 100);
        }
        items.push(cleanItem);
      }
    }

    activities.push({
      name: a.name.trim().slice(0, 200),
      type: actType,
      instructions: a.instructions.trim().slice(0, 1000),
      items,
    });
  }

  if (activities.length === 0) return null;

  const rawRoutine =
    obj.routine && typeof obj.routine === 'object'
      ? (obj.routine as Record<string, unknown>)
      : {};
  const minutesPerDay =
    typeof rawRoutine.minutesPerDay === 'number' && Number.isFinite(rawRoutine.minutesPerDay)
      ? Math.min(30, Math.max(5, Math.round(rawRoutine.minutesPerDay)))
      : 10;
  const daysPerWeek =
    typeof rawRoutine.daysPerWeek === 'number' && Number.isFinite(rawRoutine.daysPerWeek)
      ? Math.min(7, Math.max(1, Math.round(rawRoutine.daysPerWeek)))
      : 5;

  const progressGrid: string[] = Array.isArray(obj.progressGrid)
    ? obj.progressGrid
        .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
        .map((d) => d.trim().slice(0, 30))
        .slice(0, 7)
    : [];
  while (progressGrid.length < 7) {
    progressGrid.push(`J${progressGrid.length + 1}`);
  }

  const closingNote =
    typeof obj.closingNote === 'string' ? obj.closingNote.trim().slice(0, 500) : '';

  return {
    title: obj.title.trim().slice(0, 200),
    objective: obj.objective.trim().slice(0, 600),
    parentTips,
    activities,
    routine: {minutesPerDay, daysPerWeek},
    progressGrid,
    closingNote,
  };
}

export function exerciseSheetToBilanText(
  sheet: ExerciseSheet,
  lang: Lang,
): {tests: string; concl: string} {
  const headings =
    lang === 'ar'
      ? {
          obj: 'الهدف',
          ex: 'التمارين المقترحة',
          freq: 'التكرار والمدة',
          tips: 'نصائح وإرشادات للأولياء',
          next: 'الموعد القادم',
          minDay: 'دقيقة / يوم',
          daysWk: 'أيام / أسبوع',
        }
      : {
          obj: 'Objectif',
          ex: 'Exercices',
          freq: 'Fréquence et durée',
          tips: 'Conseils aux parents',
          next: 'Prochain rendez-vous',
          minDay: 'minutes / jour',
          daysWk: 'jours / semaine',
        };

  const exercisesText = sheet.activities
    .map((act, idx) => {
      const lines = [`${idx + 1}. ${act.name}`, act.instructions];
      for (const item of act.items) {
        const extra = [item.target ? `[${item.target}]` : '', item.translation || '']
          .filter(Boolean)
          .join(' — ');
        lines.push(`- ${item.text}${extra ? ` (${extra})` : ''}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');

  const tipsLines = [...sheet.parentTips];
  if (sheet.closingNote) {
    tipsLines.push(sheet.closingNote);
  }

  const tests = [
    `■ ${headings.obj}\n${sheet.title}\n${sheet.objective}`,
    `■ ${headings.ex}\n${exercisesText}`,
    `■ ${headings.freq}\n${sheet.routine.minutesPerDay} ${headings.minDay} · ${sheet.routine.daysPerWeek} ${headings.daysWk}`,
    `■ ${headings.tips}\n${tipsLines.map((t) => `- ${t}`).join('\n')}`,
  ].join('\n\n');

  const concl = `■ ${headings.next}\n\n`;

  return {tests, concl};
}

export type AiErrorCode =
  | 'key'
  | 'quota'
  | 'network'
  | 'blocked'
  | 'malformed'
  | 'timeout'
  | 'cancelled';

export class AiCallError extends Error {
  code: AiErrorCode;
  constructor(code: AiErrorCode) {
    super(code);
    this.code = code;
  }
}

const VALID_ERROR_CODES: readonly AiErrorCode[] = [
  'key',
  'quota',
  'network',
  'blocked',
  'malformed',
  'timeout',
  'cancelled',
];

function classifyFetchError(err: unknown): AiErrorCode {
  if (err instanceof AiCallError) return err.code;
  const msg =
    err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
      ? err.message.toLowerCase()
      : '';
  if (msg.includes('abort') || msg.includes('cancel')) return 'cancelled';
  return 'network';
}

// Rolling 1-hour rate limit (max 10 generations per hour)
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const generationTimestamps: number[] = [];

export function remainingGenerationsThisHour(now = Date.now()): number {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  while (generationTimestamps.length > 0 && generationTimestamps[0] < cutoff) {
    generationTimestamps.shift();
  }
  return Math.max(0, RATE_LIMIT_MAX - generationTimestamps.length);
}

export function recordGenerationTimestamp(now = Date.now()): void {
  remainingGenerationsThisHour(now);
  generationTimestamps.push(now);
}

async function callWithTimeoutAndSignal<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  externalSignal?: AbortSignal,
  timeoutMs = 20_000,
): Promise<T> {
  if (externalSignal?.aborted) {
    throw new AiCallError('cancelled');
  }
  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort, {once: true});

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await Promise.race([
      fn(controller.signal),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          'abort',
          () => {
            reject(new AiCallError(timedOut ? 'timeout' : 'cancelled'));
          },
          {once: true},
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

async function postJsonToServer<T>(
  url: string,
  body: unknown,
  externalSignal?: AbortSignal,
): Promise<T> {
  return callWithTimeoutAndSignal(
    async (sig) => {
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(body),
          signal: sig,
        });
      } catch (err) {
        throw new AiCallError(classifyFetchError(err));
      }

      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        throw new AiCallError(res.ok ? 'malformed' : 'network');
      }

      if (!res.ok) {
        const errCode =
          parsed && typeof parsed === 'object' && 'error' in parsed
            ? (parsed as {error?: unknown}).error
            : undefined;
        if (typeof errCode === 'string' && VALID_ERROR_CODES.includes(errCode as AiErrorCode)) {
          throw new AiCallError(errCode as AiErrorCode);
        }
        if (res.status === 401 || res.status === 403 || res.status === 503) {
          throw new AiCallError('key');
        }
        if (res.status === 429 || res.status === 404) {
          throw new AiCallError('quota');
        }
        if (res.status === 504) {
          throw new AiCallError('timeout');
        }
        throw new AiCallError('network');
      }

      return parsed as T;
    },
    externalSignal,
    20_000,
  );
}

export async function generateExerciseSheet(params: {
  model: string;
  payload: AiExerciseRequestPayload;
  signal?: AbortSignal;
}): Promise<ExerciseSheet> {
  const modelName = params.model.trim() || 'gemini-2.5-flash';
  const data = await postJsonToServer<{sheet?: unknown}>(
    '/api/gemini/generate-sheet',
    {
      model: modelName,
      payload: params.payload,
    },
    params.signal,
  );

  const validated = validateExerciseSheet(data.sheet);
  if (!validated) {
    throw new AiCallError('malformed');
  }
  return validated;
}

export async function regenerateSingleActivity(params: {
  model: string;
  payload: AiExerciseRequestPayload;
  existingSheet: ExerciseSheet;
  activityIndex: number;
  signal?: AbortSignal;
}): Promise<ExerciseActivity> {
  const modelName = params.model.trim() || 'gemini-2.5-flash';
  const currentAct = params.existingSheet.activities[params.activityIndex];

  const data = await postJsonToServer<{activity?: unknown}>(
    '/api/gemini/regenerate-activity',
    {
      model: modelName,
      payload: params.payload,
      previousActivityName: currentAct?.name ?? '',
    },
    params.signal,
  );

  const wrapped = validateExerciseSheet({
    title: 'temp',
    objective: 'temp',
    parentTips: [],
    activities: [data.activity],
    routine: {minutesPerDay: 10, daysPerWeek: 5},
    progressGrid: ['1', '2', '3', '4', '5', '6', '7'],
    closingNote: '',
  });
  if (!wrapped || wrapped.activities.length === 0) {
    throw new AiCallError('malformed');
  }
  return wrapped.activities[0];
}
