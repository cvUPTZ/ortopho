import React from 'react';
import type {TranslationKey} from '../i18n';
import type {DB} from '../types';
import {formatCurrency, getStaffDomain, getStaffTarif, groupStaffBySpecialite} from '../utils';

interface TherapistSelectOptionsProps {
  db: DB;
  t: (key: TranslationKey) => string;
  showPrice?: boolean;
  domainId?: string;
}

export const TherapistSelectOptions: React.FC<TherapistSelectOptionsProps> = ({
  db,
  t,
  showPrice = true,
  domainId,
}) => {
  const filteredStaff = domainId
    ? db.staff.filter((st) => getStaffDomain(db.domains, st)?.id === domainId)
    : db.staff;

  const groups = groupStaffBySpecialite(
    filteredStaff,
    db.lang,
    t('noDomainLabel'),
    db.domains,
  );
  const hasAnySpecialty = groups.some((g) => g.hasSpecialty);

  if (domainId || !hasAnySpecialty) {
    return (
      <>
        {filteredStaff.map((st) => (
          <option key={st.id} value={st.id}>
            {showPrice
              ? `${st.nom} — ${formatCurrency(getStaffTarif(db, st.id), db.lang)}`
              : st.nom}
          </option>
        ))}
      </>
    );
  }

  return (
    <>
      {groups.map((grp) => {
        const groupLabel =
          showPrice && grp.tarif !== null
            ? `${grp.label} — ${formatCurrency(grp.tarif, db.lang)}`
            : grp.label;
        return (
          <optgroup key={grp.key} label={groupLabel}>
            {grp.members.map((st) => (
              <option key={st.id} value={st.id}>
                {showPrice
                  ? `${st.nom} — ${formatCurrency(getStaffTarif(db, st.id), db.lang)}`
                  : st.nom}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
};
