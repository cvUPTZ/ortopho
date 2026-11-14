import {GoogleGenAI, Type} from '@google/genai';

export type AiErrorCode =
  | 'key'
  | 'quota'
  | 'network'
  | 'blocked'
  | 'malformed'
  | 'timeout'
  | 'cancelled';

export class ServerAiError extends Error {
  code: AiErrorCode;
  status: number;

  constructor(code: AiErrorCode, status = 500) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export type AgeBand = '3-4' | '5-6' | '7-8' | '9-11' | '12-15' | 'adult';
export type DisorderCategory =
  | 'articulation'
  | 'language_delay'
  | 'comprehension'
  | 'fluency'
  | 'dyslexia'
  | 'dysorthography'
  | 'voice'
  | 'dyscalculia'
  | 'aphasia'
  | 'other';
export type OutputLanguage = 'fr' | 'ar_msa' | 'ar_darija_instructions' | 'bilingual_fr_ar';
export type SheetLength = 'short' | 'standard';
export type ActivityType =
  | 'wordList'
  | 'minimalPairs'
  | 'sentences'
  | 'shortStory'
  | 'game'
  | 'breathingOrVoice'
  | 'counting'
  | 'other';

export interface ExerciseItem {
  text: string;
  translation?: string;
  target?: string;
}

export interface ExerciseActivity {
  name: string;
  type: ActivityType;
  instructions: string;
  items: ExerciseItem[];
}

export interface ExerciseSheet {
  title: string;
  objective: string;
  parentTips: string[];
  activities: ExerciseActivity[];
  routine: {
    minutesPerDay: number;
    daysPerWeek: number;
  };
  progressGrid: string[];
  closingNote: string;
}

export interface ExerciseTargetParams {
  sounds?: string[];
  position?: 'initial' | 'medial' | 'final' | 'clusters';
  vocabThemes?: string[];
  sentenceLength?: '2-3_words' | 'short_sentences' | 'complex_sentences';
  focusVerbs?: boolean;
  focusPrepositions?: boolean;
  readingUnit?: 'letters' | 'syllables' | 'words' | 'sentences';
  wordType?: 'regular' | 'irregular' | 'pseudo_words';
  readingLevel?: 'beginner' | 'intermediate' | 'advanced';
  fluencyTechniques?: string[];
  voiceFocus?: string[];
  countingRange?: '1-10' | '1-20' | '1-100' | '100+';
  mathOps?: string[];
  aphasiaTasks?: string[];
  otherFocus?: string;
}

export interface AiExerciseRequestPayload {
  ageBand: AgeBand;
  category: DisorderCategory;
  target: ExerciseTargetParams;
  outputLanguage: OutputLanguage;
  difficulty: 1 | 2 | 3 | 4 | 5;
  length: SheetLength;
  routine: {
    minutesPerDay: number;
    daysPerWeek: number;
  };
  interests?: string;
  specialNote?: string;
}

const VALID_AGE_BANDS: readonly AgeBand[] = ['3-4', '5-6', '7-8', '9-11', '12-15', 'adult'];
const VALID_CATEGORIES: readonly DisorderCategory[] = [
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
const VALID_OUTPUT_LANGUAGES: readonly OutputLanguage[] = [
  'fr',
  'ar_msa',
  'ar_darija_instructions',
  'bilingual_fr_ar',
];
const VALID_ACTIVITY_TYPES: readonly ActivityType[] = [
  'wordList',
  'minimalPairs',
  'sentences',
  'shortStory',
  'game',
  'breathingOrVoice',
  'counting',
  'other',
];

function validatePrivacyText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/\d/.test(trimmed)) return false;
  if (trimmed.includes('@')) return false;
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|dz|fr|io|app|me)\b/i.test(trimmed)) {
    return false;
  }
  if (/\p{Lu}[\p{Ll}\p{M}'’-]*\s+\p{Lu}[\p{Ll}\p{M}'’-]*/u.test(trimmed)) {
    return false;
  }
  return true;
}

function sanitizeStrArray(val: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim().slice(0, maxLen))
    .slice(0, maxItems);
}

export function sanitizeRequestPayload(raw: unknown): AiExerciseRequestPayload {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const ageBand: AgeBand = VALID_AGE_BANDS.includes(src.ageBand as AgeBand)
    ? (src.ageBand as AgeBand)
    : '5-6';
  const category: DisorderCategory = VALID_CATEGORIES.includes(src.category as DisorderCategory)
    ? (src.category as DisorderCategory)
    : 'articulation';
  const outputLanguage: OutputLanguage = VALID_OUTPUT_LANGUAGES.includes(
    src.outputLanguage as OutputLanguage,
  )
    ? (src.outputLanguage as OutputLanguage)
    : 'fr';
  const difficultyNum = Number(src.difficulty);
  const difficulty = (
    Number.isFinite(difficultyNum) ? Math.min(5, Math.max(1, Math.round(difficultyNum))) : 2
  ) as 1 | 2 | 3 | 4 | 5;
  const length: SheetLength = src.length === 'standard' ? 'standard' : 'short';

  const rawRoutine =
    src.routine && typeof src.routine === 'object'
      ? (src.routine as Record<string, unknown>)
      : {};
  const minRaw = Number(rawRoutine.minutesPerDay);
  const daysRaw = Number(rawRoutine.daysPerWeek);
  const minutesPerDay = Number.isFinite(minRaw)
    ? Math.min(30, Math.max(5, Math.round(minRaw)))
    : 10;
  const daysPerWeek = Number.isFinite(daysRaw)
    ? Math.min(7, Math.max(1, Math.round(daysRaw)))
    : 5;

  const rawTarget =
    src.target && typeof src.target === 'object'
      ? (src.target as Record<string, unknown>)
      : {};
  const cleanTarget: ExerciseTargetParams = {};
  switch (category) {
    case 'articulation': {
      const sounds = sanitizeStrArray(rawTarget.sounds, 5, 20);
      cleanTarget.sounds = sounds.length > 0 ? sounds : ['/s/'];
      cleanTarget.position =
        rawTarget.position === 'medial' ||
        rawTarget.position === 'final' ||
        rawTarget.position === 'clusters'
          ? rawTarget.position
          : 'initial';
      break;
    }
    case 'language_delay':
    case 'comprehension': {
      const themes = sanitizeStrArray(rawTarget.vocabThemes, 6, 40);
      cleanTarget.vocabThemes = themes.length > 0 ? themes : ['family'];
      cleanTarget.sentenceLength =
        rawTarget.sentenceLength === '2-3_words' ||
        rawTarget.sentenceLength === 'complex_sentences'
          ? rawTarget.sentenceLength
          : 'short_sentences';
      cleanTarget.focusVerbs = Boolean(rawTarget.focusVerbs);
      cleanTarget.focusPrepositions = Boolean(rawTarget.focusPrepositions);
      break;
    }
    case 'dyslexia':
    case 'dysorthography':
      cleanTarget.readingUnit =
        rawTarget.readingUnit === 'letters' ||
        rawTarget.readingUnit === 'syllables' ||
        rawTarget.readingUnit === 'sentences'
          ? rawTarget.readingUnit
          : 'words';
      cleanTarget.wordType =
        rawTarget.wordType === 'irregular' || rawTarget.wordType === 'pseudo_words'
          ? rawTarget.wordType
          : 'regular';
      cleanTarget.readingLevel =
        rawTarget.readingLevel === 'intermediate' || rawTarget.readingLevel === 'advanced'
          ? rawTarget.readingLevel
          : 'beginner';
      break;
    case 'fluency': {
      const techs = sanitizeStrArray(rawTarget.fluencyTechniques, 6, 40);
      cleanTarget.fluencyTechniques = techs.length > 0 ? techs : ['easy_onset'];
      break;
    }
    case 'voice': {
      const focus = sanitizeStrArray(rawTarget.voiceFocus, 6, 40);
      cleanTarget.voiceFocus = focus.length > 0 ? focus : ['breathing'];
      break;
    }
    case 'dyscalculia': {
      cleanTarget.countingRange =
        rawTarget.countingRange === '1-10' ||
        rawTarget.countingRange === '1-100' ||
        rawTarget.countingRange === '100+'
          ? rawTarget.countingRange
          : '1-20';
      const ops = sanitizeStrArray(rawTarget.mathOps, 6, 40);
      cleanTarget.mathOps = ops.length > 0 ? ops : ['counting'];
      break;
    }
    case 'aphasia': {
      const tasks = sanitizeStrArray(rawTarget.aphasiaTasks, 6, 40);
      cleanTarget.aphasiaTasks = tasks.length > 0 ? tasks : ['naming_categories'];
      break;
    }
    default:
      cleanTarget.otherFocus =
        typeof rawTarget.otherFocus === 'string' && rawTarget.otherFocus.trim()
          ? rawTarget.otherFocus.trim().slice(0, 60)
          : 'general_stimulation';
      break;
  }

  const payload: AiExerciseRequestPayload = {
    ageBand,
    category,
    target: cleanTarget,
    outputLanguage,
    difficulty,
    length,
    routine: {minutesPerDay, daysPerWeek},
  };

  if (typeof src.interests === 'string') {
    const interests = src.interests.trim().slice(0, 60);
    if (interests && validatePrivacyText(interests)) {
      payload.interests = interests;
    }
  }
  if (typeof src.specialNote === 'string') {
    const specialNote = src.specialNote.trim().slice(0, 120);
    if (specialNote && validatePrivacyText(specialNote)) {
      payload.specialNote = specialNote;
    }
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

const BASE_SYSTEM_INSTRUCTION = `You are an assistant for licensed speech-language therapists. You write home-practice exercise sheets for parents. You never diagnose and never give medical advice. You never ask for or use personal information. Use only the parameters provided.
Rules:
- Age-appropriate, concrete, short, positive wording. One clear target per activity.
- Vocabulary must be common, everyday, culturally neutral for Algerian families (family, food, school, home). Avoid brand names and religious or political topics.
- For articulation targets, only use words that genuinely contain the target sound in the requested position; mark the target sound inside each word. If unsure that a word contains the sound, leave it out.
- Provide Arabic with full correct spelling; add diacritics (tashkeel) only where needed to avoid ambiguity. Never mix scripts inside one word.
- Parent instructions: max 5 short bullet points, plain language, no jargon.
- End with a reminder that the therapist adjusts the sheet to the child.
Return only JSON that matches the schema.`;

function buildSystemInstruction(outputLanguage: OutputLanguage): string {
  let langRule = '';
  switch (outputLanguage) {
    case 'fr':
      langRule =
        '\nOutput language rule: Write the entire sheet (title, objective, parentTips, instructions, items, progressGrid in French Mon-Sun or Dim-Sam, closingNote) in clear French.';
      break;
    case 'ar_msa':
      langRule =
        '\nOutput language rule: Write the entire sheet in Modern Standard Arabic (فصحى), including Arabic day labels.';
      break;
    case 'ar_darija_instructions':
      langRule =
        '\nOutput language rule: Write parentTips, activity instructions, and closingNote in natural, respectful Algerian Arabic dialect (دارجة جزائرية مكتوبة بالحرف العربي) easy for parents to read, and write target exercise items in clear Arabic (or target words matching the phoneme).';
      break;
    case 'bilingual_fr_ar':
      langRule =
        '\nOutput language rule: Write bilingual French + Arabic. Put French in text (or title/instructions) and provide the Arabic equivalent in translation (or bilingual phrasing), keeping both scripts clearly separated and never mixed inside a single word.';
      break;
  }
  return `${BASE_SYSTEM_INSTRUCTION}${langRule}`;
}

function buildUserPrompt(payload: AiExerciseRequestPayload): string {
  const activityCount = payload.length === 'short' ? '3 to 4' : '4 to 6';
  let articulationWarning = '';
  if (payload.category === 'articulation') {
    articulationWarning =
      '\nSTRICT PHONETIC CHECK: Double-check every single word in wordList/minimalPairs! Verify the exact phoneme and its exact position (initial = strictly the very first sound/letter of the word, e.g. /ʃ/ in French starts with "ch-" like chat/chaussure, and in Arabic starts with "شـ" like شمس/شجرة; never include words starting with a different sound). Wrap the target sound in brackets inside `target` or highlight it cleanly.';
  }
  return `Generate a structured home-practice exercise sheet with ${activityCount} activities for these clinical parameters (JSON):
${JSON.stringify(payload, null, 2)}${articulationWarning}`;
}

const EXERCISE_SHEET_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: {type: Type.STRING},
    objective: {type: Type.STRING},
    parentTips: {
      type: Type.ARRAY,
      items: {type: Type.STRING},
    },
    activities: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: {type: Type.STRING},
          type: {type: Type.STRING},
          instructions: {type: Type.STRING},
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: {type: Type.STRING},
                translation: {type: Type.STRING},
                target: {type: Type.STRING},
              },
              required: ['text'],
            },
          },
        },
        required: ['name', 'type', 'instructions', 'items'],
      },
    },
    routine: {
      type: Type.OBJECT,
      properties: {
        minutesPerDay: {type: Type.INTEGER},
        daysPerWeek: {type: Type.INTEGER},
      },
      required: ['minutesPerDay', 'daysPerWeek'],
    },
    progressGrid: {
      type: Type.ARRAY,
      items: {type: Type.STRING},
    },
    closingNote: {type: Type.STRING},
  },
  required: [
    'title',
    'objective',
    'parentTips',
    'activities',
    'routine',
    'progressGrid',
    'closingNote',
  ],
};

const ACTIVITY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: {type: Type.STRING},
    type: {type: Type.STRING},
    instructions: {type: Type.STRING},
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: {type: Type.STRING},
          translation: {type: Type.STRING},
          target: {type: Type.STRING},
        },
        required: ['text'],
      },
    },
  },
  required: ['name', 'type', 'instructions', 'items'],
};

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new ServerAiError('key', 503);
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sanitizeModelName(model: unknown): string {
  if (typeof model !== 'string') return 'gemini-2.5-flash';
  const trimmed = model.trim().slice(0, 120);
  if (!trimmed || !/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return 'gemini-2.5-flash';
  }
  return trimmed;
}

function classifySdkError(err: unknown): ServerAiError {
  if (err instanceof ServerAiError) return err;
  const msg =
    err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
      ? err.message.toLowerCase()
      : '';
  const status =
    err && typeof err === 'object' && 'status' in err && typeof err.status === 'number'
      ? err.status
      : 0;

  if (msg.includes('abort') || msg.includes('cancel')) {
    return new ServerAiError('cancelled', 499);
  }
  if (
    status === 401 ||
    status === 403 ||
    msg.includes('api key') ||
    msg.includes('api_key_invalid') ||
    msg.includes('permission_denied')
  ) {
    return new ServerAiError('key', 401);
  }
  if (
    status === 429 ||
    status === 404 ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('not_found')
  ) {
    return new ServerAiError('quota', status === 404 ? 404 : 429);
  }
  if (msg.includes('safety') || msg.includes('blocked') || msg.includes('finish_reason')) {
    return new ServerAiError('blocked', 422);
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return new ServerAiError('timeout', 504);
  }
  return new ServerAiError('network', 502);
}

async function callWithTimeoutAndSignal<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  externalSignal?: AbortSignal,
  timeoutMs = 20_000,
): Promise<T> {
  if (externalSignal?.aborted) {
    throw new ServerAiError('cancelled', 499);
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
            reject(
              timedOut
                ? new ServerAiError('timeout', 504)
                : new ServerAiError('cancelled', 499),
            );
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

function buildConfig(
  modelName: string,
  systemInstruction: string,
  schema: Record<string, unknown>,
  abortSignal: AbortSignal,
) {
  const isGemini4 = /^gemini-4-(hydrogen|argon|carbon)\b/i.test(modelName);
  return {
    systemInstruction,
    responseMimeType: 'application/json',
    responseSchema: schema,
    abortSignal,
    ...(isGemini4 ? {} : {temperature: 0.6}),
  };
}

export async function generateExerciseSheetOnServer(params: {
  model: unknown;
  payload: unknown;
  signal?: AbortSignal;
}): Promise<ExerciseSheet> {
  const ai = getGeminiClient();
  const modelName = sanitizeModelName(params.model);
  const payload = sanitizeRequestPayload(params.payload);
  const systemInstruction = buildSystemInstruction(payload.outputLanguage);
  const prompt = buildUserPrompt(payload);

  const attemptOnce = async (): Promise<ExerciseSheet> => {
    let rawText = '';
    try {
      const response = await callWithTimeoutAndSignal(
        (sig) =>
          ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: buildConfig(modelName, systemInstruction, EXERCISE_SHEET_SCHEMA, sig),
          }),
        params.signal,
        20_000,
      );
      const finishReason = response.candidates?.[0]?.finishReason;
      if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        throw new ServerAiError('blocked', 422);
      }
      rawText = (response.text ?? '').trim();
    } catch (err) {
      throw classifySdkError(err);
    }

    if (!rawText) {
      throw new ServerAiError('malformed', 502);
    }
    try {
      const parsed: unknown = JSON.parse(rawText);
      const validated = validateExerciseSheet(parsed);
      if (!validated) throw new ServerAiError('malformed', 502);
      return validated;
    } catch {
      throw new ServerAiError('malformed', 502);
    }
  };

  try {
    return await attemptOnce();
  } catch (err) {
    if (err instanceof ServerAiError && err.code === 'malformed') {
      return await attemptOnce();
    }
    throw err;
  }
}

export async function regenerateSingleActivityOnServer(params: {
  model: unknown;
  payload: unknown;
  previousActivityName: unknown;
  signal?: AbortSignal;
}): Promise<ExerciseActivity> {
  const ai = getGeminiClient();
  const modelName = sanitizeModelName(params.model);
  const payload = sanitizeRequestPayload(params.payload);
  const systemInstruction = buildSystemInstruction(payload.outputLanguage);
  const prevName =
    typeof params.previousActivityName === 'string'
      ? params.previousActivityName.trim().slice(0, 200)
      : '';

  const prompt = `Regenerate ONE fresh, different speech-therapy home activity replacing "${prevName}" for these parameters:
${JSON.stringify(payload, null, 2)}
Keep the same language and clinical target, but propose new items/examples not identical to the previous ones.`;

  const attemptOnce = async (): Promise<ExerciseActivity> => {
    let rawText = '';
    try {
      const response = await callWithTimeoutAndSignal(
        (sig) =>
          ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: buildConfig(modelName, systemInstruction, ACTIVITY_SCHEMA, sig),
          }),
        params.signal,
        20_000,
      );
      const finishReason = response.candidates?.[0]?.finishReason;
      if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        throw new ServerAiError('blocked', 422);
      }
      rawText = (response.text ?? '').trim();
    } catch (err) {
      throw classifySdkError(err);
    }

    if (!rawText) {
      throw new ServerAiError('malformed', 502);
    }
    try {
      const parsed: unknown = JSON.parse(rawText);
      const wrapped = validateExerciseSheet({
        title: 'temp',
        objective: 'temp',
        parentTips: [],
        activities: [parsed],
        routine: {minutesPerDay: 10, daysPerWeek: 5},
        progressGrid: ['1', '2', '3', '4', '5', '6', '7'],
        closingNote: '',
      });
      if (!wrapped || wrapped.activities.length === 0) {
        throw new ServerAiError('malformed', 502);
      }
      return wrapped.activities[0];
    } catch {
      throw new ServerAiError('malformed', 502);
    }
  };

  try {
    return await attemptOnce();
  } catch (err) {
    if (err instanceof ServerAiError && err.code === 'malformed') {
      return await attemptOnce();
    }
    throw err;
  }
}
