import {
  collection,
  doc,
  getDocFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import {firestore, handleFirestoreError, OperationType} from './firebase';
import {sanitize} from './storage';
import type {
  AiSendLogEntry,
  Bilan,
  DB,
  Patient,
  Rdv,
  SavedExerciseSheet,
} from './types';

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

function practiceDocPath(uid: string) {
  return `practices/${uid}`;
}

function practiceDocRef(uid: string) {
  return doc(firestore, 'practices', uid);
}

function subColPath(uid: string, name: string) {
  return `practices/${uid}/${name}`;
}

function subColRef(uid: string, name: string) {
  return collection(firestore, 'practices', uid, name);
}

function subDocRef(uid: string, name: string, id: string) {
  return doc(firestore, 'practices', uid, name, id);
}

function toPracticeFields(db: DB) {
  return stripUndefined({
    lang: db.lang,
    tarif: db.tarif,
    cab: db.cab,
    domains: db.domains,
    staff: db.staff,
    rseq: db.rseq,
    lastBackup: db.lastBackup,
    ai: db.ai,
  });
}

function toPatientFields(p: Patient) {
  return stripUndefined({
    id: p.id,
    nom: p.nom,
    naissance: p.naissance,
    tel: p.tel,
    parent: p.parent,
    medecin: p.medecin,
    patho: p.patho,
    motif: p.motif,
    notes: p.notes,
    stage: p.stage,
    th: p.th,
    billingMode: p.billingMode === 'session' ? 'session' : 'monthly',
    an: p.an,
  });
}

function toRdvFields(r: Rdv) {
  return stripUndefined({
    id: r.id,
    pid: r.pid,
    date: r.date,
    heure: r.heure,
    statut: r.statut,
    tarif: r.tarif,
    pay: r.pay,
    note: r.note,
    rno: r.rno,
    kind: r.kind,
    th: r.th,
    domainId: r.domainId ?? '',
    dur: r.dur,
    rem: r.rem,
  });
}

function toBilanFields(b: Bilan) {
  return stripUndefined({
    id: b.id,
    pid: b.pid,
    date: b.date,
    type: b.type,
    tests: b.tests,
    concl: b.concl,
  });
}

function toAiSheetFields(s: SavedExerciseSheet) {
  return stripUndefined({
    id: s.id,
    createdAtMs: s.createdAt,
    updatedAtMs: s.updatedAt,
    params: s.params,
    sheet: s.sheet,
  });
}

function toAiLogFields(l: AiSendLogEntry) {
  return stripUndefined({
    id: l.id,
    ts: l.ts,
    model: l.model,
    params: l.params,
  });
}

type BatchOp =
  | {type: 'set'; ref: ReturnType<typeof subDocRef>; data: Record<string, unknown>}
  | {type: 'update'; ref: ReturnType<typeof subDocRef>; data: Record<string, unknown>}
  | {type: 'delete'; ref: ReturnType<typeof subDocRef>};

async function commitBatchedOps(ops: BatchOp[], pathForError: string): Promise<void> {
  const CHUNK_SIZE = 400;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const chunk = ops.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(firestore);
    for (const op of chunk) {
      if (op.type === 'set') {
        batch.set(op.ref, op.data);
      } else if (op.type === 'update') {
        batch.update(op.ref, op.data);
      } else {
        batch.delete(op.ref);
      }
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, pathForError);
    }
  }
}

export async function migrateLocalDbToFirestore(uid: string, localDb: DB): Promise<void> {
  const clean = sanitize(localDb, localDb.lang);
  const pPath = practiceDocPath(uid);
  try {
    await setDoc(practiceDocRef(uid), {
      ownerId: uid,
      ...toPracticeFields(clean),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, pPath);
  }

  const patientOps: BatchOp[] = clean.patients.map((p) => ({
    type: 'set',
    ref: subDocRef(uid, 'patients', p.id),
    data: {
      ownerId: uid,
      ...toPatientFields(p),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
  }));
  if (patientOps.length > 0) {
    await commitBatchedOps(patientOps, subColPath(uid, 'patients'));
  }

  const dependentOps: BatchOp[] = [
    ...clean.rdv.map(
      (r): BatchOp => ({
        type: 'set',
        ref: subDocRef(uid, 'rdvs', r.id),
        data: {
          ownerId: uid,
          ...toRdvFields(r),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      }),
    ),
    ...clean.bilans.map(
      (b): BatchOp => ({
        type: 'set',
        ref: subDocRef(uid, 'bilans', b.id),
        data: {
          ownerId: uid,
          ...toBilanFields(b),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      }),
    ),
    ...clean.aiSheets.map(
      (s): BatchOp => ({
        type: 'set',
        ref: subDocRef(uid, 'aiSheets', s.id),
        data: {
          ownerId: uid,
          ...toAiSheetFields(s),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      }),
    ),
    ...clean.aiLog.map(
      (l): BatchOp => ({
        type: 'set',
        ref: subDocRef(uid, 'aiLogs', l.id),
        data: {
          ownerId: uid,
          ...toAiLogFields(l),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      }),
    ),
  ];

  if (dependentOps.length > 0) {
    await commitBatchedOps(dependentOps, pPath);
  }
}

export async function initializePracticeInFirestore(uid: string, localDb: DB): Promise<boolean> {
  const pPath = practiceDocPath(uid);
  let existsOnServer = false;
  try {
    const snap = await getDocFromServer(practiceDocRef(uid));
    existsOnServer = snap.exists();
  } catch (error) {
    // If offline or missing, try reading cache/migrating if needed; throw structured error on permission error
    if (error instanceof Error && /permission|insufficient/i.test(error.message)) {
      handleFirestoreError(error, OperationType.GET, pPath);
    }
    throw error;
  }

  if (!existsOnServer) {
    await migrateLocalDbToFirestore(uid, localDb);
    return true;
  }
  return false;
}

export function subscribePracticeFromFirestore(
  uid: string,
  fallbackLang: DB['lang'],
  onDbUpdate: (db: DB, hasPendingWrites: boolean) => void,
  onError: (err: unknown) => void,
): Unsubscribe {
  let practiceData: DocumentData | null = null;
  let patientsData: Patient[] = [];
  let rdvsData: Rdv[] = [];
  let bilansData: Bilan[] = [];
  let aiSheetsData: SavedExerciseSheet[] = [];
  let aiLogsData: AiSendLogEntry[] = [];

  const ready = new Set<string>();
  const pendingFlags = new Map<string, boolean>();

  const emitIfReady = () => {
    if (ready.size < 6 || !practiceData) return;
    const combined = sanitize(
      {
        lang: practiceData.lang,
        tarif: practiceData.tarif,
        cab: practiceData.cab,
        domains: practiceData.domains,
        staff: practiceData.staff,
        rseq: practiceData.rseq,
        lastBackup: practiceData.lastBackup,
        ai: practiceData.ai,
        patients: patientsData,
        rdv: rdvsData,
        bilans: bilansData,
        aiSheets: aiSheetsData,
        aiLog: aiLogsData,
      },
      fallbackLang,
    );
    const hasPending = Array.from(pendingFlags.values()).some(Boolean);
    onDbUpdate(combined, hasPending);
  };

  const reportError = (op: OperationType, path: string, err: unknown) => {
    try {
      handleFirestoreError(err, op, path);
    } catch (wrapped) {
      onError(wrapped);
    }
  };

  const unsubs: Unsubscribe[] = [];

  const pPath = practiceDocPath(uid);
  unsubs.push(
    onSnapshot(
      practiceDocRef(uid),
      (snap) => {
        if (snap.exists()) {
          practiceData = snap.data();
        }
        ready.add('practice');
        pendingFlags.set('practice', snap.metadata.hasPendingWrites);
        emitIfReady();
      },
      (err) => reportError(OperationType.GET, pPath, err),
    ),
  );

  const patPath = subColPath(uid, 'patients');
  unsubs.push(
    onSnapshot(
      query(subColRef(uid, 'patients'), where('ownerId', '==', uid)),
      (snap) => {
        patientsData = snap.docs.map((d) => d.data() as Patient);
        ready.add('patients');
        pendingFlags.set('patients', snap.metadata.hasPendingWrites);
        emitIfReady();
      },
      (err) => reportError(OperationType.LIST, patPath, err),
    ),
  );

  const rdvPath = subColPath(uid, 'rdvs');
  unsubs.push(
    onSnapshot(
      query(subColRef(uid, 'rdvs'), where('ownerId', '==', uid)),
      (snap) => {
        rdvsData = snap.docs.map((d) => d.data() as Rdv);
        ready.add('rdvs');
        pendingFlags.set('rdvs', snap.metadata.hasPendingWrites);
        emitIfReady();
      },
      (err) => reportError(OperationType.LIST, rdvPath, err),
    ),
  );

  const bilPath = subColPath(uid, 'bilans');
  unsubs.push(
    onSnapshot(
      query(subColRef(uid, 'bilans'), where('ownerId', '==', uid)),
      (snap) => {
        bilansData = snap.docs.map((d) => d.data() as Bilan);
        ready.add('bilans');
        pendingFlags.set('bilans', snap.metadata.hasPendingWrites);
        emitIfReady();
      },
      (err) => reportError(OperationType.LIST, bilPath, err),
    ),
  );

  const sheetPath = subColPath(uid, 'aiSheets');
  unsubs.push(
    onSnapshot(
      query(subColRef(uid, 'aiSheets'), where('ownerId', '==', uid)),
      (snap) => {
        aiSheetsData = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: String(data.id ?? d.id),
            createdAt: Number(data.createdAtMs ?? 0),
            updatedAt: Number(data.updatedAtMs ?? 0),
            params: data.params,
            sheet: data.sheet,
          } as SavedExerciseSheet;
        });
        aiSheetsData.sort((a, b) => b.updatedAt - a.updatedAt);
        ready.add('aiSheets');
        pendingFlags.set('aiSheets', snap.metadata.hasPendingWrites);
        emitIfReady();
      },
      (err) => reportError(OperationType.LIST, sheetPath, err),
    ),
  );

  const logPath = subColPath(uid, 'aiLogs');
  unsubs.push(
    onSnapshot(
      query(subColRef(uid, 'aiLogs'), where('ownerId', '==', uid)),
      (snap) => {
        aiLogsData = snap.docs.map((d) => d.data() as AiSendLogEntry);
        aiLogsData.sort((a, b) => b.ts - a.ts);
        ready.add('aiLogs');
        pendingFlags.set('aiLogs', snap.metadata.hasPendingWrites);
        emitIfReady();
      },
      (err) => reportError(OperationType.LIST, logPath, err),
    ),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}

export async function syncDbDiffToFirestore(uid: string, prevDb: DB, nextDb: DB): Promise<void> {
  const prevSettings = toPracticeFields(prevDb);
  const nextSettings = toPracticeFields(nextDb);

  if (JSON.stringify(prevSettings) !== JSON.stringify(nextSettings)) {
    const batch = writeBatch(firestore);
    batch.update(practiceDocRef(uid), {
      ...nextSettings,
      updatedAt: serverTimestamp(),
    });
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, practiceDocPath(uid));
    }
  }

  // 1. Patients creates/updates first so any new rdvs/bilans pass patientExists()
  const prevPatientsMap = new Map(prevDb.patients.map((p) => [p.id, p]));
  const nextPatientsMap = new Map(nextDb.patients.map((p) => [p.id, p]));

  const patientWriteOps: BatchOp[] = [];
  const patientDeleteOps: BatchOp[] = [];

  for (const p of nextDb.patients) {
    const prev = prevPatientsMap.get(p.id);
    if (!prev) {
      patientWriteOps.push({
        type: 'set',
        ref: subDocRef(uid, 'patients', p.id),
        data: {
          ownerId: uid,
          ...toPatientFields(p),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    } else if (JSON.stringify(toPatientFields(prev)) !== JSON.stringify(toPatientFields(p))) {
      const {id: _omitId, ...updatable} = toPatientFields(p);
      patientWriteOps.push({
        type: 'update',
        ref: subDocRef(uid, 'patients', p.id),
        data: {
          ...updatable,
          updatedAt: serverTimestamp(),
        },
      });
    }
  }
  for (const p of prevDb.patients) {
    if (!nextPatientsMap.has(p.id)) {
      patientDeleteOps.push({
        type: 'delete',
        ref: subDocRef(uid, 'patients', p.id),
      });
    }
  }

  if (patientWriteOps.length > 0) {
    await commitBatchedOps(patientWriteOps, subColPath(uid, 'patients'));
  }

  // 2. Dependent subcollections (rdvs, bilans, aiSheets, aiLogs) + patient deletions
  const otherOps: BatchOp[] = [];

  // Rdvs
  const prevRdvMap = new Map(prevDb.rdv.map((r) => [r.id, r]));
  const nextRdvMap = new Map(nextDb.rdv.map((r) => [r.id, r]));
  for (const r of nextDb.rdv) {
    const prev = prevRdvMap.get(r.id);
    if (!prev) {
      otherOps.push({
        type: 'set',
        ref: subDocRef(uid, 'rdvs', r.id),
        data: {
          ownerId: uid,
          ...toRdvFields(r),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    } else if (prev.pid !== r.pid) {
      // pid is immutable in Firestore rules; recreate cleanly if reassigned
      otherOps.push({type: 'delete', ref: subDocRef(uid, 'rdvs', r.id)});
      otherOps.push({
        type: 'set',
        ref: subDocRef(uid, 'rdvs', r.id),
        data: {
          ownerId: uid,
          ...toRdvFields(r),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    } else if (JSON.stringify(toRdvFields(prev)) !== JSON.stringify(toRdvFields(r))) {
      const {id: _omitId, pid: _omitPid, ...updatable} = toRdvFields(r);
      otherOps.push({
        type: 'update',
        ref: subDocRef(uid, 'rdvs', r.id),
        data: {
          ...updatable,
          updatedAt: serverTimestamp(),
        },
      });
    }
  }
  for (const r of prevDb.rdv) {
    if (!nextRdvMap.has(r.id)) {
      otherOps.push({type: 'delete', ref: subDocRef(uid, 'rdvs', r.id)});
    }
  }

  // Bilans
  const prevBilanMap = new Map(prevDb.bilans.map((b) => [b.id, b]));
  const nextBilanMap = new Map(nextDb.bilans.map((b) => [b.id, b]));
  for (const b of nextDb.bilans) {
    const prev = prevBilanMap.get(b.id);
    if (!prev) {
      otherOps.push({
        type: 'set',
        ref: subDocRef(uid, 'bilans', b.id),
        data: {
          ownerId: uid,
          ...toBilanFields(b),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    } else if (prev.pid !== b.pid) {
      otherOps.push({type: 'delete', ref: subDocRef(uid, 'bilans', b.id)});
      otherOps.push({
        type: 'set',
        ref: subDocRef(uid, 'bilans', b.id),
        data: {
          ownerId: uid,
          ...toBilanFields(b),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    } else if (JSON.stringify(toBilanFields(prev)) !== JSON.stringify(toBilanFields(b))) {
      const {id: _omitId, pid: _omitPid, ...updatable} = toBilanFields(b);
      otherOps.push({
        type: 'update',
        ref: subDocRef(uid, 'bilans', b.id),
        data: {
          ...updatable,
          updatedAt: serverTimestamp(),
        },
      });
    }
  }
  for (const b of prevDb.bilans) {
    if (!nextBilanMap.has(b.id)) {
      otherOps.push({type: 'delete', ref: subDocRef(uid, 'bilans', b.id)});
    }
  }

  // AI Sheets
  const prevSheetsMap = new Map(prevDb.aiSheets.map((s) => [s.id, s]));
  const nextSheetsMap = new Map(nextDb.aiSheets.map((s) => [s.id, s]));
  for (const s of nextDb.aiSheets) {
    const prev = prevSheetsMap.get(s.id);
    if (!prev) {
      otherOps.push({
        type: 'set',
        ref: subDocRef(uid, 'aiSheets', s.id),
        data: {
          ownerId: uid,
          ...toAiSheetFields(s),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    } else if (JSON.stringify(toAiSheetFields(prev)) !== JSON.stringify(toAiSheetFields(s))) {
      const {id: _omitId, createdAtMs: _omitCreatedMs, ...updatable} = toAiSheetFields(s);
      otherOps.push({
        type: 'update',
        ref: subDocRef(uid, 'aiSheets', s.id),
        data: {
          ...updatable,
          updatedAt: serverTimestamp(),
        },
      });
    }
  }
  for (const s of prevDb.aiSheets) {
    if (!nextSheetsMap.has(s.id)) {
      otherOps.push({type: 'delete', ref: subDocRef(uid, 'aiSheets', s.id)});
    }
  }

  // AI Logs
  const prevLogsMap = new Map(prevDb.aiLog.map((l) => [l.id, l]));
  const nextLogsMap = new Map(nextDb.aiLog.map((l) => [l.id, l]));
  for (const l of nextDb.aiLog) {
    const prev = prevLogsMap.get(l.id);
    if (!prev) {
      otherOps.push({
        type: 'set',
        ref: subDocRef(uid, 'aiLogs', l.id),
        data: {
          ownerId: uid,
          ...toAiLogFields(l),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    } else if (JSON.stringify(toAiLogFields(prev)) !== JSON.stringify(toAiLogFields(l))) {
      const {id: _omitId, ...updatable} = toAiLogFields(l);
      otherOps.push({
        type: 'update',
        ref: subDocRef(uid, 'aiLogs', l.id),
        data: {
          ...updatable,
          updatedAt: serverTimestamp(),
        },
      });
    }
  }
  for (const l of prevDb.aiLog) {
    if (!nextLogsMap.has(l.id)) {
      otherOps.push({type: 'delete', ref: subDocRef(uid, 'aiLogs', l.id)});
    }
  }

  otherOps.push(...patientDeleteOps);

  if (otherOps.length > 0) {
    await commitBatchedOps(otherOps, practiceDocPath(uid));
  }
}
