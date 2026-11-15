import {decryptPayload, encryptDB, isEncryptedPayload} from './crypto';
import type {
  AiExerciseRequestPayload,
  AiSendLogEntry,
  AiSettings,
  Anamnese,
  Bilan,
  Cabinet,
  DB,
  EncryptedPayload,
  ExerciseSheet,
  Lang,
  Patient,
  PaymentEntry,
  Rdv,
  RdvKind,
  RdvStatut,
  SavedExerciseSheet,
  Staff,
  Stage,
} from './types';

export const DB_STORAGE_KEY = 'ortho_cabinet_db_v1';
export const LANG_STORAGE_KEY = 'ortho_cabinet_lang_v1';

export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function makeId(prefix = 'id'): string {
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    return `${prefix}_${window.crypto.randomUUID().slice(0, 12)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyAnamnese(): Anamnese {
  return {
    gest: '',
    dev: '',
    lang: '',
    scol: '',
    aud: '',
    med: '',
    fam: '',
    comp: '',
    att: '',
  };
}

export function createDefaultAiSettings(): AiSettings {
  return {
    enabled: false,
    model: 'gemini-2.5-flash',
  };
}

export function createEmptyDB(lang: Lang = 'fr'): DB {
  return {
    lang,
    tarif: 2000,
    patients: [],
    rdv: [],
    bilans: [],
    cab: {
      nom: '',
      pra: '',
      addr: '',
      tel: '',
      legal: '',
      color: '#2b4c9b',
      logo: '',
      h1: '08:00',
      h2: '17:00',
      dur: '30',
      wamsg: '',
    },
    staff: [],
    rseq: 1,
    lastBackup: 0,
    ai: createDefaultAiSettings(),
    aiLog: [],
    aiSheets: [],
  };
}

function clampStr(val: unknown, max: number): string {
  if (typeof val !== 'string') return '';
  return val.slice(0, max);
}

function isValidDateISO(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const [y, m, d] = val.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isValidTimeHHMM(val: unknown): val is string {
  return typeof val === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(val);
}

function clampNum(val: unknown, min: number, max: number, fallback: number): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampInt(val: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clampNum(val, min, max, fallback));
}

const VALID_STAGES: readonly Stage[] = ['req', 'diag', 'orient', 'suivi', 'clos'];
const VALID_STATUTS: readonly RdvStatut[] = ['prevu', 'fait', 'absent'];
const VALID_KINDS: readonly RdvKind[] = ['diag', 'suivi'];

export function sanitize(raw: unknown, fallbackLang: Lang = 'fr'): DB {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const today = todayISO();

  const lang: Lang = src.lang === 'ar' || src.lang === 'fr' ? src.lang : fallbackLang;
  const defaultTarif = clampNum(src.tarif, 0, 1_000_000, 2000);
  const rseq = clampInt(src.rseq, 1, 9_999_999, 1);
  const lastBackup = clampNum(src.lastBackup, 0, Number.MAX_SAFE_INTEGER, 0);

  // Cabinet
  const rawCab = src.cab && typeof src.cab === 'object' ? (src.cab as Record<string, unknown>) : {};
  const rawColor = typeof rawCab.color === 'string' ? rawCab.color.trim().toLowerCase() : '';
  const color = /^#[0-9a-f]{6}$/.test(rawColor) ? rawColor : '';

  const rawLogo = typeof rawCab.logo === 'string' ? rawCab.logo.trim() : '';
  const logo =
    rawLogo.length <= 300_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(rawLogo)
      ? rawLogo
      : '';

  const h1 = isValidTimeHHMM(rawCab.h1) ? rawCab.h1 : '08:00';
  const h2 = isValidTimeHHMM(rawCab.h2) ? rawCab.h2 : '17:00';
  const durNum = clampInt(rawCab.dur, 10, 120, 30);

  const cab: Cabinet = {
    nom: clampStr(rawCab.nom, 200),
    pra: clampStr(rawCab.pra, 200),
    addr: clampStr(rawCab.addr, 300),
    tel: clampStr(rawCab.tel, 200),
    legal: clampStr(rawCab.legal, 300),
    color,
    logo,
    h1,
    h2: h2 > h1 ? h2 : '17:00',
    dur: String(durNum),
    wamsg: clampStr(rawCab.wamsg, 500),
  };

  // Staff
  const rawStaff = Array.isArray(src.staff) ? src.staff : [];
  const staffIds = new Set<string>();
  const staff: Staff[] = [];
  for (const item of rawStaff) {
    if (staff.length >= 20) break;
    if (!item || typeof item !== 'object') continue;
    const st = item as Record<string, unknown>;
    const nom = clampStr(st.nom, 200).trim();
    if (!nom) continue;
    let id = clampStr(st.id, 100).trim() || makeId('st');
    while (staffIds.has(id)) id = makeId('st');
    staffIds.add(id);
    const specialite = clampStr(st.specialite, 120).trim();
    staff.push({
      id,
      nom,
      role: staff.length === 0 ? 'main' : 'th',
      ...(specialite ? {specialite} : {}),
    });
  }

  // Patients
  const rawPatients = Array.isArray(src.patients) ? src.patients : [];
  const patientIds = new Set<string>();
  const patients: Patient[] = [];
  for (const item of rawPatients) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Record<string, unknown>;
    let id = clampStr(p.id, 100).trim() || makeId('pat');
    while (patientIds.has(id)) id = makeId('pat');
    patientIds.add(id);

    const rawAn = p.an && typeof p.an === 'object' ? (p.an as Record<string, unknown>) : {};
    const an: Anamnese = {
      gest: clampStr(rawAn.gest, 3000),
      dev: clampStr(rawAn.dev, 3000),
      lang: clampStr(rawAn.lang, 3000),
      scol: clampStr(rawAn.scol, 3000),
      aud: clampStr(rawAn.aud, 3000),
      med: clampStr(rawAn.med, 3000),
      fam: clampStr(rawAn.fam, 3000),
      comp: clampStr(rawAn.comp, 3000),
      att: clampStr(rawAn.att, 3000),
    };

    const rawStage = p.stage as Stage;
    const stage: Stage = VALID_STAGES.includes(rawStage) ? rawStage : 'req';
    const rawPatho = typeof p.patho === 'number' ? String(p.patho) : clampStr(p.patho, 10);
    const patho = /^[0-8]$/.test(rawPatho) ? rawPatho : '';
    const rawTh = clampStr(p.th, 100);
    const th = staffIds.has(rawTh) ? rawTh : '';

    patients.push({
      id,
      nom: clampStr(p.nom, 200),
      naissance: isValidDateISO(p.naissance) ? p.naissance : '',
      tel: clampStr(p.tel, 200),
      parent: clampStr(p.parent, 200),
      medecin: clampStr(p.medecin, 200),
      patho,
      motif: clampStr(p.motif, 10000),
      notes: clampStr(p.notes, 10000),
      stage,
      th,
      an,
    });
  }

  // Rdv
  const rawRdv = Array.isArray(src.rdv) ? src.rdv : [];
  const rdvIds = new Set<string>();
  const rdv: Rdv[] = [];
  for (const item of rawRdv) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const pid = clampStr(r.pid, 100);
    if (!patientIds.has(pid)) continue;

    let id = clampStr(r.id, 100).trim() || makeId('rdv');
    while (rdvIds.has(id)) id = makeId('rdv');
    rdvIds.add(id);

    const date = isValidDateISO(r.date) ? r.date : today;
    const heure = isValidTimeHHMM(r.heure) ? r.heure : '09:00';
    const statut: RdvStatut = VALID_STATUTS.includes(r.statut as RdvStatut)
      ? (r.statut as RdvStatut)
      : 'prevu';
    const kind: RdvKind = VALID_KINDS.includes(r.kind as RdvKind) ? (r.kind as RdvKind) : 'suivi';
    const tarif = clampNum(r.tarif, 0, 1_000_000, defaultTarif);
    const dur = clampInt(r.dur, 5, 240, durNum);
    const rawTh = clampStr(r.th, 100);
    const th = staffIds.has(rawTh) ? rawTh : '';

    const pay: PaymentEntry[] = [];
    if (Array.isArray(r.pay)) {
      for (const entry of r.pay) {
        if (!entry || typeof entry !== 'object') continue;
        const e = entry as Record<string, unknown>;
        const m = clampNum(e.m, 0, 1_000_000, -1);
        if (m < 0) continue;
        const d = isValidDateISO(e.d) ? e.d : date;
        pay.push({d, m});
      }
    } else if (typeof r.paye === 'number' && Number.isFinite(r.paye) && r.paye > 0) {
      pay.push({d: date, m: clampNum(r.paye, 0, 1_000_000, 0)});
    }

    const remRaw = clampStr(r.rem, 30);
    const rem = /^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/.test(remRaw) ? remRaw : '';

    rdv.push({
      id,
      pid,
      date,
      heure,
      statut,
      tarif,
      pay,
      note: clampStr(r.note, 10000),
      rno: clampStr(r.rno, 50),
      kind,
      th,
      dur,
      rem,
    });
  }

  // Bilans
  const rawBilans = Array.isArray(src.bilans) ? src.bilans : [];
  const bilanIds = new Set<string>();
  const bilans: Bilan[] = [];
  for (const item of rawBilans) {
    if (!item || typeof item !== 'object') continue;
    const b = item as Record<string, unknown>;
    const pid = clampStr(b.pid, 100);
    if (!patientIds.has(pid)) continue;

    let id = clampStr(b.id, 100).trim() || makeId('bil');
    while (bilanIds.has(id)) id = makeId('bil');
    bilanIds.add(id);

    const date = isValidDateISO(b.date) ? b.date : today;
    const rawType = typeof b.type === 'number' ? String(b.type) : clampStr(b.type, 10);
    const type = /^[0-7]$/.test(rawType) ? rawType : '0';

    bilans.push({
      id,
      pid,
      date,
      type,
      tests: clampStr(b.tests, 20000),
      concl: clampStr(b.concl, 20000),
    });
  }

  // AI settings
  const rawAi = src.ai && typeof src.ai === 'object' ? (src.ai as Record<string, unknown>) : {};
  const ai: AiSettings = {
    enabled: Boolean(rawAi.enabled),
    model: clampStr(rawAi.model, 120).trim() || 'gemini-2.5-flash',
  };

  // AI send log (last 50 entries)
  const rawLog = Array.isArray(src.aiLog) ? src.aiLog : [];
  const aiLog: AiSendLogEntry[] = [];
  for (const item of rawLog.slice(0, 50)) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    if (!entry.params || typeof entry.params !== 'object') continue;
    aiLog.push({
      id: clampStr(entry.id, 100) || makeId('ailog'),
      ts: clampNum(entry.ts, 0, Number.MAX_SAFE_INTEGER, Date.now()),
      model: clampStr(entry.model, 120) || 'gemini-2.5-flash',
      params: entry.params as AiExerciseRequestPayload,
    });
  }

  // Local saved AI exercise sheets library (no patient link)
  const rawSheets = Array.isArray(src.aiSheets) ? src.aiSheets : [];
  const sheetIds = new Set<string>();
  const aiSheets: SavedExerciseSheet[] = [];
  for (const item of rawSheets) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    if (!s.sheet || typeof s.sheet !== 'object' || !s.params || typeof s.params !== 'object') {
      continue;
    }
    let id = clampStr(s.id, 100).trim() || makeId('sheet');
    while (sheetIds.has(id)) id = makeId('sheet');
    sheetIds.add(id);
    aiSheets.push({
      id,
      createdAt: clampNum(s.createdAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
      updatedAt: clampNum(s.updatedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
      params: s.params as AiExerciseRequestPayload,
      sheet: s.sheet as ExerciseSheet,
    });
  }

  return {
    lang,
    tarif: defaultTarif,
    patients,
    rdv,
    bilans,
    cab,
    staff,
    rseq,
    lastBackup,
    ai,
    aiLog,
    aiSheets,
  };
}

export function stripSensitiveForBackup(db: DB): DB {
  return {
    ...db,
    ai: {
      enabled: db.ai.enabled,
      model: db.ai.model,
    },
    aiLog: [],
  };
}

export function loadSavedLang(): Lang {
  try {
    const val = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (val === 'ar' || val === 'fr') return val;
  } catch {
    // localStorage blocked or unavailable
  }
  return 'fr';
}

export function persistLang(lang: Lang): void {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Ignore when localStorage is blocked
  }
}

export type InitialLoadResult =
  | {status: 'ready'; db: DB; storageBlocked: boolean}
  | {status: 'locked'; payload: EncryptedPayload; storageBlocked: boolean};

export function loadInitialState(): InitialLoadResult {
  const savedLang = loadSavedLang();
  try {
    const testKey = '__ortho_ls_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
  } catch {
    return {
      status: 'ready',
      db: createEmptyDB(savedLang),
      storageBlocked: true,
    };
  }

  try {
    const raw = window.localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) {
      return {
        status: 'ready',
        db: createEmptyDB(savedLang),
        storageBlocked: false,
      };
    }
    const parsed: unknown = JSON.parse(raw);
    if (isEncryptedPayload(parsed)) {
      return {
        status: 'locked',
        payload: parsed,
        storageBlocked: false,
      };
    }
    const db = sanitize(parsed, savedLang);
    persistLang(db.lang);
    return {
      status: 'ready',
      db,
      storageBlocked: false,
    };
  } catch {
    return {
      status: 'ready',
      db: createEmptyDB(savedLang),
      storageBlocked: false,
    };
  }
}

export async function saveDB(db: DB, pin: string | null): Promise<boolean> {
  persistLang(db.lang);
  try {
    const serialized = pin ? JSON.stringify(await encryptDB(db, pin)) : JSON.stringify(db);
    window.localStorage.setItem(DB_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

export async function unlockStoredDB(
  payload: EncryptedPayload,
  pin: string,
  fallbackLang: Lang,
): Promise<DB> {
  const decrypted = await decryptPayload(payload, pin);
  const db = sanitize(decrypted, fallbackLang);
  persistLang(db.lang);
  return db;
}
