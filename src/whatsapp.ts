import type {Cabinet, Lang, Patient, Rdv} from './types';
import {formatDateLong} from './utils';

export function normalizeAlgeriaPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = '213' + digits.slice(1);
  } else if (digits.length === 9) {
    digits = '213' + digits;
  }

  if (digits.length < 11 || digits.length > 15) {
    return null;
  }
  return digits;
}

const DEFAULT_WA_FR =
  'Bonjour, rappel : séance de {nom} le {date} à {heure}. Merci de nous prévenir en cas d’empêchement. {cabinet}';
const DEFAULT_WA_AR =
  'السلام عليكم، تذكير: حصة {nom} يوم {date} على الساعة {heure}. المرجو إعلامنا في حالة وجود مانع. {cabinet}';

export function buildWhatsAppMessage(
  patient: Patient,
  rdv: Rdv,
  cab: Cabinet,
  lang: Lang,
): string {
  const template = cab.wamsg.trim() || (lang === 'ar' ? DEFAULT_WA_AR : DEFAULT_WA_FR);
  const longDate = formatDateLong(rdv.date, lang);
  const cabName = cab.nom.trim() || (lang === 'ar' ? 'العيادة' : 'Le cabinet');
  return template
    .replace(/\{nom\}/g, patient.nom)
    .replace(/\{date\}/g, longDate)
    .replace(/\{heure\}/g, rdv.heure)
    .replace(/\{cabinet\}/g, cabName);
}

export function isReminderSentForRdv(rdv: Rdv): boolean {
  return rdv.rem === `${rdv.date} ${rdv.heure}`;
}

export function openWhatsAppReminder(
  patient: Patient,
  rdv: Rdv,
  cab: Cabinet,
  lang: Lang,
): {ok: true; remStamp: string} | {ok: false; errorKey: 'noPhoneError'} {
  const normalized = normalizeAlgeriaPhone(patient.tel);
  if (!normalized) {
    return {ok: false, errorKey: 'noPhoneError'};
  }
  const msg = buildWhatsAppMessage(patient, rdv, cab, lang);
  const url = `https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank', 'noopener');
  return {ok: true, remStamp: `${rdv.date} ${rdv.heure}`};
}
