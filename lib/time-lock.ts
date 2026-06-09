export interface TimeLock {
  id: string;
  label: string;
  day_of_week: number; // 0=Sunday … 6=Saturday
  start_time: string;  // "HH:MM"
  end_time: string;    // "HH:MM"
  timezone: string;
  is_active: boolean;
}

export const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

export function getNowInTimezone(tz: string): { dayOfWeek: number; totalMinutes: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: tz,
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);

  const weekdayMap: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
  };
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sunday";
  // hour12:false can return "24" for midnight on some runtimes
  const hour    = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10) % 24;
  const minute  = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);

  return { dayOfWeek: weekdayMap[weekday] ?? 0, totalMinutes: hour * 60 + minute };
}

export function isWithinWindow(
  lock: Pick<TimeLock, "day_of_week" | "start_time" | "end_time" | "is_active">,
  dayOfWeek: number,
  totalMinutes: number,
): boolean {
  if (!lock.is_active) return false;
  if (lock.day_of_week !== dayOfWeek) return false;
  const [startH, startM] = lock.start_time.split(":").map(Number);
  const [endH,   endM]   = lock.end_time.split(":").map(Number);
  return totalMinutes >= startH * 60 + startM && totalMinutes <= endH * 60 + endM;
}
