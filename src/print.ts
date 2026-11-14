import type {DB, PrintDoc} from './types';

const STYLE_ID = 'ortho-dynamic-print-page';

export function setPrintPageOrientation(landscape: boolean): void {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = landscape
    ? '@page { size: A4 landscape; margin: 12mm; }'
    : '@page { size: A4 portrait; margin: 15mm; }';
}

export function assignReceiptNumberIfNeeded(
  db: DB,
  rdvId: string,
): {nextDb: DB; assigned: boolean} {
  const target = db.rdv.find((r) => r.id === rdvId);
  if (!target || target.rno) {
    return {nextDb: db, assigned: false};
  }
  const year = (target.date || new Date().toISOString().slice(0, 10)).slice(0, 4);
  const rno = `R-${year}-${String(db.rseq).padStart(4, '0')}`;
  const nextDb: DB = {
    ...db,
    rseq: db.rseq + 1,
    rdv: db.rdv.map((r) => (r.id === rdvId ? {...r, rno} : r)),
  };
  return {nextDb, assigned: true};
}

export function triggerBrowserPrint(doc: PrintDoc): void {
  setPrintPageOrientation(doc.kind === 'planning');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
    });
  });
}
