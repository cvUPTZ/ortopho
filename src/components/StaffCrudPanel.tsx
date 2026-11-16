import React, {useEffect, useId, useMemo, useState} from 'react';
import {Check, Crown, Layers, Pencil, Plus, Tag, Trash2, X} from 'lucide-react';
import {SPECIALTY_SUGGESTIONS, type TranslationKey} from '../i18n';
import {makeId} from '../storage';
import type {ExpertiseDomain, Lang, Patient, Rdv, Staff} from '../types';
import {formatCurrency, getStaffDomain, groupStaffBySpecialite} from '../utils';

interface StaffCrudPanelProps {
  domains: ExpertiseDomain[];
  staff: Staff[];
  patients: Patient[];
  rdv: Rdv[];
  defaultTarif: number;
  lang: Lang;
  reassignments: Record<string, string>;
  onChange: (
    nextDomains: ExpertiseDomain[],
    nextStaff: Staff[],
    nextReassignments: Record<string, string>,
  ) => void;
  t: (key: TranslationKey) => string;
}

function parseOptionalTarif(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) return undefined;
  return Math.min(1_000_000, Math.round(num));
}

export const StaffCrudPanel: React.FC<StaffCrudPanelProps> = ({
  domains,
  staff,
  patients,
  rdv,
  defaultTarif,
  lang,
  reassignments,
  onChange,
  t,
}) => {
  const datalistId = useId();

  // Domain creation/edit/delete states
  const [newDomName, setNewDomName] = useState('');
  const [newDomTarif, setNewDomTarif] = useState('');
  const [editingDomId, setEditingDomId] = useState<string | null>(null);
  const [editDomName, setEditDomName] = useState('');
  const [editDomTarif, setEditDomTarif] = useState('');
  const [deletingDomId, setDeletingDomId] = useState<string | null>(null);
  const [domReassignTarget, setDomReassignTarget] = useState<string>('');

  // Therapist creation/edit/delete states
  const [newName, setNewName] = useState('');
  const [newDomainId, setNewDomainId] = useState<string>(() => domains[0]?.id ?? '');
  const [newTarif, setNewTarif] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDomainId, setEditDomainId] = useState('');
  const [editTarif, setEditTarif] = useState('');

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<string>('');

  useEffect(() => {
    if (newDomainId && !domains.some((d) => d.id === newDomainId)) {
      setNewDomainId(domains[0]?.id ?? '');
    } else if (!newDomainId && domains.length > 0 && staff.length === 0) {
      setNewDomainId(domains[0].id);
    }
  }, [domains, newDomainId, staff.length]);

  const countsByStaff = useMemo(() => {
    const map = new Map<string, {patients: number; sessions: number}>();
    for (const s of staff) {
      map.set(s.id, {patients: 0, sessions: 0});
    }
    const resolveTh = (thId: string): string => {
      let cur = thId;
      const seen = new Set<string>();
      while (cur && reassignments[cur] !== undefined && !seen.has(cur)) {
        seen.add(cur);
        cur = reassignments[cur];
      }
      return cur;
    };
    for (const p of patients) {
      const effectiveTh = resolveTh(p.th);
      const entry = map.get(effectiveTh);
      if (entry) entry.patients += 1;
    }
    for (const r of rdv) {
      const effectiveTh = resolveTh(r.th);
      const entry = map.get(effectiveTh);
      if (entry) entry.sessions += 1;
    }
    return map;
  }, [staff, patients, rdv, reassignments]);

  const staffCountByDomain = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of domains) {
      map.set(d.id, 0);
    }
    for (const s of staff) {
      const dom = getStaffDomain(domains, s);
      if (dom) {
        map.set(dom.id, (map.get(dom.id) ?? 0) + 1);
      }
    }
    return map;
  }, [domains, staff]);

  const groupedStaff = useMemo(
    () => groupStaffBySpecialite(staff, lang, t('noDomainLabel'), domains),
    [staff, lang, t, domains],
  );

  const atDomLimit = domains.length >= 30;
  const atStaffLimit = staff.length >= 20;

  // Domain handlers
  const handleAddDomain = () => {
    const cleanName = newDomName.trim().slice(0, 120);
    if (!cleanName || atDomLimit) return;
    const parsedTarif = parseOptionalTarif(newDomTarif);
    const created: ExpertiseDomain = {
      id: makeId('dom'),
      name: cleanName,
      tarif: parsedTarif !== undefined ? parsedTarif : defaultTarif,
    };
    const nextDomains = [...domains, created];
    onChange(nextDomains, staff, reassignments);
    setNewDomName('');
    setNewDomTarif('');
    if (!newDomainId) {
      setNewDomainId(created.id);
    }
  };

  const startEditDomain = (dom: ExpertiseDomain) => {
    setDeletingDomId(null);
    setEditingDomId(dom.id);
    setEditDomName(dom.name);
    setEditDomTarif(String(dom.tarif));
  };

  const commitEditDomain = () => {
    if (!editingDomId) return;
    const cleanName = editDomName.trim().slice(0, 120);
    if (!cleanName) return;
    const parsedTarif = parseOptionalTarif(editDomTarif);
    const nextDomains = domains.map((d) =>
      d.id === editingDomId
        ? {
            id: d.id,
            name: cleanName,
            tarif: parsedTarif !== undefined ? parsedTarif : d.tarif,
          }
        : d,
    );
    const nextStaff = staff.map((s) =>
      getStaffDomain(domains, s)?.id === editingDomId
        ? {
            ...s,
            domainId: editingDomId,
            specialite: cleanName,
          }
        : s,
    );
    onChange(nextDomains, nextStaff, reassignments);
    setEditingDomId(null);
  };

  const startDeleteDomain = (dom: ExpertiseDomain) => {
    setEditingDomId(null);
    setDeletingDomId(dom.id);
    const firstRemaining = domains.find((d) => d.id !== dom.id);
    setDomReassignTarget(firstRemaining?.id ?? '');
  };

  const confirmDeleteDomain = (domId: string) => {
    const remainingDomains = domains.filter((d) => d.id !== domId);
    const targetDomain = remainingDomains.find((d) => d.id === domReassignTarget);
    const nextStaff = staff.map((s) => {
      const linked = getStaffDomain(domains, s);
      if (linked?.id !== domId) return s;
      const base: Staff = {
        id: s.id,
        nom: s.nom,
        role: s.role,
        ...(typeof s.tarif === 'number' ? {tarif: s.tarif} : {}),
      };
      if (targetDomain) {
        base.domainId = targetDomain.id;
        base.specialite = targetDomain.name;
      }
      return base;
    });
    if (newDomainId === domId) {
      setNewDomainId(remainingDomains[0]?.id ?? '');
    }
    onChange(remainingDomains, nextStaff, reassignments);
    setDeletingDomId(null);
  };

  // Therapist handlers
  const handleAddStaff = () => {
    const cleanName = newName.trim().slice(0, 200);
    if (!cleanName || atStaffLimit) return;
    const dom = domains.find((d) => d.id === newDomainId);
    const parsedTarif = parseOptionalTarif(newTarif);
    const created: Staff = {
      id: makeId('st'),
      nom: cleanName,
      role: staff.length === 0 ? 'main' : 'th',
      ...(dom ? {domainId: dom.id, specialite: dom.name} : {}),
      ...(parsedTarif !== undefined ? {tarif: parsedTarif} : {}),
    };
    onChange(domains, [...staff, created], reassignments);
    setNewName('');
    setNewTarif('');
  };

  const startEditStaff = (st: Staff) => {
    setDeletingId(null);
    setEditingId(st.id);
    setEditName(st.nom);
    setEditDomainId(getStaffDomain(domains, st)?.id ?? '');
    setEditTarif(typeof st.tarif === 'number' ? String(st.tarif) : '');
  };

  const commitEditStaff = () => {
    if (!editingId) return;
    const cleanName = editName.trim().slice(0, 200);
    if (!cleanName) return;
    const dom = domains.find((d) => d.id === editDomainId);
    const parsedTarif = parseOptionalTarif(editTarif);
    const nextStaff = staff.map((s) =>
      s.id === editingId
        ? {
            id: s.id,
            nom: cleanName,
            role: s.role,
            ...(dom ? {domainId: dom.id, specialite: dom.name} : {}),
            ...(parsedTarif !== undefined ? {tarif: parsedTarif} : {}),
          }
        : s,
    );
    onChange(domains, nextStaff, reassignments);
    setEditingId(null);
  };

  const handleSetMain = (targetId: string) => {
    const target = staff.find((s) => s.id === targetId);
    if (!target) return;
    const others = staff.filter((s) => s.id !== targetId);
    const reordered: Staff[] = [
      {...target, role: 'main'},
      ...others.map((s) => ({...s, role: 'th' as const})),
    ];
    onChange(domains, reordered, reassignments);
  };

  const startDeleteStaff = (st: Staff) => {
    setEditingId(null);
    setDeletingId(st.id);
    const firstRemaining = staff.find((s) => s.id !== st.id);
    setReassignTarget(firstRemaining?.id ?? '');
  };

  const confirmDeleteStaff = (stId: string) => {
    const remaining = staff.filter((s) => s.id !== stId);
    const normalized: Staff[] = remaining.map((s, idx) => ({
      ...s,
      role: idx === 0 ? 'main' : 'th',
    }));

    const nextReassign: Record<string, string> = {...reassignments};
    for (const [oldId, mappedTo] of Object.entries(nextReassign)) {
      if (mappedTo === stId) {
        nextReassign[oldId] = reassignTarget;
      }
    }
    nextReassign[stId] = reassignTarget;

    onChange(domains, normalized, nextReassign);
    setDeletingId(null);
  };

  const mainId = staff[0]?.id ?? '';
  const selectedNewDomain = domains.find((d) => d.id === newDomainId);

  return (
    <div className="space-y-6">
      <datalist id={datalistId}>
        {SPECIALTY_SUGGESTIONS[lang].map((sug) => (
          <option key={sug} value={sug} />
        ))}
      </datalist>

      {/* Section 1: Domains of Expertise & Pricing */}
      <section className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 accent-text" />
            <h3 className="text-sm font-bold">{t('domainsTitle')}</h3>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {domains.length}/30
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <input
            type="text"
            list={datalistId}
            maxLength={120}
            value={newDomName}
            disabled={atDomLimit}
            placeholder={t('domainNamePlaceholder')}
            aria-label={t('domainLabel')}
            onChange={(e) => setNewDomName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddDomain();
              }
            }}
            className="sm:col-span-6 min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm disabled:opacity-50"
          />
          <input
            type="number"
            min={0}
            max={1000000}
            step={1}
            inputMode="numeric"
            value={newDomTarif}
            disabled={atDomLimit}
            placeholder={`${defaultTarif}`}
            aria-label={t('domainTarifLabel')}
            title={t('domainTarifLabel')}
            onChange={(e) => setNewDomTarif(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddDomain();
              }
            }}
            className="sm:col-span-3 min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums disabled:opacity-50"
          />
          <button
            type="button"
            disabled={atDomLimit || !newDomName.trim()}
            onClick={handleAddDomain}
            className="sm:col-span-3 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg accent-bg px-3 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap disabled:opacity-50"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>{t('addDomainBtn')}</span>
          </button>
        </div>

        {atDomLimit && (
          <p className="text-xs text-amber-700 dark:text-amber-300">{t('maxDomainsReached')}</p>
        )}

        {domains.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-950/30 p-3 text-center text-xs text-slate-500 dark:text-slate-400">
            {t('noDomainsYet')}
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 overflow-hidden">
            {domains.map((dom) => {
              const thCount = staffCountByDomain.get(dom.id) ?? 0;
              const isEditing = editingDomId === dom.id;
              const isDeleting = deletingDomId === dom.id;
              const otherDomains = domains.filter((d) => d.id !== dom.id);

              return (
                <div key={dom.id} className="p-2.5 space-y-2">
                  {isEditing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-2">
                      <input
                        type="text"
                        list={datalistId}
                        maxLength={120}
                        value={editDomName}
                        aria-label={t('domainLabel')}
                        onChange={(e) => setEditDomName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitEditDomain();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditingDomId(null);
                          }
                        }}
                        className="sm:col-span-6 min-h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm"
                      />
                      <input
                        type="number"
                        min={0}
                        max={1000000}
                        step={1}
                        inputMode="numeric"
                        value={editDomTarif}
                        aria-label={t('domainTarifLabel')}
                        onChange={(e) => setEditDomTarif(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitEditDomain();
                          }
                        }}
                        className="sm:col-span-4 min-h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm tabular-nums"
                      />
                      <div className="sm:col-span-2 flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={commitEditDomain}
                          disabled={!editDomName.trim()}
                          aria-label={t('save')}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md accent-bg disabled:opacity-50"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDomId(null)}
                          aria-label={t('cancel')}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <Tag className="h-3.5 w-3.5 accent-text shrink-0" />
                        <span className="text-sm font-semibold truncate">{dom.name}</span>
                        <span className="rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
                          {formatCurrency(dom.tarif, lang)}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          {thCount} {t('therapistsCountShort')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditDomain(dom)}
                          title={t('editBtn')}
                          aria-label={t('editBtn')}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => startDeleteDomain(dom)}
                          title={t('delete')}
                          aria-label={t('delete')}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {isDeleting && (
                    <div
                      role="alert"
                      className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-2.5 space-y-2 text-xs"
                    >
                      <div className="font-semibold text-red-800 dark:text-red-200">
                        {t('deleteDomainConfirm')} ({dom.name})
                      </div>
                      {thCount > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <label
                            htmlFor={`reassign-dom-${dom.id}`}
                            className="text-red-800 dark:text-red-200"
                          >
                            {t('reassignDomainToLabel')}
                          </label>
                          <select
                            id={`reassign-dom-${dom.id}`}
                            value={domReassignTarget}
                            onChange={(e) => setDomReassignTarget(e.target.value)}
                            className="min-h-8 rounded border border-red-300 dark:border-red-800 bg-white dark:bg-slate-950 px-2 py-1 text-xs"
                          >
                            <option value="">{t('noDomainLabel')}</option>
                            {otherDomains.map((other) => (
                              <option key={other.id} value={other.id}>
                                {other.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setDeletingDomId(null)}
                          className="min-h-8 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 font-medium"
                        >
                          {t('cancel')}
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmDeleteDomain(dom.id)}
                          className="min-h-8 rounded bg-red-600 px-2.5 py-1 font-semibold text-white hover:bg-red-700"
                        >
                          {t('delete')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 2: Therapists assigned to Domains */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">{t('therapistsSectionTitle')}</h3>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {staff.length}/20
          </span>
        </div>

        {/* Add therapist row */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <input
            type="text"
            maxLength={200}
            value={newName}
            disabled={atStaffLimit}
            placeholder={t('therapistNamePlaceholder')}
            aria-label={t('therapistNameLabel')}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddStaff();
              }
            }}
            className="sm:col-span-5 min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm disabled:opacity-50"
          />
          <select
            value={newDomainId}
            disabled={atStaffLimit}
            aria-label={t('domainLabel')}
            onChange={(e) => setNewDomainId(e.target.value)}
            className="sm:col-span-4 min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="">{t('noDomainLabel')}</option>
            {domains.map((dom) => (
              <option key={dom.id} value={dom.id}>
                {dom.name} — {formatCurrency(dom.tarif, lang)}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            max={1000000}
            step={1}
            inputMode="numeric"
            value={newTarif}
            disabled={atStaffLimit}
            placeholder={`${
              selectedNewDomain
                ? `${t('therapistCustomTarifPlaceholder')} (${selectedNewDomain.tarif})`
                : defaultTarif
            }`}
            aria-label={t('therapistTarifLabel')}
            title={t('therapistTarifLabel')}
            onChange={(e) => setNewTarif(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddStaff();
              }
            }}
            className="sm:col-span-3 min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums disabled:opacity-50"
          />
          <div className="sm:col-span-12 flex justify-end">
            <button
              type="button"
              disabled={atStaffLimit || !newName.trim()}
              onClick={handleAddStaff}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg accent-bg px-3.5 py-2 text-sm font-semibold whitespace-nowrap disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span>{t('addTherapistBtn')}</span>
            </button>
          </div>
        </div>

        {atStaffLimit && (
          <p className="text-xs text-amber-700 dark:text-amber-300">{t('maxTherapistsReached')}</p>
        )}

        {/* List grouped by domain */}
        {staff.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center text-xs text-slate-500 dark:text-slate-400">
            {t('noTherapistsYet')}
          </div>
        ) : (
          <div className="space-y-3">
            {groupedStaff.map((group) => (
              <div
                key={group.key}
                className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40"
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <div className="flex items-center gap-2 min-w-0">
                    <Tag className="h-3.5 w-3.5 accent-text shrink-0" />
                    <span className="truncate">{group.label}</span>
                    {group.tarif !== null && (
                      <span className="rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums shrink-0">
                        {formatCurrency(group.tarif, lang)}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                    {group.members.length}
                  </span>
                </div>

                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {group.members.map((st) => {
                    const isMain = st.id === mainId || st.role === 'main';
                    const counts = countsByStaff.get(st.id) ?? {patients: 0, sessions: 0};
                    const isEditing = editingId === st.id;
                    const isDeleting = deletingId === st.id;
                    const remainingChoices = staff.filter((other) => other.id !== st.id);
                    const linkedDom = getStaffDomain(domains, st);
                    const hasCustomTarif = typeof st.tarif === 'number';
                    const displayedTarif = hasCustomTarif
                      ? st.tarif!
                      : linkedDom
                        ? linkedDom.tarif
                        : defaultTarif;
                    const editDomObj = domains.find((d) => d.id === editDomainId);

                    return (
                      <div key={st.id} className="p-3 space-y-2">
                        {isEditing ? (
                          <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-2">
                            <input
                              type="text"
                              maxLength={200}
                              value={editName}
                              aria-label={t('therapistNameLabel')}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  commitEditStaff();
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  setEditingId(null);
                                }
                              }}
                              className="sm:col-span-4 min-h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm"
                            />
                            <select
                              value={editDomainId}
                              aria-label={t('domainLabel')}
                              onChange={(e) => setEditDomainId(e.target.value)}
                              className="sm:col-span-4 min-h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm"
                            >
                              <option value="">{t('noDomainLabel')}</option>
                              {domains.map((dom) => (
                                <option key={dom.id} value={dom.id}>
                                  {dom.name} — {formatCurrency(dom.tarif, lang)}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={0}
                              max={1000000}
                              step={1}
                              inputMode="numeric"
                              value={editTarif}
                              placeholder={`${editDomObj ? editDomObj.tarif : defaultTarif}`}
                              aria-label={t('therapistTarifLabel')}
                              onChange={(e) => setEditTarif(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  commitEditStaff();
                                }
                              }}
                              className="sm:col-span-2 min-h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm tabular-nums"
                            />
                            <div className="sm:col-span-2 flex items-center gap-1.5 justify-end">
                              <button
                                type="button"
                                onClick={commitEditStaff}
                                disabled={!editName.trim()}
                                aria-label={t('save')}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md accent-bg disabled:opacity-50"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                aria-label={t('cancel')}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold truncate">{st.nom}</span>
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                                    isMain
                                      ? 'accent-bg'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                  }`}
                                >
                                  {isMain ? t('mainTherapistBadge') : t('therapistBadge')}
                                </span>
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                                    hasCustomTarif
                                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                  }`}
                                >
                                  {hasCustomTarif
                                    ? formatCurrency(displayedTarif, lang)
                                    : linkedDom
                                      ? `${t('domainPriceHint')} : ${formatCurrency(displayedTarif, lang)}`
                                      : `${t('defaultTarifHint')} : ${formatCurrency(displayedTarif, lang)}`}
                                </span>
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                                {counts.patients} {t('patientsCountShort')} · {counts.sessions}{' '}
                                {t('sessionsCount')}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {!isMain && (
                                <button
                                  type="button"
                                  onClick={() => handleSetMain(st.id)}
                                  title={t('setMainBtn')}
                                  aria-label={t('setMainBtn')}
                                  className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                                >
                                  <Crown className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">{t('setMainBtn')}</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => startEditStaff(st)}
                                title={t('editBtn')}
                                aria-label={t('editBtn')}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => startDeleteStaff(st)}
                                title={t('delete')}
                                aria-label={t('delete')}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )}

                        {isDeleting && (
                          <div
                            role="alert"
                            className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-2.5 space-y-2 text-xs"
                          >
                            <div className="font-semibold text-red-800 dark:text-red-200">
                              {t('deleteTherapistConfirm')} ({st.nom})
                            </div>
                            {(counts.patients > 0 || counts.sessions > 0) && (
                              <div className="flex flex-wrap items-center gap-2">
                                <label
                                  htmlFor={`reassign-${st.id}`}
                                  className="text-red-800 dark:text-red-200"
                                >
                                  {t('reassignToLabel')}
                                </label>
                                <select
                                  id={`reassign-${st.id}`}
                                  value={reassignTarget}
                                  onChange={(e) => setReassignTarget(e.target.value)}
                                  className="min-h-8 rounded border border-red-300 dark:border-red-800 bg-white dark:bg-slate-950 px-2 py-1 text-xs"
                                >
                                  <option value="">{t('unassigned')}</option>
                                  {remainingChoices.map((other) => (
                                    <option key={other.id} value={other.id}>
                                      {other.nom}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setDeletingId(null)}
                                className="min-h-8 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 font-medium"
                              >
                                {t('cancel')}
                              </button>
                              <button
                                type="button"
                                onClick={() => confirmDeleteStaff(st.id)}
                                className="min-h-8 rounded bg-red-600 px-2.5 py-1 font-semibold text-white hover:bg-red-700"
                              >
                                {t('delete')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
