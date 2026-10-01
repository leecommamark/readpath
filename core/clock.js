// clock.js — days as integers (patch plan 3, Phase 1).
//
// Everything in core/ takes `today` as a day number: the local calendar date
// as days since 1970-01-01. Intervals, due dates and "met today" are whole
// days, so no core module ever sees a time of day, and a test can run a
// year in a loop by counting.
//
// This is the ONLY file in core/ that may touch `Date` (a test checks), and
// only at the edge: the app asks `systemDay()` once per composition.

const MS_PER_DAY = 86400000;

// The calendar date `date` falls on, as a day number. With `offsetMinutes`
// (minutes east of UTC) the answer does not depend on the machine's zone,
// which is what the tests use; without it, the local zone decides.
export function dayOf(date, offsetMinutes) {
  if (offsetMinutes === undefined) {
    return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(),
                               date.getDate()) / MS_PER_DAY);
  }
  return Math.floor((date.getTime() + offsetMinutes * 60000) / MS_PER_DAY);
}

// A day number back to "YYYY-MM-DD", for reports and summaries.
export function isoOf(day) {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

// "YYYY-MM-DD" to a day number.
export function dayOfIso(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`not a date: ${iso}`);
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

// Today in the local zone. The app's one read of the real clock.
export function systemDay() {
  return dayOf(new Date());
}
