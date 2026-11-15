import React from 'react';
import {ANAMNESE_FIELDS, BILAN_TYPES, PATHOLOGIES, type TranslationKey} from '../i18n';
import {todayISO} from '../storage';
import {parseTemplateSections} from '../templates';
import type {DB, PrintDoc, Rdv} from '../types';
import {
  addDaysISO,
  formatAge,
  formatCurrency,
  formatDateLong,
  formatDateShort,
  formatDayMonth,
  getStaffName,
  minutesToTime,
  patientFinancials,
  rdvPaidTotal,
  timeToMinutes,
} from '../utils';

interface PrintContainerProps {
  db: DB;
  doc: PrintDoc | null;
  t: (key: TranslationKey) => string;
}

const PrintHeader: React.FC<{db: DB; docTitle: string; subtitle?: string}> = ({
  db,
  docTitle,
  subtitle,
}) => {
  const {cab} = db;
  return (
    <header className="border-b-2 border-black pb-3 mb-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {cab.logo && (
          <img
            src={cab.logo}
            alt={cab.nom || 'Logo'}
            className="h-14 w-14 object-contain shrink-0"
          />
        )}
        <div>
          <div className="text-base font-bold text-black">
            {cab.nom || (db.lang === 'ar' ? 'عيادة الأرطوفونيا' : 'Cabinet d’orthophonie')}
          </div>
          {cab.pra && <div className="text-xs font-medium text-black">{cab.pra}</div>}
          {cab.addr && <div className="text-xs text-neutral-700">{cab.addr}</div>}
          {cab.tel && <div className="text-xs text-neutral-700 tabular-nums">{cab.tel}</div>}
          {cab.legal && <div className="text-[10px] text-neutral-600 mt-0.5">{cab.legal}</div>}
        </div>
      </div>
      <div className="text-end shrink-0">
        <div className="text-base font-bold text-black">{docTitle}</div>
        {subtitle && <div className="text-xs text-neutral-700 mt-0.5 tabular-nums">{subtitle}</div>}
      </div>
    </header>
  );
};

const PrintFooter: React.FC<{db: DB; t: (key: TranslationKey) => string}> = ({db, t}) => {
  return (
    <footer className="mt-8 pt-4 border-t border-neutral-300 flex items-start justify-between gap-8 print-avoid-break">
      <div className="text-xs text-neutral-600">
        {t('printGeneratedOn')} {formatDateShort(todayISO(), db.lang)}
      </div>
      <div className="w-56 text-center">
        <div className="text-xs font-semibold text-black mb-14">{t('printSignatureLabel')}</div>
        <div className="border-t border-neutral-400" />
      </div>
    </footer>
  );
};

export const PrintContainer: React.FC<PrintContainerProps> = ({db, doc, t}) => {
  if (!doc) return null;

  const lang = db.lang;

  if (doc.kind === 'patient') {
    const patient = db.patients.find((p) => p.id === doc.patientId);
    if (!patient) return null;
    const bilans = db.bilans
      .filter((b) => b.pid === patient.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    const sessions = db.rdv
      .filter((r) => r.pid === patient.id)
      .sort((a, b) => `${b.date} ${b.heure}`.localeCompare(`${a.date} ${a.heure}`));
    const pathoLabel =
      patient.patho !== '' ? PATHOLOGIES[lang][Number(patient.patho)] ?? '' : '';
    const thName = getStaffName(db, patient.th);
    const nonEmptyAnamnese = ANAMNESE_FIELDS.filter((f) => patient.an[f.key].trim().length > 0);

    return (
      <div className="hidden print-only bg-white text-black">
        <PrintHeader db={db} docTitle={t('printDossierTitle')} subtitle={patient.nom} />

        <section className="mb-4">
          <h2 className="text-sm font-bold border-b border-neutral-400 pb-1 mb-2">
            {t('printIdentitySection')}
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <div>
              <span className="font-semibold">{t('nameLabel')} : </span>
              {patient.nom}
            </div>
            <div>
              <span className="font-semibold">{t('birthDateLabel')} : </span>
              <span className="tabular-nums">
                {patient.naissance
                  ? `${formatDateShort(patient.naissance, lang)} (${formatAge(
                      patient.naissance,
                      lang,
                      t('yearOld'),
                      t('yearsOld'),
                    )})`
                  : '—'}
              </span>
            </div>
            <div>
              <span className="font-semibold">{t('phoneLabel')} : </span>
              <span className="tabular-nums">{patient.tel || '—'}</span>
            </div>
            <div>
              <span className="font-semibold">{t('parentLabel')} : </span>
              {patient.parent || '—'}
            </div>
            <div>
              <span className="font-semibold">{t('doctorLabel')} : </span>
              {patient.medecin || '—'}
            </div>
            <div>
              <span className="font-semibold">{t('pathologyLabel')} : </span>
              {pathoLabel || '—'}
            </div>
            <div>
              <span className="font-semibold">{t('stageLabel')} : </span>
              {t(`stage_${patient.stage}`)}
            </div>
            <div>
              <span className="font-semibold">{t('assignedTherapistLabel')} : </span>
              {thName || '—'}
            </div>
          </div>
          {patient.motif && (
            <div className="mt-2 text-xs">
              <span className="font-semibold">{t('motifLabel')} : </span>
              <span className="whitespace-pre-wrap">{patient.motif}</span>
            </div>
          )}
          {patient.notes && (
            <div className="mt-1.5 text-xs">
              <span className="font-semibold">{t('notesLabel')} : </span>
              <span className="whitespace-pre-wrap">{patient.notes}</span>
            </div>
          )}
        </section>

        {nonEmptyAnamnese.length > 0 && (
          <section className="mb-4">
            <h2 className="text-sm font-bold border-b border-neutral-400 pb-1 mb-2">
              {t('printAnamneseSection')}
            </h2>
            <div className="space-y-1.5 text-xs">
              {nonEmptyAnamnese.map((f) => (
                <div key={f.key} className="print-avoid-break">
                  <div className="font-semibold">{lang === 'ar' ? f.ar : f.fr}</div>
                  <div className="whitespace-pre-wrap text-neutral-800">{patient.an[f.key]}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {bilans.length > 0 && (
          <section className="mb-4">
            <h2 className="text-sm font-bold border-b border-neutral-400 pb-1 mb-2">
              {t('printBilansSection')}
            </h2>
            <div className="space-y-2 text-xs">
              {bilans.map((b) => (
                <div key={b.id} className="border border-neutral-300 p-2 print-avoid-break">
                  <div className="font-semibold tabular-nums">
                    {formatDateShort(b.date, lang)} — {BILAN_TYPES[lang][Number(b.type)] ?? ''}
                  </div>
                  {b.concl && (
                    <div className="mt-1 whitespace-pre-wrap text-neutral-800">{b.concl}</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {sessions.length > 0 && (
          <section className="mb-4">
            <h2 className="text-sm font-bold border-b border-neutral-400 pb-1 mb-2">
              {t('printSeancesSection')}
            </h2>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-400">
                  <th className="py-1 text-start font-semibold">{t('colDate')}</th>
                  <th className="py-1 text-start font-semibold">{t('timeLabel')}</th>
                  <th className="py-1 text-start font-semibold">{t('statusLabel')}</th>
                  <th className="py-1 text-start font-semibold">{t('sessionReportLabel')}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-200">
                    <td className="py-1 tabular-nums">{formatDateShort(r.date, lang)}</td>
                    <td className="py-1 tabular-nums">{r.heure}</td>
                    <td className="py-1">{t(`statut_${r.statut}`)}</td>
                    <td className="py-1">{r.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <PrintFooter db={db} t={t} />
      </div>
    );
  }

  if (doc.kind === 'bilan') {
    const bilan = db.bilans.find((b) => b.id === doc.bilanId);
    const patient = bilan ? db.patients.find((p) => p.id === bilan.pid) : undefined;
    if (!bilan || !patient) return null;

    const testSections = parseTemplateSections(bilan.tests);
    const conclSections = parseTemplateSections(bilan.concl);
    const typeLabel = BILAN_TYPES[lang][Number(bilan.type)] ?? '';

    return (
      <div className="hidden print-only bg-white text-black">
        <PrintHeader
          db={db}
          docTitle={t('printBilanTitle')}
          subtitle={`${typeLabel} · ${formatDateShort(bilan.date, lang)}`}
        />

        <div className="border border-neutral-400 p-2.5 mb-4 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="font-semibold">{t('patientLabel')} : </span>
            {patient.nom}
          </div>
          <div>
            <span className="font-semibold">{t('birthDateLabel')} : </span>
            <span className="tabular-nums">
              {patient.naissance
                ? `${formatDateShort(patient.naissance, lang)} (${formatAge(
                    patient.naissance,
                    lang,
                    t('yearOld'),
                    t('yearsOld'),
                  )})`
                : '—'}
            </span>
          </div>
          {patient.parent && (
            <div>
              <span className="font-semibold">{t('parentLabel')} : </span>
              {patient.parent}
            </div>
          )}
          {patient.medecin && (
            <div>
              <span className="font-semibold">{t('doctorLabel')} : </span>
              {patient.medecin}
            </div>
          )}
        </div>

        <div className="space-y-3 text-xs">
          {testSections.map((sec, idx) => (
            <div key={idx} className="print-avoid-break">
              {sec.heading && <div className="font-bold text-black mb-0.5">{sec.heading}</div>}
              <div className="whitespace-pre-wrap text-neutral-900 leading-relaxed">{sec.body}</div>
            </div>
          ))}

          {conclSections.length > 0 && (
            <div className="pt-2 border-t border-neutral-400 space-y-2.5">
              {conclSections.map((sec, idx) => (
                <div key={idx} className="print-avoid-break">
                  {sec.heading && <div className="font-bold text-black mb-0.5">{sec.heading}</div>}
                  <div className="whitespace-pre-wrap text-neutral-900 leading-relaxed">{sec.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <PrintFooter db={db} t={t} />
      </div>
    );
  }

  if (doc.kind === 'rdv-report') {
    const rdv = db.rdv.find((r) => r.id === doc.rdvId);
    const patient = rdv ? db.patients.find((p) => p.id === rdv.pid) : undefined;
    if (!rdv || !patient) return null;

    return (
      <div className="hidden print-only bg-white text-black">
        <PrintHeader
          db={db}
          docTitle={t('printRdvReportTitle')}
          subtitle={`${formatDateLong(rdv.date, lang)} · ${rdv.heure}`}
        />

        <div className="border border-neutral-400 p-3 mb-4 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="font-semibold">{t('patientLabel')} : </span>
            {patient.nom}
          </div>
          <div>
            <span className="font-semibold">{t('therapistLabel')} : </span>
            {getStaffName(db, rdv.th) || '—'}
          </div>
          <div>
            <span className="font-semibold">{t('kindLabel')} : </span>
            {t(`kind_${rdv.kind}`)}
          </div>
          <div>
            <span className="font-semibold">{t('durationMinLabel')} : </span>
            <span className="tabular-nums">{rdv.dur} min</span>
          </div>
        </div>

        <div className="text-xs">
          <div className="font-bold mb-1.5">{t('sessionReportLabel')}</div>
          <div className="whitespace-pre-wrap leading-relaxed min-h-[120px] border border-neutral-300 p-3">
            {rdv.note || '—'}
          </div>
        </div>

        <PrintFooter db={db} t={t} />
      </div>
    );
  }

  if (doc.kind === 'receipt') {
    const rdv = db.rdv.find((r) => r.id === doc.rdvId);
    const patient = rdv ? db.patients.find((p) => p.id === rdv.pid) : undefined;
    if (!rdv || !patient) return null;

    const paid = rdvPaidTotal(rdv);
    const remaining = rdv.tarif - paid;

    return (
      <div className="hidden print-only bg-white text-black">
        <PrintHeader
          db={db}
          docTitle={t('printReceiptTitle')}
          subtitle={rdv.rno ? `${t('receiptNumberLabel')} ${rdv.rno}` : undefined}
        />

        <div className="border border-neutral-400 p-3 mb-4 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="font-semibold">{t('patientLabel')} : </span>
            {patient.nom}
          </div>
          <div>
            <span className="font-semibold">{t('colDate')} : </span>
            <span className="tabular-nums">
              {formatDateShort(rdv.date, lang)} · {rdv.heure}
            </span>
          </div>
          <div>
            <span className="font-semibold">{t('kindLabel')} : </span>
            {t(`kind_${rdv.kind}`)}
          </div>
          <div>
            <span className="font-semibold">{t('therapistLabel')} : </span>
            {getStaffName(db, rdv.th) || '—'}
          </div>
        </div>

        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="py-1.5 text-start font-bold">{t('paymentsLabel')}</th>
              <th className="py-1.5 text-end font-bold">{t('colPaid')}</th>
            </tr>
          </thead>
          <tbody>
            {rdv.pay.length === 0 ? (
              <tr className="border-b border-neutral-300">
                <td className="py-2 text-neutral-600">—</td>
                <td className="py-2 text-end tabular-nums">{formatCurrency(0, lang)}</td>
              </tr>
            ) : (
              rdv.pay.map((p, idx) => (
                <tr key={idx} className="border-b border-neutral-300">
                  <td className="py-1.5 tabular-nums">{formatDateShort(p.d, lang)}</td>
                  <td className="py-1.5 text-end tabular-nums">{formatCurrency(p.m, lang)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="ms-auto w-64 space-y-1 text-xs border border-neutral-400 p-3">
          <div className="flex justify-between">
            <span>{t('colTariff')}</span>
            <span className="font-semibold tabular-nums">{formatCurrency(rdv.tarif, lang)}</span>
          </div>
          <div className="flex justify-between">
            <span>{t('totalCollected')}</span>
            <span className="font-semibold tabular-nums">{formatCurrency(paid, lang)}</span>
          </div>
          <div className="flex justify-between border-t border-neutral-400 pt-1 font-bold">
            <span>{remaining < 0 ? t('creditLabel') : t('colRemaining')}</span>
            <span className="tabular-nums">{formatCurrency(Math.abs(remaining), lang)}</span>
          </div>
        </div>

        <PrintFooter db={db} t={t} />
      </div>
    );
  }

  if (doc.kind === 'statement') {
    const patient = db.patients.find((p) => p.id === doc.patientId);
    if (!patient) return null;

    const sessions = db.rdv
      .filter((r) => r.pid === patient.id)
      .sort((a, b) => `${a.date} ${a.heure}`.localeCompare(`${b.date} ${b.heure}`));
    const fin = patientFinancials(db, patient.id);

    return (
      <div className="hidden print-only bg-white text-black">
        <PrintHeader db={db} docTitle={t('printStatementTitle')} subtitle={patient.nom} />

        <div className="border border-neutral-400 p-2.5 mb-4 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="font-semibold">{t('patientLabel')} : </span>
            {patient.nom}
          </div>
          <div>
            <span className="font-semibold">{t('phoneLabel')} : </span>
            <span className="tabular-nums">{patient.tel || '—'}</span>
          </div>
        </div>

        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="py-1.5 text-start font-bold">{t('colDate')}</th>
              <th className="py-1.5 text-start font-bold">{t('statusLabel')}</th>
              <th className="py-1.5 text-end font-bold">{t('colTariff')}</th>
              <th className="py-1.5 text-end font-bold">{t('colPaid')}</th>
              <th className="py-1.5 text-end font-bold">{t('colRemaining')}</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((r) => {
              const billed = r.statut === 'fait' ? r.tarif : 0;
              const paid = rdvPaidTotal(r);
              return (
                <tr key={r.id} className="border-b border-neutral-300">
                  <td className="py-1.5 tabular-nums">
                    {formatDateShort(r.date, lang)} {r.heure}
                  </td>
                  <td className="py-1.5">{t(`statut_${r.statut}`)}</td>
                  <td className="py-1.5 text-end tabular-nums">{formatCurrency(billed, lang)}</td>
                  <td className="py-1.5 text-end tabular-nums">{formatCurrency(paid, lang)}</td>
                  <td className="py-1.5 text-end tabular-nums">
                    {formatCurrency(billed - paid, lang)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black font-bold">
              <td colSpan={2} className="py-2">
                {t('totalsLabel')}
              </td>
              <td className="py-2 text-end tabular-nums">{formatCurrency(fin.billed, lang)}</td>
              <td className="py-2 text-end tabular-nums">{formatCurrency(fin.paid, lang)}</td>
              <td className="py-2 text-end tabular-nums">
                {fin.balance < 0
                  ? `${t('creditLabel')} ${formatCurrency(Math.abs(fin.balance), lang)}`
                  : formatCurrency(fin.balance, lang)}
              </td>
            </tr>
          </tfoot>
        </table>

        <PrintFooter db={db} t={t} />
      </div>
    );
  }

  if (doc.kind === 'planning') {
    const daysAll = Array.from({length: 7}, (_, idx) => addDaysISO(doc.weekStart, idx));
    const weekEnd = daysAll[6];

    // If a specific therapist is filtered (or there is 0/1 therapist), print that therapist's Heure × Jours grid
    if (doc.thId || db.staff.length <= 1) {
      const targetStaff = doc.thId
        ? db.staff.find((s) => s.id === doc.thId)
        : db.staff[0];
      const st = targetStaff ?? {
        id: '',
        nom: db.cab.pra || t('appDefaultTitle'),
        role: 'main' as const,
      };
      const staffRdvs = db.rdv.filter(
        (r) =>
          (st.id === '' ? true : r.th === st.id) &&
          r.date >= doc.weekStart &&
          r.date <= weekEnd &&
          r.statut !== 'absent',
      );
      const hasSat = staffRdvs.some((r) => r.date === daysAll[5]);
      const hasSun = staffRdvs.some((r) => r.date === daysAll[6]);
      const cols = daysAll.slice(0, 5);
      if (hasSat) cols.push(daysAll[5]);
      if (hasSun) cols.push(daysAll[6]);

      const slotTimes = Array.from(new Set(staffRdvs.map((r) => r.heure))).sort();
      const subtitle = `${t('planningHeader')} : ${st.nom} · ${t('weekRangePrefix')} ${formatDateShort(
        doc.weekStart,
        lang,
      )} ${t('weekRangeTo')} ${formatDateShort(weekEnd, lang)} · ${staffRdvs.length} ${t(
        'sessionsCount',
      )}`;

      return (
        <div className="hidden print-only bg-white text-black">
          <PrintHeader db={db} docTitle={`${t('planningHeader')} : ${st.nom}`} subtitle={subtitle} />

          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="border border-neutral-400 px-2 py-1.5 text-start w-16">
                  {t('timeLabel')}
                </th>
                {cols.map((d) => (
                  <th key={d} className="border border-neutral-400 px-2 py-1.5 text-start">
                    {formatDayMonth(d, lang)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slotTimes.length === 0 ? (
                <tr>
                  <td
                    colSpan={cols.length + 1}
                    className="border border-neutral-300 px-3 py-6 text-center text-neutral-600"
                  >
                    {t('noAppointmentsDay')}
                  </td>
                </tr>
              ) : (
                slotTimes.map((heure) => (
                  <tr key={heure}>
                    <td className="border border-neutral-300 px-2 py-1.5 font-semibold tabular-nums align-top">
                      {heure}
                    </td>
                    {cols.map((d) => {
                      const cellRdvs: Rdv[] = staffRdvs.filter(
                        (r) => r.date === d && r.heure === heure,
                      );
                      return (
                        <td key={d} className="border border-neutral-300 px-2 py-1.5 align-top">
                          {cellRdvs.map((r) => {
                            const pat = db.patients.find((p) => p.id === r.pid);
                            const endTime = minutesToTime(timeToMinutes(r.heure) + r.dur);
                            return (
                              <div
                                key={r.id}
                                className={`mb-1 last:mb-0 ${r.kind === 'diag' ? 'italic' : ''}`}
                              >
                                <span className="tabular-nums font-medium">
                                  {r.heure}–{endTime}
                                </span>{' '}
                                <span>{pat?.nom ?? ''}</span>
                                {r.kind === 'diag' && (
                                  <span className="ms-1 text-[10px] border border-neutral-500 px-1 rounded">
                                    {t('kind_diag')}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <PrintFooter db={db} t={t} />
        </div>
      );
    }

    // All therapists in columns (Jour × Therapists)
    const weekRdvs = db.rdv.filter(
      (r) => r.date >= doc.weekStart && r.date <= weekEnd && r.statut !== 'absent',
    );
    const staffIds = new Set(db.staff.map((s) => s.id));
    const hasUnassigned = weekRdvs.some((r) => !r.th || !staffIds.has(r.th));
    const hasSat = weekRdvs.some((r) => r.date === daysAll[5]);
    const hasSun = weekRdvs.some((r) => r.date === daysAll[6]);
    const dayRows = daysAll.slice(0, 5);
    if (hasSat) dayRows.push(daysAll[5]);
    if (hasSun) dayRows.push(daysAll[6]);

    const columns = [
      ...db.staff.map((s) => ({id: s.id, nom: s.nom, specialite: s.specialite ?? '', isUnassigned: false})),
      ...(hasUnassigned
        ? [{id: '__unassigned__', nom: t('unassignedCol'), specialite: '', isUnassigned: true}]
        : []),
    ];

    const subtitle = `${t('allTherapists')} · ${t('weekRangePrefix')} ${formatDateShort(
      doc.weekStart,
      lang,
    )} ${t('weekRangeTo')} ${formatDateShort(weekEnd, lang)} · ${weekRdvs.length} ${t(
      'sessionsCount',
    )}`;

    return (
      <div className="hidden print-only bg-white text-black">
        <PrintHeader db={db} docTitle={t('weeklyPlanning')} subtitle={subtitle} />

        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="border border-neutral-400 px-2 py-1.5 text-start w-24">
                {t('colDate')}
              </th>
              {columns.map((col) => (
                <th key={col.id} className="border border-neutral-400 px-2 py-1.5 text-start">
                  <div>{col.nom}</div>
                  {col.specialite && (
                    <div className="text-[10px] font-normal text-neutral-600">{col.specialite}</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dayRows.map((d) => (
              <tr key={d}>
                <td className="border border-neutral-300 px-2 py-1.5 font-semibold align-top">
                  {formatDayMonth(d, lang)}
                </td>
                {columns.map((col) => {
                  const cellRdvs = weekRdvs
                    .filter((r) =>
                      col.isUnassigned
                        ? r.date === d && (!r.th || !staffIds.has(r.th))
                        : r.date === d && r.th === col.id,
                    )
                    .sort((a, b) => a.heure.localeCompare(b.heure));
                  return (
                    <td key={col.id} className="border border-neutral-300 px-2 py-1.5 align-top">
                      {cellRdvs.length === 0 ? (
                        <span className="text-neutral-400">—</span>
                      ) : (
                        cellRdvs.map((r) => {
                          const pat = db.patients.find((p) => p.id === r.pid);
                          const endTime = minutesToTime(timeToMinutes(r.heure) + r.dur);
                          return (
                            <div
                              key={r.id}
                              className={`mb-1 last:mb-0 ${r.kind === 'diag' ? 'italic' : ''}`}
                            >
                              <span className="tabular-nums font-medium">
                                {r.heure}–{endTime}
                              </span>{' '}
                              <span>{pat?.nom ?? ''}</span>
                              {r.kind === 'diag' && (
                                <span className="ms-1 text-[10px] border border-neutral-500 px-1 rounded">
                                  {t('kind_diag')}
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <PrintFooter db={db} t={t} />
      </div>
    );
  }

  if (doc.kind === 'ai-sheet') {
    const {sheet, outputLanguage, validated} = doc;
    const isSheetRtl =
      outputLanguage === 'ar_msa' || outputLanguage === 'ar_darija_instructions';
    const isBilingual = outputLanguage === 'bilingual_fr_ar';

    return (
      <div
        dir={isSheetRtl ? 'rtl' : undefined}
        className="hidden print-only bg-white text-black"
      >
        <PrintHeader db={db} docTitle={t('aiPrintTitle')} subtitle={sheet.title} />

        {!validated && (
          <div className="border border-black p-2 mb-3 text-xs font-semibold">
            {t('aiDraftBanner')}
          </div>
        )}

        <div className="mb-4">
          <h1 className="text-lg font-bold text-black mb-1">{sheet.title}</h1>
          <p className="text-sm text-neutral-800">{sheet.objective}</p>
        </div>

        {sheet.parentTips.length > 0 && (
          <section className="mb-4 border border-neutral-400 p-3 print-avoid-break">
            <h2 className="text-sm font-bold mb-1.5">{t('aiTipsField')}</h2>
            <ul className="list-disc ps-5 space-y-1 text-xs">
              {sheet.parentTips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-4 mb-5">
          {sheet.activities.map((act, idx) => {
            const useTable =
              act.type === 'wordList' || act.type === 'minimalPairs' || isBilingual;

            return (
              <div key={idx} className="border border-neutral-300 p-3 print-avoid-break">
                <div className="text-sm font-bold text-black mb-1">
                  {idx + 1}. {act.name}
                </div>
                <div className="text-xs text-neutral-800 mb-2.5">{act.instructions}</div>

                {act.items.length > 0 && useTable ? (
                  <table className="w-full border-collapse text-[14pt]">
                    <thead>
                      <tr className="border-b border-neutral-400 text-xs">
                        <th className="py-1 px-2 text-start font-semibold">
                          {t('aiPrintWordCol')}
                        </th>
                        {act.items.some((it) => it.target) && (
                          <th className="py-1 px-2 text-start font-semibold">
                            {t('aiPrintTargetCol')}
                          </th>
                        )}
                        {(isBilingual || act.items.some((it) => it.translation)) && (
                          <th className="py-1 px-2 text-start font-semibold">
                            {t('aiPrintTransCol')}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {act.items.map((item, itemIdx) => (
                        <tr key={itemIdx} className="border-b border-neutral-200">
                          <td className="py-1.5 px-2 font-medium">{item.text}</td>
                          {act.items.some((it) => it.target) && (
                            <td className="py-1.5 px-2 text-sm text-neutral-700">
                              {item.target || '—'}
                            </td>
                          )}
                          {(isBilingual || act.items.some((it) => it.translation)) && (
                            <td
                              dir="auto"
                              className="py-1.5 px-2 font-medium"
                            >
                              {item.translation || '—'}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <ul className="space-y-1.5 text-[14pt]">
                    {act.items.map((item, itemIdx) => (
                      <li key={itemIdx} className="flex flex-wrap items-baseline gap-2">
                        <span>• {item.text}</span>
                        {item.target && (
                          <span className="text-xs text-neutral-700">[{item.target}]</span>
                        )}
                        {item.translation && (
                          <span dir="auto" className="text-sm text-neutral-800">
                            — {item.translation}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>

        {/* Weekly practice tracking grid */}
        <section className="mb-4 print-avoid-break">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1.5">
            <h2 className="text-sm font-bold">{t('aiPrintTrackingTitle')}</h2>
            <span className="text-xs tabular-nums">
              {t('aiPrintRoutineSummary')} {sheet.routine.minutesPerDay} {t('aiPrintMinPerDay')} ·{' '}
              {sheet.routine.daysPerWeek} {t('aiPrintDaysPerWeek')}
            </span>
          </div>
          <table className="w-full border-collapse text-xs text-center">
            <thead>
              <tr>
                {sheet.progressGrid.map((day, i) => (
                  <th key={i} className="border border-neutral-500 py-1.5 px-2 font-semibold">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {sheet.progressGrid.map((_, i) => (
                  <td key={i} className="border border-neutral-500 py-3">
                    <span className="inline-block h-4 w-4 border border-black" />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </section>

        {sheet.closingNote && (
          <p className="text-xs text-neutral-800 italic mb-2">{sheet.closingNote}</p>
        )}

        <PrintFooter db={db} t={t} />
      </div>
    );
  }

  return null;
};
