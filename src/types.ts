export type Lang = 'fr' | 'ar';
export type Stage = 'req' | 'diag' | 'orient' | 'suivi' | 'clos';
export type RdvStatut = 'prevu' | 'fait' | 'absent';
export type RdvKind = 'diag' | 'suivi';

export interface ExpertiseDomain {
  id: string;
  name: string;
  tarif: number;
}

export interface Staff {
  id: string;
  nom: string;
  role: 'main' | 'th';
  domainId?: string;
  specialite?: string;
  tarif?: number;
}

export interface Anamnese {
  gest: string;
  dev: string;
  lang: string;
  scol: string;
  aud: string;
  med: string;
  fam: string;
  comp: string;
  att: string;
}

export interface Patient {
  id: string;
  nom: string;
  naissance: string; // YYYY-MM-DD or ''
  tel: string;
  parent: string;
  medecin: string;
  patho: string; // index into pathologies list ('0'..'8') or ''
  motif: string;
  notes: string; // max 10000
  stage: Stage;
  th: string; // staff id or ''
  an: Anamnese;
}

export interface PaymentEntry {
  d: string; // YYYY-MM-DD
  m: number; // amount >= 0
}

export interface Rdv {
  id: string;
  pid: string;
  date: string; // YYYY-MM-DD
  heure: string; // HH:MM
  statut: RdvStatut;
  tarif: number;
  pay: PaymentEntry[];
  note: string; // max 10000
  rno: string; // receipt number "R-YYYY-0001"
  kind: RdvKind;
  th: string; // staff id or ''
  domainId?: string; // expertise domain id or ''
  dur: number; // minutes 5..240
  rem: string; // "YYYY-MM-DD HH:MM"
}

export interface Bilan {
  id: string;
  pid: string;
  date: string; // YYYY-MM-DD
  type: string; // index '0'..'7'
  tests: string; // max 20000
  concl: string; // max 20000
}

export interface Cabinet {
  nom: string;
  pra: string;
  addr: string;
  tel: string;
  legal: string;
  color: string; // #rrggbb or ''
  logo: string; // data:image/(png|jpeg|webp);base64,... <= 200 KB
  h1: string; // HH:MM
  h2: string; // HH:MM
  dur: string; // 10..120
  wamsg: string; // max 500
}

// AI Exercise Sheet Generator types
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

export interface ExerciseTargetParams {
  // Articulation
  sounds?: string[];
  position?: 'initial' | 'medial' | 'final' | 'clusters';
  // Language delay / comprehension
  vocabThemes?: string[];
  sentenceLength?: '2-3_words' | 'short_sentences' | 'complex_sentences';
  focusVerbs?: boolean;
  focusPrepositions?: boolean;
  // Reading / spelling
  readingUnit?: 'letters' | 'syllables' | 'words' | 'sentences';
  wordType?: 'regular' | 'irregular' | 'pseudo_words';
  readingLevel?: 'beginner' | 'intermediate' | 'advanced';
  // Fluency
  fluencyTechniques?: string[];
  // Voice
  voiceFocus?: string[];
  // Maths
  countingRange?: '1-10' | '1-20' | '1-100' | '100+';
  mathOps?: string[];
  // Aphasia
  aphasiaTasks?: string[];
  // Other
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

export interface AiSettings {
  enabled: boolean;
  model: string;
}

export interface AiSendLogEntry {
  id: string;
  ts: number;
  model: string;
  params: AiExerciseRequestPayload;
}

export interface SavedExerciseSheet {
  id: string;
  createdAt: number;
  updatedAt: number;
  params: AiExerciseRequestPayload;
  sheet: ExerciseSheet;
}

export interface DB {
  lang: Lang;
  tarif: number;
  patients: Patient[];
  rdv: Rdv[];
  bilans: Bilan[];
  cab: Cabinet;
  domains: ExpertiseDomain[];
  staff: Staff[];
  rseq: number;
  lastBackup: number;
  ai: AiSettings;
  aiLog: AiSendLogEntry[];
  aiSheets: SavedExerciseSheet[];
}

export interface EncryptedPayload {
  enc: 1;
  s: string;
  i: string;
  c: string;
}

export type ViewId = 'agenda' | 'parcours' | 'patients' | 'caisse' | 'stats';

export type PrintDoc =
  | {kind: 'patient'; patientId: string}
  | {kind: 'bilan'; bilanId: string}
  | {kind: 'rdv-report'; rdvId: string}
  | {kind: 'receipt'; rdvId: string}
  | {kind: 'statement'; patientId: string}
  | {kind: 'planning'; weekStart: string; thId?: string}
  | {
      kind: 'ai-sheet';
      sheet: ExerciseSheet;
      outputLanguage: OutputLanguage;
      validated: boolean;
    };
