import type {DB, Lang, Patient, Rdv} from './types';

export function formatCurrency(amount: number, lang: Lang): string {
  const rounded = Math.round(amount);
  const locale = lang === 'ar' ? 'ar-DZ-u-nu-latn' : 'fr-FR';
  const num = new Intl.NumberFormat(locale, {maximumFractionDigits: 0}).format(rounded);
  return lang === 'ar' ? `${num} دج` : `${num} DA`;
}

export function formatNumber(n: number, lang: Lang): string {
  const locale = lang === 'ar' ? 'ar-DZ-u-nu-latn' : 'fr-FR';
  return new Intl.NumberFormat(locale, {maximumFractionDigits: 1}).format(n);
}

export function parseISODateLocal(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function formatDateLong(iso: string, lang: Lang): string {
  const dt = parseISODateLocal(iso);
  if (!dt) return iso;
  const locale = lang === 'ar' ? 'ar-DZ-u-nu-latn' : 'fr-FR';
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dt);
}

export function formatDateShort(iso: string, lang: Lang): string {
  const dt = parseISODateLocal(iso);
  if (!dt) return iso;
  const locale = lang === 'ar' ? 'ar-DZ-u-nu-latn' : 'fr-FR';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(dt);
}

export function formatDayMonth(iso: string, lang: Lang): string {
  const dt = parseISODateLocal(iso);
  if (!dt) return iso;
  const locale = lang === 'ar' ? 'ar-DZ-u-nu-latn' : 'fr-FR';
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(dt);
}

export function formatMonthYear(yyyyMm: string, lang: Lang): string {
  if (!/^\d{4}-\d{2}$/.test(yyyyMm)) return yyyyMm;
  const [y, m] = yyyyMm.split('-').map(Number);
  const dt = new Date(y, m - 1, 15, 12, 0, 0, 0);
  const locale = lang === 'ar' ? 'ar-DZ-u-nu-latn' : 'fr-FR';
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(dt);
}

export function formatMonthShort(yyyyMm: string, lang: Lang): string {
  if (!/^\d{4}-\d{2}$/.test(yyyyMm)) return yyyyMm;
  const [y, m] = yyyyMm.split('-').map(Number);
  const dt = new Date(y, m - 1, 15, 12, 0, 0, 0);
  const locale = lang === 'ar' ? 'ar-DZ-u-nu-latn' : 'fr-FR';
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
  }).format(dt);
}

export function addDaysISO(iso: string, days: number): string {
  const dt = parseISODateLocal(iso);
  if (!dt) return iso;
  dt.setDate(dt.getDate() + days);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getMondayISO(iso: string): string {
  const dt = parseISODateLocal(iso);
  if (!dt) return iso;
  const day = dt.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  return addDaysISO(iso, diff);
}

export function computeAge(naissance: string): number | null {
  const dt = parseISODateLocal(naissance);
  if (!dt) return null;
  const now = new Date();
  let age = now.getFullYear() - dt.getFullYear();
  const mDiff = now.getMonth() - dt.getMonth();
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < dt.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

export function formatAge(naissance: string, lang: Lang, yearOldWord: string, yearsOldWord: string): string {
  const age = computeAge(naissance);
  if (age === null) return '—';
  const unit = lang === 'ar' ? yearsOldWord : age <= 1 ? yearOldWord : yearsOldWord;
  return `${age} ${unit}`;
}

export function normalizeSearch(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function minutesToTime(totalMin: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMin)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function rdvPaidTotal(rdv: Rdv): number {
  return rdv.pay.reduce((acc, p) => acc + p.m, 0);
}

export function rdvBilledAmount(rdv: Rdv): number {
  return rdv.statut === 'fait' ? rdv.tarif : 0;
}

export function patientFinancials(db: DB, pid: string): {billed: number; paid: number; balance: number} {
  let billed = 0;
  let paid = 0;
  for (const r of db.rdv) {
    if (r.pid !== pid) continue;
    billed += rdvBilledAmount(r);
    paid += rdvPaidTotal(r);
  }
  return {billed, paid, balance: billed - paid};
}

export function totalPracticeOwed(db: DB): number {
  const byPatient = new Map<string, {billed: number; paid: number}>();
  for (const r of db.rdv) {
    const cur = byPatient.get(r.pid) ?? {billed: 0, paid: 0};
    cur.billed += rdvBilledAmount(r);
    cur.paid += rdvPaidTotal(r);
    byPatient.set(r.pid, cur);
  }
  let total = 0;
  for (const v of byPatient.values()) {
    if (v.billed > v.paid) total += v.billed - v.paid;
  }
  return total;
}

export function monthCollectedTotal(db: DB, yyyyMm: string): number {
  let sum = 0;
  for (const r of db.rdv) {
    for (const p of r.pay) {
      if (p.d.startsWith(yyyyMm)) {
        sum += p.m;
      }
    }
  }
  return sum;
}

export function hasOverlap(
  rdvList: Rdv[],
  candidate: {id?: string; date: string; heure: string; dur: number; th: string},
): boolean {
  const startA = timeToMinutes(candidate.heure);
  const endA = startA + candidate.dur;
  for (const r of rdvList) {
    if (candidate.id && r.id === candidate.id) continue;
    if (r.statut === 'absent') continue;
    if (r.date !== candidate.date) continue;
    if (r.th !== candidate.th) continue;
    const startB = timeToMinutes(r.heure);
    const endB = startB + r.dur;
    if (startA < endB && startB < endA) {
      return true;
    }
  }
  return false;
}

export function getStaffName(db: DB, thId: string): string {
  if (!thId) return '';
  return db.staff.find((s) => s.id === thId)?.nom ?? '';
}

export function getPatientName(db: DB, pid: string): string {
  return db.patients.find((p) => p.id === pid)?.nom ?? '';
}

export function sortPatientsByName(patients: Patient[], lang: Lang): Patient[] {
  const locale = lang === 'ar' ? 'ar-DZ' : 'fr-FR';
  return [...patients].sort((a, b) => a.nom.localeCompare(b.nom, locale, {sensitivity: 'base'}));
}

export function contrastForeground(hex: string): string {
  const clean = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#2b4c9b';
  const r = parseInt(clean.slice(1, 3), 16) / 255;
  const g = parseInt(clean.slice(3, 5), 16) / 255;
  const b = parseInt(clean.slice(5, 7), 16) / 255;
  const lin = [r, g, b].map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return lum > 0.45 ? '#0f172a' : '#ffffff';
}

export function currentMonthYYYYMM(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
