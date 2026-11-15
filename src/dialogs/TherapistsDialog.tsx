import React, {useEffect, useMemo, useState} from 'react';
import {Modal} from '../components/Modal';
import {StaffCrudPanel} from '../components/StaffCrudPanel';
import type {TranslationKey} from '../i18n';
import type {DB, ExpertiseDomain, Staff} from '../types';

interface TherapistsDialogProps {
  open: boolean;
  db: DB;
  onClose: () => void;
  onSave: (
    nextDomains: ExpertiseDomain[],
    nextStaff: Staff[],
    reassignments: Record<string, string>,
  ) => void;
  t: (key: TranslationKey) => string;
}

export const TherapistsDialog: React.FC<TherapistsDialogProps> = ({
  open,
  db,
  onClose,
  onSave,
  t,
}) => {
  const [domainsDraft, setDomainsDraft] = useState<ExpertiseDomain[]>(db.domains);
  const [staffDraft, setStaffDraft] = useState<Staff[]>(db.staff);
  const [reassignments, setReassignments] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setDomainsDraft(db.domains.map((d) => ({...d})));
      setStaffDraft(db.staff.map((s) => ({...s})));
      setReassignments({});
    }
  }, [open, db.domains, db.staff]);

  const isDirty = useMemo(() => {
    return (
      JSON.stringify(domainsDraft) !== JSON.stringify(db.domains) ||
      JSON.stringify(staffDraft) !== JSON.stringify(db.staff) ||
      Object.keys(reassignments).length > 0
    );
  }, [domainsDraft, db.domains, staffDraft, db.staff, reassignments]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('therapistsTitle')}
      t={t}
      isDirty={isDirty}
      maxWidthClass="max-w-2xl"
      footer={
        <div className="flex items-center justify-end gap-2 ms-auto">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium whitespace-nowrap"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={() => onSave(domainsDraft, staffDraft, reassignments)}
            className="min-h-10 rounded-lg accent-bg px-4 py-2 text-sm font-semibold whitespace-nowrap"
          >
            {t('save')}
          </button>
        </div>
      }
    >
      <StaffCrudPanel
        domains={domainsDraft}
        staff={staffDraft}
        patients={db.patients}
        rdv={db.rdv}
        defaultTarif={db.tarif}
        lang={db.lang}
        reassignments={reassignments}
        onChange={(nextDomains, nextStaff, nextReassign) => {
          setDomainsDraft(nextDomains);
          setStaffDraft(nextStaff);
          setReassignments(nextReassign);
        }}
        t={t}
      />
    </Modal>
  );
};
