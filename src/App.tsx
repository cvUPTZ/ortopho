import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  BarChart3,
  CalendarDays,
  Database,
  Download,
  GitBranch,
  Languages,
  Lock,
  LogIn,
  LogOut,
  Plus,
  Settings,
  Sparkles,
  Upload,
  Users,
  Wallet,
} from 'lucide-react';
import {ConfirmDialog} from './components/ConfirmDialog';
import {LockScreen} from './components/LockScreen';
import {PrintContainer} from './components/PrintContainer';
import {Toast, type ToastItem} from './components/Toast';
import {encryptDB} from './crypto';
import {generateDemoDB} from './demo';
import {BilanDialog} from './dialogs/BilanDialog';
import {DiagScheduleDialog} from './dialogs/DiagScheduleDialog';
import {ExerciseSheetDialog} from './dialogs/ExerciseSheetDialog';
import {ImportDialog} from './dialogs/ImportDialog';
import {OrientDialog} from './dialogs/OrientDialog';
import {PatientDialog} from './dialogs/PatientDialog';
import {PinDialog} from './dialogs/PinDialog';
import {RdvDialog, type RdvSeed} from './dialogs/RdvDialog';
import {SettingsDialog} from './dialogs/SettingsDialog';
import {TherapistsDialog} from './dialogs/TherapistsDialog';
import {
  auth,
  googleProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from './firebase';
import {
  initializePracticeInFirestore,
  subscribePracticeFromFirestore,
  syncDbDiffToFirestore,
} from './firestoreSync';
import {createTranslator} from './i18n';
import {assignReceiptNumberIfNeeded, triggerBrowserPrint} from './print';
import {
  createEmptyDB,
  loadInitialState,
  loadSavedLang,
  makeId,
  persistLang,
  sanitize,
  saveDB,
  stripSensitiveForBackup,
  todayISO,
  unlockStoredDB,
} from './storage';
import type {
  AiExerciseRequestPayload,
  AiSettings,
  Bilan,
  Cabinet,
  DB,
  EncryptedPayload,
  ExerciseSheet,
  ExpertiseDomain,
  Lang,
  OutputLanguage,
  Patient,
  PrintDoc,
  Rdv,
  SavedExerciseSheet,
  Staff,
  ViewId,
} from './types';
import {contrastForeground, rdvPaidTotal} from './utils';
import {CaisseView} from './views/CaisseView';
import {AgendaView} from './views/AgendaView';
import {ParcoursView} from './views/ParcoursView';
import {PatientsView} from './views/PatientsView';
import {StatistiquesView} from './views/StatistiquesView';
import {openWhatsAppReminder} from './whatsapp';

const AUTO_LOCK_MS = 5 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export default function App() {
  const initial = useMemo(() => loadInitialState(), []);

  const [lockedPayload, setLockedPayload] = useState<EncryptedPayload | null>(
    initial.status === 'locked' ? initial.payload : null,
  );
  const [db, setDb] = useState<DB>(() =>
    initial.status === 'ready' ? initial.db : createEmptyDB(loadSavedLang()),
  );
  const [lockLang, setLockLang] = useState<Lang>(() => loadSavedLang());
  const [activePin, setActivePin] = useState<string | null>(null);
  const [storageBlocked, setStorageBlocked] = useState<boolean>(initial.storageBlocked);
  const [saveError, setSaveError] = useState<boolean>(false);

  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [cloudSigningIn, setCloudSigningIn] = useState<boolean>(false);
  const [cloudError, setCloudError] = useState<string>('');
  const dbRef = useRef<DB>(db);
  const lastSyncedDbRef = useRef<DB | null>(null);
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSyncCountRef = useRef<number>(0);
  const justSignedInToastRef = useRef<boolean>(false);

  const [view, setView] = useState<ViewId>('agenda');
  const [selectedDate, setSelectedDate] = useState<string>(() => todayISO());

  // Toast + Undo snapshot
  const [toast, setToast] = useState<ToastItem | null>(null);
  const undoSnapshotRef = useRef<DB | null>(null);

  // Dialog states
  const [patientDlg, setPatientDlg] = useState<{open: boolean; patientId: string | null}>({
    open: false,
    patientId: null,
  });
  const [bilanDlg, setBilanDlg] = useState<{
    open: boolean;
    patientId: string;
    bilanId: string | null;
  }>({open: false, patientId: '', bilanId: null});
  const [rdvDlg, setRdvDlg] = useState<{
    open: boolean;
    rdvId: string | null;
    seed?: RdvSeed;
  }>({open: false, rdvId: null});
  const [diagDlg, setDiagDlg] = useState<{open: boolean; patientId: string | null}>({
    open: false,
    patientId: null,
  });
  const [orientDlg, setOrientDlg] = useState<{open: boolean; patientId: string | null}>({
    open: false,
    patientId: null,
  });
  const [settingsDlg, setSettingsDlg] = useState<{open: boolean; focusAi: boolean}>({
    open: false,
    focusAi: false,
  });
  const [therapistsOpen, setTherapistsOpen] = useState(false);
  const [aiSheetDlg, setAiSheetDlg] = useState<{open: boolean; patientId: string | null}>({
    open: false,
    patientId: null,
  });
  const [aiSessionConsent, setAiSessionConsent] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [importDlg, setImportDlg] = useState<{open: boolean; rawText: string}>({
    open: false,
    rawText: '',
  });
  const [confirmDemoOpen, setConfirmDemoOpen] = useState(false);

  const [printDoc, setPrintDoc] = useState<PrintDoc | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const isLocked = lockedPayload !== null;
  const activeLang: Lang = isLocked ? lockLang : db.lang;
  const t = useMemo(() => createTranslator(activeLang), [activeLang]);

  // Keep <html lang>, <html dir>, <title>, Firebase Auth language, and accent CSS variables synced
  useEffect(() => {
    document.documentElement.lang = activeLang;
    document.documentElement.dir = activeLang === 'ar' ? 'rtl' : 'ltr';
    auth.languageCode = activeLang;
    const cabName = !isLocked && db.cab.nom.trim() ? db.cab.nom.trim() : t('appDefaultTitle');
    document.title = cabName;
  }, [activeLang, isLocked, db.cab.nom, t]);

  useEffect(() => {
    const accent = !isLocked && /^#[0-9a-f]{6}$/i.test(db.cab.color) ? db.cab.color : '#2b4c9b';
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--accent-fg', contrastForeground(accent));
  }, [isLocked, db.cab.color]);

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  const showToast = useCallback((message: string, snapshot?: DB, tone: 'info' | 'error' = 'info') => {
    undoSnapshotRef.current = snapshot ? structuredClone(snapshot) : null;
    setToast({
      id: makeId('toast'),
      message,
      canUndo: Boolean(snapshot),
      tone,
    });
  }, []);

  const commitDB = useCallback(
    async (nextDb: DB, pinOverride?: string | null) => {
      const clean = sanitize(nextDb, nextDb.lang);
      setDb(clean);
      dbRef.current = clean;
      const pinToUse = pinOverride !== undefined ? pinOverride : activePin;
      if (!storageBlocked) {
        const ok = await saveDB(clean, pinToUse);
        setSaveError(!ok);
      }
      if (cloudUser && cloudUser.emailVerified && lastSyncedDbRef.current) {
        const prevSnapshot = lastSyncedDbRef.current;
        lastSyncedDbRef.current = clean;
        const uid = cloudUser.uid;
        pendingSyncCountRef.current += 1;
        syncQueueRef.current = syncQueueRef.current
          .then(() => syncDbDiffToFirestore(uid, prevSnapshot, clean))
          .then(() => {
            setCloudError('');
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            const isQuota = /quota exceeded/i.test(msg);
            setCloudError(isQuota ? t('cloudQuotaError') : t('cloudErrorBanner'));
            showToast(isQuota ? t('cloudQuotaError') : t('cloudErrorBanner'), undefined, 'error');
          })
          .finally(() => {
            pendingSyncCountRef.current = Math.max(0, pendingSyncCountRef.current - 1);
          });
      }
    },
    [activePin, storageBlocked, cloudUser, showToast, t],
  );

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthReady(true);
      if (user && !user.emailVerified) {
        setCloudUser(null);
        void signOut(auth);
        return;
      }
      setCloudUser(user);
    });
    return () => unsub();
  }, []);

  // Firestore hydration + real-time subscription when signed in and unlocked
  useEffect(() => {
    if (!cloudUser || isLocked) {
      lastSyncedDbRef.current = null;
      return;
    }

    let cancelled = false;
    let unsubFirestore: (() => void) | null = null;

    const startSync = async () => {
      try {
        const createdNew = await initializePracticeInFirestore(cloudUser.uid, dbRef.current);
        if (cancelled) return;
        if (createdNew) {
          lastSyncedDbRef.current = dbRef.current;
        }
        unsubFirestore = subscribePracticeFromFirestore(
          cloudUser.uid,
          dbRef.current.lang,
          (remoteDb, hasPendingWrites) => {
            if (cancelled) return;
            if (lastSyncedDbRef.current === null) {
              lastSyncedDbRef.current = remoteDb;
            }
            if (
              !hasPendingWrites &&
              pendingSyncCountRef.current === 0
            ) {
              lastSyncedDbRef.current = remoteDb;
              if (JSON.stringify(remoteDb) !== JSON.stringify(dbRef.current)) {
                setDb(remoteDb);
                dbRef.current = remoteDb;
                if (!storageBlocked) {
                  void saveDB(remoteDb, activePin);
                }
              }
            }
            setCloudError('');
            if (justSignedInToastRef.current) {
              justSignedInToastRef.current = false;
              showToast(t('cloudConnectedToast'));
            }
          },
          (err) => {
            if (cancelled) return;
            const msg = err instanceof Error ? err.message : String(err);
            setCloudError(/quota exceeded/i.test(msg) ? t('cloudQuotaError') : t('cloudErrorBanner'));
          },
        );
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setCloudError(/quota exceeded/i.test(msg) ? t('cloudQuotaError') : t('cloudErrorBanner'));
      }
    };

    void startSync();

    return () => {
      cancelled = true;
      unsubFirestore?.();
    };
  }, [cloudUser, isLocked, activePin, storageBlocked, showToast, t]);

  const handleCloudSignIn = async () => {
    if (cloudSigningIn) return;
    setCloudSigningIn(true);
    setCloudError('');
    try {
      justSignedInToastRef.current = true;
      const cred = await signInWithPopup(auth, googleProvider);
      if (!cred.user.emailVerified) {
        justSignedInToastRef.current = false;
        const msg = t('cloudUnverifiedError');
        setCloudError(msg);
        showToast(msg, undefined, 'error');
        await signOut(auth);
      }
    } catch (err) {
      justSignedInToastRef.current = false;
      const code =
        err &&
        typeof err === 'object' &&
        'code' in err &&
        typeof (err as {code?: unknown}).code === 'string'
          ? (err as {code: string}).code
          : '';
      console.error('Google sign-in failed:', code || err);

      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      let message: string;
      switch (code) {
        case 'auth/unauthorized-domain':
          message = t('cloudUnauthorizedDomainError').replace('{host}', host);
          break;
        case 'auth/popup-blocked':
          message = t('cloudPopupBlockedError');
          break;
        case 'auth/popup-closed-by-user':
          message = t('cloudPopupClosedError');
          break;
        case 'auth/cancelled-popup-request':
          message = t('cloudPopupCancelledError');
          break;
        case 'auth/operation-not-allowed':
          message = t('cloudOperationNotAllowedError');
          break;
        case 'auth/web-storage-unsupported':
          message = t('cloudWebStorageError');
          break;
        case 'auth/network-request-failed':
          message = t('cloudNetworkError');
          break;
        default:
          message = code
            ? `${t('cloudAuthGenericError')} (${code})`
            : t('cloudAuthGenericError');
          break;
      }

      setCloudError(message);
      showToast(message, undefined, 'error');
    } finally {
      setCloudSigningIn(false);
    }
  };

  const handleCloudSignOut = async () => {
    try {
      await signOut(auth);
      lastSyncedDbRef.current = null;
      setCloudError('');
    } catch {
      // Ignore sign-out errors
    }
  };

  const handleUndo = useCallback(() => {
    const snap = undoSnapshotRef.current;
    if (!snap) return;
    undoSnapshotRef.current = null;
    setToast(null);
    void commitDB(snap);
  }, [commitDB]);

  // Lock function
  const lockNow = useCallback(async () => {
    if (!activePin) return;
    try {
      const payload = await encryptDB(db, activePin);
      setLockedPayload(payload);
      setLockLang(db.lang);
      setActivePin(null);
      setDb(createEmptyDB(db.lang));
      setSettingsDlg({open: false, focusAi: false});
      setTherapistsOpen(false);
      setAiSheetDlg({open: false, patientId: null});
      setAiSessionConsent(false);
      setPinOpen(false);
      setPatientDlg({open: false, patientId: null});
      setBilanDlg({open: false, patientId: '', bilanId: null});
      setRdvDlg({open: false, rdvId: null});
      setDiagDlg({open: false, patientId: null});
      setOrientDlg({open: false, patientId: null});
      setImportDlg({open: false, rawText: ''});
    } catch {
      // Ignore if crypto unavailable
    }
  }, [activePin, db]);

  // Auto-lock after 5 minutes of inactivity when a PIN is set
  useEffect(() => {
    if (!activePin || isLocked) return;
    let timer = window.setTimeout(() => {
      void lockNow();
    }, AUTO_LOCK_MS);

    const resetTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void lockNow();
      }, AUTO_LOCK_MS);
    };

    const events = ['mousemove', 'keydown', 'touchstart', 'pointerdown'] as const;
    for (const ev of events) {
      window.addEventListener(ev, resetTimer, {passive: true});
    }
    return () => {
      window.clearTimeout(timer);
      for (const ev of events) {
        window.removeEventListener(ev, resetTimer);
      }
    };
  }, [activePin, isLocked, lockNow]);

  const handleUnlock = async (pin: string): Promise<boolean> => {
    if (!lockedPayload) return false;
    try {
      const unlocked = await unlockStoredDB(lockedPayload, pin, lockLang);
      setActivePin(pin);
      setLockedPayload(null);
      setDb(unlocked);
      return true;
    } catch {
      return false;
    }
  };

  const handleToggleLang = () => {
    if (isLocked) {
      const next: Lang = lockLang === 'fr' ? 'ar' : 'fr';
      setLockLang(next);
      persistLang(next);
      return;
    }
    const next: Lang = db.lang === 'fr' ? 'ar' : 'fr';
    void commitDB({...db, lang: next});
  };

  // Export backup (strips API key & AI send log)
  const handleExportBackup = async () => {
    const updatedDb: DB = {...db, lastBackup: Date.now()};
    await commitDB(updatedDb);

    const safeExportDb = stripSensitiveForBackup(updatedDb);
    const payloadText = activePin
      ? JSON.stringify(await encryptDB(safeExportDb, activePin))
      : JSON.stringify(safeExportDb, null, 2);

    const blob = new Blob([payloadText], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cabinet-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(t('exportSuccessToast'));
  };

  // Import backup trigger
  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setImportDlg({open: true, rawText: text});
    };
    reader.readAsText(file);
  };

  // Demo loader
  const executeLoadDemo = () => {
    const hasData = db.patients.length > 0 || db.rdv.length > 0 || db.bilans.length > 0;
    const snapshot = hasData ? structuredClone(db) : structuredClone(db);
    const demo = generateDemoDB(db.lang);
    void commitDB(demo);
    setSelectedDate(todayISO());
    setSettingsDlg({open: false, focusAi: false});
    showToast(t('demoLoadedToast'), snapshot);
  };

  const requestLoadDemo = () => {
    const hasData = db.patients.length > 0 || db.rdv.length > 0 || db.bilans.length > 0;
    if (hasData) {
      setConfirmDemoOpen(true);
    } else {
      executeLoadDemo();
    }
  };

  // Print helpers
  const triggerPrint = (doc: PrintDoc) => {
    setPrintDoc(doc);
    triggerBrowserPrint(doc);
  };

  // Patient CRUD
  const handleSavePatient = (patient: Patient, isNew: boolean) => {
    const nextPatients = isNew
      ? [...db.patients, patient]
      : db.patients.map((p) => (p.id === patient.id ? patient : p));
    void commitDB({...db, patients: nextPatients});
    setPatientDlg({open: false, patientId: null});
  };

  const handleDeletePatient = (patientId: string) => {
    const snapshot = structuredClone(db);
    const nextDb: DB = {
      ...db,
      patients: db.patients.filter((p) => p.id !== patientId),
      rdv: db.rdv.filter((r) => r.pid !== patientId),
      bilans: db.bilans.filter((b) => b.pid !== patientId),
    };
    void commitDB(nextDb);
    setPatientDlg({open: false, patientId: null});
    showToast(t('patientDeletedToast'), snapshot);
  };

  // Bilan CRUD
  const handleSaveBilan = (bilan: Bilan, isNew: boolean) => {
    const nextBilans = isNew
      ? [...db.bilans, bilan]
      : db.bilans.map((b) => (b.id === bilan.id ? bilan : b));
    void commitDB({...db, bilans: nextBilans});
    setBilanDlg({open: false, patientId: '', bilanId: null});
  };

  const handleDeleteBilan = (bilanId: string) => {
    const snapshot = structuredClone(db);
    void commitDB({
      ...db,
      bilans: db.bilans.filter((b) => b.id !== bilanId),
    });
    setBilanDlg({open: false, patientId: '', bilanId: null});
    showToast(t('bilanDeletedToast'), snapshot);
  };

  const handlePrintBilan = (bilan: Bilan) => {
    const exists = db.bilans.some((b) => b.id === bilan.id);
    const nextBilans = exists
      ? db.bilans.map((b) => (b.id === bilan.id ? bilan : b))
      : [...db.bilans, bilan];
    void commitDB({...db, bilans: nextBilans});
    triggerPrint({kind: 'bilan', bilanId: bilan.id});
  };

  // Rdv CRUD
  const handleSaveRdvs = (rdvs: Rdv[], isNew: boolean) => {
    const nextRdv = isNew
      ? [...db.rdv, ...rdvs]
      : db.rdv.map((r) => (r.id === rdvs[0].id ? rdvs[0] : r));
    void commitDB({...db, rdv: nextRdv});
    setRdvDlg({open: false, rdvId: null});
  };

  const handleDeleteRdv = (rdvId: string) => {
    const snapshot = structuredClone(db);
    void commitDB({
      ...db,
      rdv: db.rdv.filter((r) => r.id !== rdvId),
    });
    setRdvDlg({open: false, rdvId: null});
    showToast(t('rdvDeletedToast'), snapshot);
  };

  const handleQuickStatus = (rdvId: string, statut: 'fait' | 'absent') => {
    void commitDB({
      ...db,
      rdv: db.rdv.map((r) => (r.id === rdvId ? {...r, statut} : r)),
    });
  };

  const handleQuickMarkRdvsPaid = (rdvIds: string[], toastMsg: string) => {
    if (rdvIds.length === 0) return;
    const targetSet = new Set(rdvIds);
    const today = todayISO();
    const snapshot = structuredClone(db);
    let changed = false;
    const nextRdv = db.rdv.map((r) => {
      if (!targetSet.has(r.id)) return r;
      const paid = rdvPaidTotal(r);
      const rem = r.tarif - paid;
      if (rem <= 0) return r;
      changed = true;
      return {
        ...r,
        pay: [...r.pay, {d: today, m: Math.round(rem)}],
      };
    });
    if (!changed) return;
    void commitDB({...db, rdv: nextRdv});
    showToast(toastMsg, snapshot);
  };

  const handleAddVersement = (targetRdvIds: string[], amount: number, payDate: string) => {
    const cleanAmount = Math.round(amount);
    if (targetRdvIds.length === 0 || !Number.isFinite(cleanAmount) || cleanAmount <= 0) return;
    const targetSet = new Set(targetRdvIds);
    const cleanDate = /^\d{4}-\d{2}-\d{2}$/.test(payDate) ? payDate : todayISO();
    const snapshot = structuredClone(db);

    const candidates = db.rdv
      .filter((r) => targetSet.has(r.id))
      .sort((a, b) => `${a.date} ${a.heure}`.localeCompare(`${b.date} ${b.heure}`));
    if (candidates.length === 0) return;

    let remainingToAllocate = cleanAmount;
    const allocations = new Map<string, number>();

    // 1. Allocate to unpaid done sessions first
    for (const r of candidates) {
      if (remainingToAllocate <= 0) break;
      if (r.statut !== 'fait') continue;
      const unpaid = Math.max(0, r.tarif - rdvPaidTotal(r));
      if (unpaid <= 0) continue;
      const alloc = Math.min(remainingToAllocate, unpaid);
      allocations.set(r.id, (allocations.get(r.id) ?? 0) + alloc);
      remainingToAllocate -= alloc;
    }

    // 2. Allocate remainder to unpaid planned sessions (advance monthly/session payment)
    for (const r of candidates) {
      if (remainingToAllocate <= 0) break;
      if (r.statut !== 'prevu') continue;
      const unpaid = Math.max(0, r.tarif - rdvPaidTotal(r) - (allocations.get(r.id) ?? 0));
      if (unpaid <= 0) continue;
      const alloc = Math.min(remainingToAllocate, unpaid);
      allocations.set(r.id, (allocations.get(r.id) ?? 0) + alloc);
      remainingToAllocate -= alloc;
    }

    // 3. Any overpayment becomes credit on the latest non-absent session (or latest session)
    if (remainingToAllocate > 0) {
      const nonAbsent = candidates.filter((r) => r.statut !== 'absent');
      const targetForSurplus =
        nonAbsent[nonAbsent.length - 1] ?? candidates[candidates.length - 1];
      allocations.set(
        targetForSurplus.id,
        (allocations.get(targetForSurplus.id) ?? 0) + remainingToAllocate,
      );
      remainingToAllocate = 0;
    }

    const nextRdv = db.rdv.map((r) => {
      const addAmt = allocations.get(r.id);
      if (!addAmt || addAmt <= 0) return r;
      return {
        ...r,
        pay: [...r.pay, {d: cleanDate, m: Math.round(addAmt)}],
      };
    });

    void commitDB({...db, rdv: nextRdv});
    showToast(t('versementAddedToast'), snapshot);
  };

  const handleRemoveVersement = (rdvId: string, payIndex: number) => {
    const target = db.rdv.find((r) => r.id === rdvId);
    if (!target || payIndex < 0 || payIndex >= target.pay.length) return;
    const snapshot = structuredClone(db);
    const nextRdv = db.rdv.map((r) =>
      r.id === rdvId ? {...r, pay: r.pay.filter((_, idx) => idx !== payIndex)} : r,
    );
    void commitDB({...db, rdv: nextRdv});
    showToast(t('paymentRemovedToast'), snapshot);
  };

  const handleSendWhatsApp = (rdv: Rdv) => {
    const pat = db.patients.find((p) => p.id === rdv.pid);
    if (!pat) return;
    const res = openWhatsAppReminder(pat, rdv, db.cab, db.lang);
    if (!res.ok) {
      showToast(t(res.errorKey), undefined, 'error');
      return;
    }
    void commitDB({
      ...db,
      rdv: db.rdv.map((r) => (r.id === rdv.id ? {...r, rem: res.remStamp} : r)),
    });
  };

  const handlePrintReceipt = (rdvDraft: Rdv) => {
    const exists = db.rdv.some((r) => r.id === rdvDraft.id);
    const baseDb: DB = {
      ...db,
      rdv: exists
        ? db.rdv.map((r) => (r.id === rdvDraft.id ? rdvDraft : r))
        : [...db.rdv, rdvDraft],
    };
    const {nextDb} = assignReceiptNumberIfNeeded(baseDb, rdvDraft.id);
    void commitDB(nextDb);
    triggerPrint({kind: 'receipt', rdvId: rdvDraft.id});
  };

  const handlePrintRdvReport = (rdvDraft: Rdv) => {
    const exists = db.rdv.some((r) => r.id === rdvDraft.id);
    const nextDb: DB = {
      ...db,
      rdv: exists
        ? db.rdv.map((r) => (r.id === rdvDraft.id ? rdvDraft : r))
        : [...db.rdv, rdvDraft],
    };
    void commitDB(nextDb);
    triggerPrint({kind: 'rdv-report', rdvId: rdvDraft.id});
  };

  // Parcours actions
  const handleScheduleDiag = (patientId: string, rdv: Rdv) => {
    const nextPatients = db.patients.map((p) =>
      p.id === patientId ? {...p, stage: 'diag' as const, th: rdv.th || p.th} : p,
    );
    void commitDB({
      ...db,
      patients: nextPatients,
      rdv: [...db.rdv, rdv],
    });
    setDiagDlg({open: false, patientId: null});
  };

  const handleOrientConfirm = (
    patientId: string,
    th: string,
    patho: string,
    rdvs: Rdv[],
  ) => {
    const nextPatients = db.patients.map((p) =>
      p.id === patientId ? {...p, stage: 'suivi' as const, th, patho} : p,
    );
    void commitDB({
      ...db,
      patients: nextPatients,
      rdv: [...db.rdv, ...rdvs],
    });
    setOrientDlg({open: false, patientId: null});
    setPatientDlg({open: false, patientId: null});
  };

  // Domains, Staff & Settings helpers
  const applyDomainsAndStaffUpdate = (
    baseDb: DB,
    nextDomains: ExpertiseDomain[],
    nextStaff: Staff[],
    reassignments: Record<string, string>,
  ): DB => {
    const cleanDomains: ExpertiseDomain[] = nextDomains
      .slice(0, 30)
      .map((d) => ({
        id: d.id,
        name: d.name.trim().slice(0, 120),
        tarif:
          typeof d.tarif === 'number' && Number.isFinite(d.tarif) && d.tarif >= 0
            ? Math.min(1_000_000, Math.round(d.tarif))
            : baseDb.tarif,
      }))
      .filter((d) => d.name.length > 0);
    const domainMap = new Map(cleanDomains.map((d) => [d.id, d]));

    const cleanStaff: Staff[] = nextStaff.slice(0, 20).map((s, idx) => {
      const linkedDom = s.domainId ? domainMap.get(s.domainId) : undefined;
      const spec = linkedDom ? linkedDom.name : s.specialite?.trim().slice(0, 120);
      return {
        id: s.id,
        nom: s.nom.trim().slice(0, 200),
        role: idx === 0 ? 'main' : 'th',
        ...(linkedDom ? {domainId: linkedDom.id} : {}),
        ...(spec ? {specialite: spec} : {}),
        ...(typeof s.tarif === 'number' && Number.isFinite(s.tarif) && s.tarif >= 0
          ? {tarif: Math.min(1_000_000, Math.round(s.tarif))}
          : {}),
      };
    });
    const validIds = new Set(cleanStaff.map((s) => s.id));
    const staffMap = new Map(cleanStaff.map((s) => [s.id, s]));
    const remapTh = (thId: string): string => {
      if (!thId) return '';
      let cur = thId;
      const seen = new Set<string>();
      while (cur && reassignments[cur] !== undefined && !seen.has(cur)) {
        seen.add(cur);
        cur = reassignments[cur];
      }
      return cur && validIds.has(cur) ? cur : '';
    };
    return {
      ...baseDb,
      domains: cleanDomains,
      staff: cleanStaff,
      patients: baseDb.patients.map((p) => {
        const nextTh = remapTh(p.th);
        return nextTh === p.th ? p : {...p, th: nextTh};
      }),
      rdv: baseDb.rdv.map((r) => {
        const nextTh = remapTh(r.th);
        const remappedStaffDom = nextTh ? staffMap.get(nextTh)?.domainId ?? '' : '';
        const existingDomValid = r.domainId && domainMap.has(r.domainId) ? r.domainId : '';
        const nextDomId = existingDomValid || remappedStaffDom;
        if (nextTh === r.th && (nextDomId || '') === (r.domainId || '')) return r;
        const {domainId: _omitDom, ...rest} = r;
        return {
          ...rest,
          th: nextTh,
          ...(nextDomId ? {domainId: nextDomId} : {}),
        };
      }),
    };
  };

  const handleSaveTherapists = (
    nextDomains: ExpertiseDomain[],
    nextStaff: Staff[],
    reassignments: Record<string, string>,
  ) => {
    const updatedDb = applyDomainsAndStaffUpdate(db, nextDomains, nextStaff, reassignments);
    void commitDB(updatedDb);
    setTherapistsOpen(false);
    showToast(t('therapistsSavedToast'));
  };

  // Settings & PIN
  const handleSaveSettings = (
    cab: Cabinet,
    tarif: number,
    domains: ExpertiseDomain[],
    staff: Staff[],
    ai: AiSettings,
    reassignments: Record<string, string> = {},
  ) => {
    const updatedDb = applyDomainsAndStaffUpdate(
      {...db, cab, tarif, ai},
      domains,
      staff,
      reassignments,
    );
    void commitDB(updatedDb);
    setSettingsDlg({open: false, focusAi: false});
  };

  const handleClearAiLog = () => {
    void commitDB({...db, aiLog: []});
  };

  const aiReady = db.ai.enabled;

  const openAiSheetOrSettings = (patientId: string | null) => {
    if (!aiReady) {
      setSettingsDlg({open: true, focusAi: true});
      return;
    }
    setAiSheetDlg({open: true, patientId});
  };

  const handleRecordAiSendLog = (model: string, params: AiExerciseRequestPayload) => {
    const entry = {
      id: makeId('ailog'),
      ts: Date.now(),
      model,
      params,
    };
    const nextLog = [entry, ...db.aiLog].slice(0, 50);
    void commitDB({...db, aiLog: nextLog});
  };

  const handleSaveAiSheetToPatient = (bilan: Bilan) => {
    void commitDB({...db, bilans: [...db.bilans, bilan]});
    setAiSheetDlg({open: false, patientId: null});
    showToast(t('aiSavedToPatientToast'));
  };

  const handleSaveAiSheetToLibrary = (entry: SavedExerciseSheet) => {
    const exists = db.aiSheets.some((s) => s.id === entry.id);
    const nextSheets = exists
      ? db.aiSheets.map((s) => (s.id === entry.id ? entry : s))
      : [entry, ...db.aiSheets];
    void commitDB({...db, aiSheets: nextSheets});
    showToast(t('aiSavedToLibraryToast'));
  };

  const handleDeleteAiSheetFromLibrary = (sheetId: string) => {
    void commitDB({
      ...db,
      aiSheets: db.aiSheets.filter((s) => s.id !== sheetId),
    });
  };

  const handlePrintAiSheet = (
    sheet: ExerciseSheet,
    outputLanguage: OutputLanguage,
    validated: boolean,
  ) => {
    triggerPrint({kind: 'ai-sheet', sheet, outputLanguage, validated});
  };

  const handleSetPin = async (newPin: string) => {
    setActivePin(newPin);
    if (!storageBlocked) {
      const ok = await saveDB(db, newPin);
      setSaveError(!ok);
    }
    showToast(t('pinUpdatedToast'));
  };

  const handleRemovePin = async () => {
    setActivePin(null);
    if (!storageBlocked) {
      const ok = await saveDB(db, null);
      setSaveError(!ok);
    }
    showToast(t('pinRemovedToast'));
  };

  if (isLocked) {
    return (
      <LockScreen
        lang={lockLang}
        onToggleLang={handleToggleLang}
        onUnlock={handleUnlock}
        t={t}
      />
    );
  }

  const isEmpty =
    db.patients.length === 0 && db.rdv.length === 0 && db.bilans.length === 0;
  const showBackupBanner =
    !isEmpty && (db.lastBackup === 0 || Date.now() - db.lastBackup > SEVEN_DAYS_MS);

  const activePatientObj = patientDlg.patientId
    ? db.patients.find((p) => p.id === patientDlg.patientId) ?? null
    : null;
  const activeBilanObj = bilanDlg.bilanId
    ? db.bilans.find((b) => b.id === bilanDlg.bilanId) ?? null
    : null;
  const activeRdvObj = rdvDlg.rdvId
    ? db.rdv.find((r) => r.id === rdvDlg.rdvId) ?? null
    : null;
  const diagPatientObj = diagDlg.patientId
    ? db.patients.find((p) => p.id === diagDlg.patientId) ?? null
    : null;
  const orientPatientObj = orientDlg.patientId
    ? db.patients.find((p) => p.id === orientDlg.patientId) ?? null
    : null;
  const aiSheetPatientObj = aiSheetDlg.patientId
    ? db.patients.find((p) => p.id === aiSheetDlg.patientId) ?? null
    : null;
  const bilanPatientName =
    db.patients.find((p) => p.id === bilanDlg.patientId)?.nom ?? '';

  const navItems: {id: ViewId; label: string; icon: React.ComponentType<{className?: string}>}[] = [
    {id: 'agenda', label: t('navAgenda'), icon: CalendarDays},
    {id: 'parcours', label: t('navParcours'), icon: GitBranch},
    {id: 'patients', label: t('navPatients'), icon: Users},
    {id: 'caisse', label: t('navCaisse'), icon: Wallet},
    {id: 'stats', label: t('navStats'), icon: BarChart3},
  ];

  return (
    <>
      <div className="min-h-dvh flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 no-print pb-18 sm:pb-0">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 py-2.5">
            {/* Brand */}
            <div className="flex items-center gap-2.5 min-w-0">
              {db.cab.logo && (
                <img
                  src={db.cab.logo}
                  alt={db.cab.nom || t('appDefaultTitle')}
                  className="h-8 w-8 rounded object-contain shrink-0 bg-white"
                />
              )}
              <span className="text-base sm:text-lg font-bold tracking-tight truncate">
                {db.cab.nom.trim() || t('appDefaultTitle')}
              </span>
            </div>

            {/* Desktop Nav */}
            <nav aria-label="Primary" className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const active = view === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setView(item.id)}
                    className={`min-h-10 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'accent-bg'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
              <span
                aria-hidden="true"
                className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700 shrink-0"
              />
              <button
                type="button"
                onClick={() => openAiSheetOrSettings(null)}
                title={!aiReady ? t('aiLockedHint') : t('aiMenuBtn')}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  aiReady
                    ? 'border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                    : 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                {aiReady ? <Sparkles className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                <span>{t('aiMenuBtn')}</span>
              </button>
            </nav>

            {/* Utility actions */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => openAiSheetOrSettings(null)}
                title={!aiReady ? t('aiLockedHint') : t('aiMenuBtn')}
                aria-label={t('aiMenuBtn')}
                className={`md:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg border hover:bg-slate-100 dark:hover:bg-slate-800 ${
                  aiReady
                    ? 'border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                    : 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500'
                }`}
              >
                {aiReady ? <Sparkles className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={handleToggleLang}
                aria-label={t('switchLangAria')}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs sm:text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <Languages className="h-4 w-4" />
                <span>{t('otherLangLabel')}</span>
              </button>

              <button
                type="button"
                onClick={handleExportBackup}
                title={t('exportBackup')}
                aria-label={t('exportBackup')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Download className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                title={t('importBackup')}
                aria-label={t('importBackup')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Upload className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => setPinOpen(true)}
                title={t('accessCode')}
                aria-label={t('accessCode')}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border hover:bg-slate-100 dark:hover:bg-slate-800 ${
                  activePin
                    ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <Lock className="h-4 w-4" />
              </button>

              {activePin && (
                <button
                  type="button"
                  onClick={() => void lockNow()}
                  title={t('lockNow')}
                  aria-label={t('lockNow')}
                  className="hidden sm:inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  <span>{t('lockNow')}</span>
                </button>
              )}

              {authReady && !cloudUser && (
                <button
                  type="button"
                  disabled={cloudSigningIn}
                  onClick={() => void handleCloudSignIn()}
                  title={cloudSigningIn ? t('cloudSigningInBtn') : t('cloudSignInBtn')}
                  aria-label={t('cloudSignInBtn')}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
                >
                  <LogIn className="h-4 w-4" />
                  <span className="hidden lg:inline">
                    {cloudSigningIn ? t('cloudSigningInBtn') : t('cloudSignInBtn')}
                  </span>
                </button>
              )}

              {cloudUser && (
                <button
                  type="button"
                  onClick={() => void handleCloudSignOut()}
                  title={`${cloudUser.email ?? ''} — ${t('cloudSignOutBtn')}`}
                  aria-label={t('cloudSignOutBtn')}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden lg:inline truncate max-w-[140px]">
                    {cloudUser.displayName || cloudUser.email || t('cloudSignOutBtn')}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSettingsDlg({open: true, focusAi: false})}
                title={t('settings')}
                aria-label={t('settings')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* System Warning Banners */}
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 pt-4 space-y-2 empty:hidden">
          {authReady && !cloudUser && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-4 py-2.5 text-xs sm:text-sm text-blue-950 dark:text-blue-200">
              <span>{t('cloudLocalOnlyBanner')}</span>
              <button
                type="button"
                disabled={cloudSigningIn}
                onClick={() => void handleCloudSignIn()}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg accent-bg px-3 py-1.5 text-xs font-semibold disabled:opacity-60 whitespace-nowrap"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>{cloudSigningIn ? t('cloudSigningInBtn') : t('cloudSignInBtn')}</span>
              </button>
            </div>
          )}

          {cloudError && (
            <div
              role="alert"
              className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-4 py-3 text-sm text-red-900 dark:text-red-200"
            >
              {cloudError}
            </div>
          )}

          {storageBlocked && !cloudUser && (
            <div
              role="alert"
              className="rounded-xl border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50 px-4 py-3 text-sm text-amber-950 dark:text-amber-200"
            >
              {t('storageBlockedBanner')}
            </div>
          )}

          {saveError && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-4 py-3 text-sm text-red-900 dark:text-red-200"
            >
              <span>{t('saveErrorBanner')}</span>
              <button
                type="button"
                onClick={handleExportBackup}
                className="min-h-9 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 whitespace-nowrap"
              >
                {t('backupNowBtn')}
              </button>
            </div>
          )}

          {showBackupBanner && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
              <span>
                {db.lastBackup === 0 ? t('backupNeverBanner') : t('backupOverdueBanner')}
              </span>
              <button
                type="button"
                onClick={handleExportBackup}
                className="min-h-9 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                {t('backupNowBtn')}
              </button>
            </div>
          )}
        </div>

        {/* Main Content */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-5">
          {isEmpty && (
            <section className="mb-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6">
              <h1 className="text-xl font-bold tracking-tight mb-2">{t('welcomeTitle')}</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl mb-4 leading-relaxed">
                {t('welcomeDesc')}
              </p>
              <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-300 mb-5">
                <li>{t('welcomeStep1')}</li>
                <li>{t('welcomeStep2')}</li>
                <li>{t('welcomeStep3')}</li>
              </ul>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSettingsDlg({open: true, focusAi: false})}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <Settings className="h-4 w-4" />
                  <span>{t('settings')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPatientDlg({open: true, patientId: null})}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg accent-bg px-4 py-2 text-sm font-semibold"
                >
                  <Plus className="h-4 w-4" />
                  <span>{t('newPatient')}</span>
                </button>
                <button
                  type="button"
                  onClick={requestLoadDemo}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <Database className="h-4 w-4" />
                  <span>{t('loadDemo')}</span>
                </button>
              </div>
            </section>
          )}

          {view === 'agenda' && (
            <AgendaView
              db={db}
              selectedDate={selectedDate}
              onChangeDate={setSelectedDate}
              onOpenRdv={(rdv, seed) =>
                setRdvDlg({open: true, rdvId: rdv?.id ?? null, seed})
              }
              onQuickStatus={handleQuickStatus}
              onSendWhatsApp={handleSendWhatsApp}
              onPrintPlanning={(weekStart, thId) =>
                triggerPrint({kind: 'planning', weekStart, thId})
              }
              onOpenTherapists={() => setTherapistsOpen(true)}
              t={t}
            />
          )}

          {view === 'parcours' && (
            <ParcoursView
              db={db}
              onOpenPatient={(pat) =>
                setPatientDlg({open: true, patientId: pat.id})
              }
              onScheduleDiag={(pat) =>
                setDiagDlg({open: true, patientId: pat.id})
              }
              onOrient={(pat) =>
                setOrientDlg({open: true, patientId: pat.id})
              }
              onOpenSettings={() => setSettingsDlg({open: true, focusAi: false})}
              t={t}
            />
          )}

          {view === 'patients' && (
            <PatientsView
              db={db}
              onOpenPatient={(pat) =>
                setPatientDlg({open: true, patientId: pat?.id ?? null})
              }
              onPrintDossier={(pid) =>
                triggerPrint({kind: 'patient', patientId: pid})
              }
              t={t}
            />
          )}

          {view === 'caisse' && (
            <CaisseView
              db={db}
              onOpenPatient={(pat) =>
                setPatientDlg({open: true, patientId: pat.id})
              }
              onOpenRdv={(rdv) =>
                setRdvDlg({open: true, rdvId: rdv.id})
              }
              onPrintStatement={(pid) =>
                triggerPrint({kind: 'statement', patientId: pid})
              }
              onQuickMarkRdvsPaid={handleQuickMarkRdvsPaid}
              onAddVersement={handleAddVersement}
              onRemoveVersement={handleRemoveVersement}
              t={t}
            />
          )}

          {view === 'stats' && <StatistiquesView db={db} t={t} />}
        </main>

        {/* Mobile Bottom Tab Bar */}
        <nav
          aria-label="Mobile"
          className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm grid grid-cols-5"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={`flex flex-col items-center justify-center py-2 px-1 min-h-14 text-[11px] font-medium transition-colors ${
                  active
                    ? 'accent-text font-bold'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="h-5 w-5 mb-0.5" />
                <span className="truncate max-w-full">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImportFileChange}
          className="hidden"
        />
      </div>

      {/* Dialogs */}
      <PatientDialog
        open={patientDlg.open}
        patient={activePatientObj}
        db={db}
        onClose={() => setPatientDlg({open: false, patientId: null})}
        onSave={handleSavePatient}
        onDelete={handleDeletePatient}
        onOpenBilan={(pid, bil) =>
          setBilanDlg({open: true, patientId: pid, bilanId: bil?.id ?? null})
        }
        onOpenRdv={(rdv) => setRdvDlg({open: true, rdvId: rdv.id})}
        onOrient={(pid) => setOrientDlg({open: true, patientId: pid})}
        onPrintDossier={(pid) => triggerPrint({kind: 'patient', patientId: pid})}
        aiReady={aiReady}
        onOpenAiSheet={(pat) => openAiSheetOrSettings(pat.id)}
        t={t}
      />

      <BilanDialog
        open={bilanDlg.open}
        patientId={bilanDlg.patientId}
        patientName={bilanPatientName}
        bilan={activeBilanObj}
        lang={db.lang}
        onClose={() => setBilanDlg({open: false, patientId: '', bilanId: null})}
        onSave={handleSaveBilan}
        onDelete={handleDeleteBilan}
        onPrint={handlePrintBilan}
        t={t}
      />

      <RdvDialog
        open={rdvDlg.open}
        rdv={activeRdvObj}
        seed={rdvDlg.seed}
        db={db}
        onClose={() => setRdvDlg({open: false, rdvId: null})}
        onSave={handleSaveRdvs}
        onDelete={handleDeleteRdv}
        onPrintReceipt={handlePrintReceipt}
        onPrintReport={handlePrintRdvReport}
        onNotifyPaymentRemoved={(snapshot) => showToast(t('paymentRemovedToast'), snapshot)}
        onUpdateDbDirect={(nextDb) => void commitDB(nextDb)}
        t={t}
      />

      <DiagScheduleDialog
        open={diagDlg.open}
        patient={diagPatientObj}
        db={db}
        onClose={() => setDiagDlg({open: false, patientId: null})}
        onConfirm={handleScheduleDiag}
        t={t}
      />

      <OrientDialog
        open={orientDlg.open}
        patient={orientPatientObj}
        db={db}
        onClose={() => setOrientDlg({open: false, patientId: null})}
        onConfirm={handleOrientConfirm}
        t={t}
      />

      <SettingsDialog
        open={settingsDlg.open}
        focusAiSection={settingsDlg.focusAi}
        db={db}
        hasPin={activePin !== null}
        onClose={() => setSettingsDlg({open: false, focusAi: false})}
        onSave={handleSaveSettings}
        onClearAiLog={handleClearAiLog}
        onOpenPin={() => setPinOpen(true)}
        onLoadDemo={requestLoadDemo}
        t={t}
      />

      <TherapistsDialog
        open={therapistsOpen}
        db={db}
        onClose={() => setTherapistsOpen(false)}
        onSave={handleSaveTherapists}
        t={t}
      />

      <ExerciseSheetDialog
        open={aiSheetDlg.open}
        patient={aiSheetPatientObj}
        db={db}
        sessionConsentChecked={aiSessionConsent}
        onChangeSessionConsent={setAiSessionConsent}
        onClose={() => setAiSheetDlg({open: false, patientId: null})}
        onRecordSendLog={handleRecordAiSendLog}
        onSaveToPatient={handleSaveAiSheetToPatient}
        onSaveToLibrary={handleSaveAiSheetToLibrary}
        onDeleteFromLibrary={handleDeleteAiSheetFromLibrary}
        onPrintSheet={handlePrintAiSheet}
        t={t}
      />

      <PinDialog
        open={pinOpen}
        hasPin={activePin !== null}
        onClose={() => setPinOpen(false)}
        onSetPin={handleSetPin}
        onRemovePin={handleRemovePin}
        t={t}
      />

      <ImportDialog
        open={importDlg.open}
        rawText={importDlg.rawText}
        currentLang={db.lang}
        onClose={() => setImportDlg({open: false, rawText: ''})}
        onConfirmImport={(importedDb) => {
          const snapshot = structuredClone(db);
          void commitDB(importedDb);
          setImportDlg({open: false, rawText: ''});
          showToast(t('importSuccessToast'), snapshot);
        }}
        t={t}
      />

      <ConfirmDialog
        open={confirmDemoOpen}
        title={t('loadDemo')}
        message={t('demoConfirmReplace')}
        confirmLabel={t('confirm')}
        onConfirm={() => {
          setConfirmDemoOpen(false);
          executeLoadDemo();
        }}
        onCancel={() => setConfirmDemoOpen(false)}
        t={t}
      />

      <Toast
        toast={toast}
        onDismiss={() => setToast(null)}
        onUndo={handleUndo}
        t={t}
      />

      <PrintContainer db={db} doc={printDoc} t={t} />
    </>
  );
}
