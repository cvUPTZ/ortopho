import React from 'react';
import type {TranslationKey} from '../i18n';
import type {DB} from '../types';
import {formatCurrency, getStaffTarif, groupStaffBySpecialite} from '../utils';

interface TherapistSelectOptionsProps {
  db: DB;
  t: (key: TranslationKey) => string;
  showPrice?: boolean;
}

export const TherapistSelectOptions: React.FC<TherapistSelectOptionsProps> = ({
  db,
  t,
  showPrice = true,
}) => {
  const groups = groupStaffBySpecialite(db.staff, db.lang, t('noSpecialtyLabel'));
  const hasAnySpecialty = groups.some((g) => g.hasSpecialty);

  if (!hasAnySpecialty) {
    return (
      <>
        {db.staff.map((st) => (
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
      {groups.map((grp) => (
        <optgroup key={grp.key} label={grp.label}>
          {grp.members.map((st) => (
            <option key={st.id} value={st.id}>
              {showPrice
                ? `${st.nom} — ${formatCurrency(getStaffTarif(db, st.id), db.lang)}`
                : st.nom}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
};
