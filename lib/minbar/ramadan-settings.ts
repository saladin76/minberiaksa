/**
 * Ramadan scheduling settings (dashboard → جدولة رمضان → الإعدادات). Kept in
 * the RecurringPageSettings collection under the key "ramadan", beside the
 * recurring page's own "public" document, with the same revision guard.
 *
 * `startDate` is 1 Ramadan as a civil date. Plans store Ramadan DAY numbers
 * (lib/donations/ramadan-schedule.ts), so moving this date after the moon
 * sighting moves every plan's charges with it.
 */
export type RamadanSettings = {
  enabled: boolean;
  hijriYear: number;
  startDate: string; // YYYY-MM-DD
  startConfirmed: boolean;
  amounts: number[]; // USD
  byCurrency: Record<string, number[]>;
  projectIds: string[]; // ordered
  doubleLast10: boolean;
};

export const DEFAULT_RAMADAN_SETTINGS: RamadanSettings = {
  enabled: false,
  hijriYear: 1448,
  startDate: "2027-02-08",
  startConfirmed: false,
  amounts: [20, 50, 75, 100, 200, 300],
  byCurrency: {},
  projectIds: [],
  doubleLast10: true,
};
