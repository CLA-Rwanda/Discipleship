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
