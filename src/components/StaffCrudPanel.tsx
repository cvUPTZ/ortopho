import React, {useMemo, useState} from 'react';
import {Check, Crown, Pencil, Plus, Trash2, X} from 'lucide-react';
import type {TranslationKey} from '../i18n';
import {makeId} from '../storage';
import type {Patient, Rdv, Staff} from '../types';

interface StaffCrudPanelProps {
  staff: Staff[];
  patients: Patient[];
  rdv: Rdv[];
  reassignments: Record<string, string>;
  onChange: (nextStaff: Staff[], nextReassignments: Record<string, string>) => void;
  t: (key: TranslationKey) => string;
}

export const StaffCrudPanel: React.FC<StaffCrudPanelProps> = ({
  staff,
  patients,
  rdv,
  reassignments,
  onChange,
  t,
}) => {
  const [newName, setNewName] = useState('');
  const [newSpec, setNewSpec] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSpec, setEditSpec] = useState('');

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<string>('');

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

  const atLimit = staff.length >= 20;

  const handleAdd = () => {
    const cleanName = newName.trim().slice(0, 200);
    if (!cleanName || atLimit) return;
    const cleanSpec = newSpec.trim().slice(0, 120);
    const created: Staff = {
      id: makeId('st'),
      nom: cleanName,
      role: staff.length === 0 ? 'main' : 'th',
      ...(cleanSpec ? {specialite: cleanSpec} : {}),
    };
    onChange([...staff, created], reassignments);
    setNewName('');
    setNewSpec('');
  };

  const startEdit = (st: Staff) => {
    setDeletingId(null);
    setEditingId(st.id);
    setEditName(st.nom);
    setEditSpec(st.specialite ?? '');
  };

  const commitEdit = () => {
    if (!editingId) return;
    const cleanName = editName.trim().slice(0, 200);
    if (!cleanName) return;
    const cleanSpec = editSpec.trim().slice(0, 120);
    const nextStaff = staff.map((s) =>
      s.id === editingId
        ? {
            id: s.id,
            nom: cleanName,
            role: s.role,
            ...(cleanSpec ? {specialite: cleanSpec} : {}),
          }
        : s,
    );
    onChange(nextStaff, reassignments);
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
    onChange(reordered, reassignments);
  };

  const startDelete = (st: Staff) => {
    setEditingId(null);
    setDeletingId(st.id);
    const firstRemaining = staff.find((s) => s.id !== st.id);
    setReassignTarget(firstRemaining?.id ?? '');
  };

  const confirmDelete = (stId: string) => {
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

    onChange(normalized, nextReassign);
    setDeletingId(null);
  };

  return (
    <div className="space-y-3">
      {/* Add therapist row */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          maxLength={200}
          value={newName}
          disabled={atLimit}
          placeholder={t('therapistNamePlaceholder')}
          aria-label={t('therapistNameLabel')}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          className="flex-1 min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm disabled:opacity-50"
        />
        <input
          type="text"
          maxLength={120}
          value={newSpec}
          disabled={atLimit}
          placeholder={t('therapistSpecialtyPlaceholder')}
          aria-label={t('therapistSpecialtyPlaceholder')}
          onChange={(e) => setNewSpec(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          className="sm:w-44 min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm disabled:opacity-50"
        />
        <button
          type="button"
          disabled={atLimit || !newName.trim()}
          onClick={handleAdd}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg accent-bg px-3.5 py-2 text-sm font-semibold whitespace-nowrap disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          <span>{t('addTherapistBtn')}</span>
        </button>
      </div>

      {atLimit && (
        <p className="text-xs text-amber-700 dark:text-amber-300">{t('maxTherapistsReached')}</p>
      )}

      {/* List */}
      {staff.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center text-xs text-slate-500 dark:text-slate-400">
          {t('noTherapistsYet')}
        </div>
      ) : (
        <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40">
          {staff.map((st, idx) => {
            const isMain = idx === 0 || st.role === 'main';
            const counts = countsByStaff.get(st.id) ?? {patients: 0, sessions: 0};
            const isEditing = editingId === st.id;
            const isDeleting = deletingId === st.id;
            const remainingChoices = staff.filter((other) => other.id !== st.id);

            return (
              <div key={st.id} className="p-3 space-y-2">
                {isEditing ? (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      maxLength={200}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitEdit();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingId(null);
                        }
                      }}
                      className="flex-1 min-h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm"
                    />
                    <input
                      type="text"
                      maxLength={120}
                      value={editSpec}
                      placeholder={t('therapistSpecialtyPlaceholder')}
                      onChange={(e) => setEditSpec(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitEdit();
                        }
                      }}
                      className="sm:w-40 min-h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm"
                    />
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        type="button"
                        onClick={commitEdit}
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
                        {st.specialite && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            · {st.specialite}
                          </span>
                        )}
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
                        onClick={() => startEdit(st)}
                        title={t('editBtn')}
                        aria-label={t('editBtn')}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => startDelete(st)}
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
                        <label htmlFor={`reassign-${st.id}`} className="text-red-800 dark:text-red-200">
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
                        onClick={() => confirmDelete(st.id)}
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
    </div>
  );
};
