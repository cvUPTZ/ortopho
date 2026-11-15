import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Database, Lock, Sparkles, Trash2, Upload} from 'lucide-react';
import {Modal} from '../components/Modal';
import {StaffCrudPanel} from '../components/StaffCrudPanel';
import type {TranslationKey} from '../i18n';
import type {AiSettings, Cabinet, DB, ExpertiseDomain, Staff} from '../types';

interface SettingsDialogProps {
  open: boolean;
  focusAiSection?: boolean;
  db: DB;
  hasPin: boolean;
  onClose: () => void;
  onSave: (
    cab: Cabinet,
    tarif: number,
    domains: ExpertiseDomain[],
    staff: Staff[],
    ai: AiSettings,
    reassignments: Record<string, string>,
  ) => void;
  onClearAiLog: () => void;
  onOpenPin: () => void;
  onLoadDemo: () => void;
  t: (key: TranslationKey) => string;
}

async function resizeLogoFile(file: File): Promise<string | null> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return null;
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('IMG_ERR'));
      el.src = objectUrl;
    });

    const maxDim = 280;
    const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);

    const outMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    let dataUrl = canvas.toDataURL(outMime, 0.85);
    if (dataUrl.length > 265_000) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    }
    if (dataUrl.length > 275_000) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.55);
    }
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 280_000) {
      return null;
    }
    return dataUrl;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  focusAiSection = false,
  db,
  hasPin,
  onClose,
  onSave,
  onClearAiLog,
  onOpenPin,
  onLoadDemo,
  t,
}) => {
  const [cab, setCab] = useState<Cabinet>(db.cab);
  const [tarif, setTarif] = useState<number>(db.tarif);
  const [domainsDraft, setDomainsDraft] = useState<ExpertiseDomain[]>(db.domains);
  const [staffDraft, setStaffDraft] = useState<Staff[]>(db.staff);
  const [reassignments, setReassignments] = useState<Record<string, string>>({});
  const [logoError, setLogoError] = useState<string>('');

  const [aiEnabled, setAiEnabled] = useState<boolean>(db.ai.enabled);
  const [aiModel, setAiModel] = useState<string>(db.ai.model);
  const aiSectionRef = useRef<HTMLDivElement>(null);

  const initialSnapshot = useMemo(
    () => ({
      cab: db.cab,
      tarif: db.tarif,
      domains: db.domains,
      staff: db.staff,
      aiEnabled: db.ai.enabled,
      aiModel: db.ai.model,
    }),
    [db.cab, db.tarif, db.domains, db.staff, db.ai.enabled, db.ai.model],
  );

  useEffect(() => {
    if (open) {
      setCab({...db.cab});
      setTarif(db.tarif);
      setDomainsDraft(db.domains.map((d) => ({...d})));
      setStaffDraft(db.staff.map((s) => ({...s})));
      setReassignments({});
      setLogoError('');
      setAiEnabled(db.ai.enabled);
      setAiModel(db.ai.model || 'gemini-2.5-flash');
      if (focusAiSection) {
        window.setTimeout(() => {
          aiSectionRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
        }, 60);
      }
    }
  }, [open, focusAiSection, db.cab, db.tarif, db.domains, db.staff, db.ai.enabled, db.ai.model]);

  const isDirty = useMemo(() => {
    return (
      JSON.stringify({
        cab,
        tarif,
        domains: domainsDraft,
        staff: staffDraft,
        aiEnabled,
        aiModel,
      }) !== JSON.stringify(initialSnapshot) || Object.keys(reassignments).length > 0
    );
  }, [cab, tarif, domainsDraft, staffDraft, reassignments, aiEnabled, aiModel, initialSnapshot]);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoError('');
    const resized = await resizeLogoFile(file);
    if (!resized) {
      setLogoError(t('logoInvalidError'));
      return;
    }
    setCab((prev) => ({...prev, logo: resized}));
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const nextDomains: ExpertiseDomain[] = domainsDraft
      .slice(0, 30)
      .map((d) => ({
        id: d.id,
        name: d.name.trim().slice(0, 120),
        tarif:
          typeof d.tarif === 'number' && Number.isFinite(d.tarif) && d.tarif >= 0
            ? Math.min(1_000_000, Math.round(d.tarif))
            : Math.max(0, Math.round(Number(tarif) || 0)),
      }))
      .filter((d) => d.name.length > 0);
    const domainMap = new Map(nextDomains.map((d) => [d.id, d]));

    const nextStaff: Staff[] = staffDraft
      .slice(0, 20)
      .map((s, idx): Staff => {
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
      })
      .filter((s) => s.nom.length > 0);

    const cleanDur = String(Math.min(120, Math.max(10, Math.round(Number(cab.dur) || 30))));
    const cleanTarif = Math.max(0, Math.round(Number(tarif) || 0));

    onSave(
      {
        ...cab,
        nom: cab.nom.slice(0, 200),
        pra: cab.pra.slice(0, 200),
        addr: cab.addr.slice(0, 300),
        tel: cab.tel.slice(0, 200),
        legal: cab.legal.slice(0, 300),
        dur: cleanDur,
        wamsg: cab.wamsg.slice(0, 500),
      },
      cleanTarif,
      nextDomains,
      nextStaff,
      {
        enabled: aiEnabled,
        model: aiModel.trim().slice(0, 120) || 'gemini-2.5-flash',
      },
      reassignments,
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('settingsTitle')}
      t={t}
      isDirty={isDirty}
      maxWidthClass="max-w-2xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenPin}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
            >
              <Lock className="h-4 w-4" />
              <span>
                {t('accessCode')} ({hasPin ? '●' : '○'})
              </span>
            </button>
            <button
              type="button"
              onClick={onLoadDemo}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
            >
              <Database className="h-4 w-4" />
              <span>{t('loadDemo')}</span>
            </button>
          </div>
          <div className="flex items-center gap-2 ms-auto">
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium whitespace-nowrap"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={() => handleSubmit()}
              className="min-h-10 rounded-lg accent-bg px-4 py-2 text-sm font-semibold whitespace-nowrap"
            >
              {t('save')}
            </button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="cab-nom" className="block text-sm font-medium mb-1">
              {t('cabNameLabel')}
            </label>
            <input
              id="cab-nom"
              type="text"
              maxLength={200}
              value={cab.nom}
              onChange={(e) => setCab((prev) => ({...prev, nom: e.target.value}))}
              className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="cab-pra" className="block text-sm font-medium mb-1">
              {t('cabPraLabel')}
            </label>
            <input
              id="cab-pra"
              type="text"
              maxLength={200}
              value={cab.pra}
              onChange={(e) => setCab((prev) => ({...prev, pra: e.target.value}))}
              className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="cab-addr" className="block text-sm font-medium mb-1">
              {t('cabAddrLabel')}
            </label>
            <input
              id="cab-addr"
              type="text"
              maxLength={300}
              value={cab.addr}
              onChange={(e) => setCab((prev) => ({...prev, addr: e.target.value}))}
              className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="cab-tel" className="block text-sm font-medium mb-1">
              {t('cabTelLabel')}
            </label>
            <input
              id="cab-tel"
              type="tel"
              maxLength={200}
              value={cab.tel}
              onChange={(e) => setCab((prev) => ({...prev, tel: e.target.value}))}
              className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="cab-legal" className="block text-sm font-medium mb-1">
              {t('cabLegalLabel')}
            </label>
            <input
              id="cab-legal"
              type="text"
              maxLength={300}
              value={cab.legal}
              onChange={(e) => setCab((prev) => ({...prev, legal: e.target.value}))}
              className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <div className="text-sm font-medium mb-2">{t('therapistsTitle')}</div>
            <StaffCrudPanel
              domains={domainsDraft}
              staff={staffDraft}
              patients={db.patients}
              rdv={db.rdv}
              defaultTarif={Math.max(0, Math.round(Number(tarif) || 0))}
              lang={db.lang}
              reassignments={reassignments}
              onChange={(nextDomains, nextStaff, nextReassign) => {
                setDomainsDraft(nextDomains);
                setStaffDraft(nextStaff);
                setReassignments(nextReassign);
              }}
              t={t}
            />
          </div>

          <div>
            <label htmlFor="cab-tarif" className="block text-sm font-medium mb-1">
              {t('defaultTarifLabel')}
            </label>
            <input
              id="cab-tarif"
              type="number"
              min={0}
              step={100}
              value={tarif}
              onChange={(e) => setTarif(Number(e.target.value))}
              className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="cab-dur" className="block text-sm font-medium mb-1">
              {t('defaultSlotDurLabel')}
            </label>
            <input
              id="cab-dur"
              type="number"
              min={10}
              max={120}
              value={cab.dur}
              onChange={(e) => setCab((prev) => ({...prev, dur: e.target.value}))}
              className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="cab-h1" className="block text-sm font-medium mb-1">
              {t('openHourLabel')}
            </label>
            <input
              id="cab-h1"
              type="time"
              value={cab.h1}
              onChange={(e) => setCab((prev) => ({...prev, h1: e.target.value}))}
              className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="cab-h2" className="block text-sm font-medium mb-1">
              {t('closeHourLabel')}
            </label>
            <input
              id="cab-h2"
              type="time"
              value={cab.h2}
              onChange={(e) => setCab((prev) => ({...prev, h2: e.target.value}))}
              className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="cab-color" className="block text-sm font-medium mb-1">
              {t('accentColorLabel')}
            </label>
            <div className="flex items-center gap-3">
              <input
                id="cab-color"
                type="color"
                value={cab.color || '#2b4c9b'}
                onChange={(e) => setCab((prev) => ({...prev, color: e.target.value}))}
                className="h-11 w-16 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent p-1 cursor-pointer"
              />
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {cab.color || '#2b4c9b'}
              </span>
            </div>
          </div>

          <div>
            <span className="block text-sm font-medium mb-1">{t('logoLabel')}</span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                <Upload className="h-4 w-4" />
                <span>{t('add')}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleLogoChange}
                  className="sr-only"
                />
              </label>
              {cab.logo && (
                <>
                  <img
                    src={cab.logo}
                    alt={cab.nom || 'Logo'}
                    className="h-10 w-10 rounded object-contain border border-slate-200 dark:border-slate-700 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setCab((prev) => ({...prev, logo: ''}))}
                    className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{t('removeLogoBtn')}</span>
                  </button>
                </>
              )}
            </div>
            {logoError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{logoError}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="cab-wamsg" className="block text-sm font-medium mb-1">
              {t('waTemplateLabel')}
            </label>
            <textarea
              id="cab-wamsg"
              rows={2}
              maxLength={500}
              value={cab.wamsg}
              onChange={(e) => setCab((prev) => ({...prev, wamsg: e.target.value}))}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('waTemplateHelp')}</p>
          </div>
        </div>

        {/* Intelligence artificielle */}
        <section
          ref={aiSectionRef}
          className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 accent-text" />
              <h3 className="text-base font-bold">{t('aiSettingsSectionTitle')}</h3>
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={aiEnabled}
                onChange={(e) => setAiEnabled(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span>{t('aiMasterSwitchLabel')}</span>
            </label>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {t('aiPrivacyNotice')}
          </p>

          <div>
            <label htmlFor="ai-model" className="block text-sm font-medium mb-1">
              {t('aiModelLabel')}
            </label>
            <input
              id="ai-model"
              type="text"
              maxLength={120}
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              className="w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono"
            />
          </div>

          {/* Send log (last 50 entries) */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">
                {t('aiSendLogTitle')} ({db.aiLog.length})
              </span>
              {db.aiLog.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAiLog}
                  className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                >
                  {t('aiClearLogBtn')}
                </button>
              )}
            </div>
            {db.aiLog.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('aiNoSendLog')}</p>
            ) : (
              <div className="max-h-40 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {db.aiLog.map((entry) => (
                  <div key={entry.id} className="py-1.5 space-y-0.5">
                    <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400 tabular-nums">
                      <span>{new Date(entry.ts).toLocaleString(db.lang === 'ar' ? 'ar-DZ-u-nu-latn' : 'fr-FR')}</span>
                      <span className="font-mono">{entry.model}</span>
                    </div>
                    <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-slate-700 dark:text-slate-300">
                      {JSON.stringify(entry.params)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </form>
    </Modal>
  );
};
