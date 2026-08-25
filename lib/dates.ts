/**
 * Snaps a timestamp back to the Sunday of its own week (Sunday = day 0),
 * preserving the original time-of-day. A timestamp that already falls on a
 * Sunday is returned unchanged. Week boundary is UTC, consistent with the
 * rest of the app's date bucketing.
 */
export function snapToSunday(iso: string): string {
  const d = new Date(iso);
  const day = d.getUTCDay();
  if (day === 0) return d.toISOString();
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString();
}

export function getSundaysBetween(startDate: string, endDate?: string): string[] {
  if (!startDate) return [];
  const sundays: string[] = [];
  const cursor = new Date(startDate + "T12:00:00Z");
  // Snap forward to the next Sunday if start date isn't already one
  const day = cursor.getUTCDay();
  if (day !== 0) cursor.setUTCDate(cursor.getUTCDate() + (7 - day));
  const end = endDate ? new Date(endDate + "T23:59:59Z") : new Date();
  while (cursor <= end) {
    sundays.push(cursor.toISOString().split("T")[0]);
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return sundays;
}
