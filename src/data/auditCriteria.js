// The audit form's five inspection criteria, in the order they are numbered on the
// paper form, with the icon and one-line meaning the Audit tab shows beside each.
//
// This is the only part of the audit dataset that is NOT loaded from Postgres, for the
// same reason src/data/trades.js is not: it is the instrument, not the results. There is
// nothing confidential in the fact that a warehouse audit scores record accuracy at 40%,
// and having the order and the wording in the repo means a scorecard with a criterion
// missing from a given month's data still renders in the right place.
//
// The WEIGHTS ARE NOT HERE ON PURPOSE. They come from the data (audit_ratings.weight),
// because the weighting is the form's to change: if procurement reweights the
// instrument, the app should follow the new workbook rather than contradict it with a
// number hard-coded a year earlier.
export const CRITERIA_ORDER = {
  'Inventory Record Accuracy': 1,
  'Warehouse Organization': 2,
  'Warehouse Planning': 3,
  'Warehouse Operations': 4,
  'Warehouse Security and Safety': 5,
}

export const CRITERIA_META = {
  'Inventory Record Accuracy': {
    short: 'Record Accuracy',
    icon: 'grade',
    note: 'Does SAP agree with what is on the floor — the cycle count.',
  },
  'Warehouse Organization': {
    short: 'Organization',
    icon: 'users',
    note: 'Org chart, manpower and the warehouse team’s training.',
  },
  'Warehouse Planning': {
    short: 'Planning',
    icon: 'map',
    note: 'Warehouse layout, racking and the two-week inventory plan.',
  },
  'Warehouse Operations': {
    short: 'Operations',
    icon: 'transfer',
    note: 'Receipt, issuance, storage handling and scrap — the daily work.',
  },
  'Warehouse Security and Safety': {
    short: 'Security & Safety',
    icon: 'alert',
    note: 'Access control, lighting, housekeeping, chemicals and the evacuation plan.',
  },
}

/** Criteria the Findings page can be split by — Record Accuracy has its own page. */
export const FINDING_CRITERIA = [
  'Warehouse Operations',
  'Warehouse Organization',
  'Warehouse Planning',
  'Warehouse Security and Safety',
]
