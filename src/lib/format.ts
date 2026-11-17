// Format tampilan berbahasa Indonesia. Tanggal disimpan sebagai teks YYYY-MM-DD.

const ZONE = "Asia/Jakarta";

export function todayISO(timeZone = ZONE, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function formatDate(value: string, style: "short" | "long" = "short"): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value || "-";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    day: "numeric",
    month: style === "long" ? "long" : "short",
    year: "numeric",
  }).format(date);
}

export function formatToday(timeZone = ZONE, now = new Date()): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
}

export function greeting(timeZone = ZONE, now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now));
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}

/** 6281234567890 → 0812-3456-7890 */
export function formatPhone(value: string): string {
  if (!value) return "-";
  const local = value.startsWith("62") ? `0${value.slice(2)}` : value;
  return local.replace(/^(\d{4})(\d{4})(\d+)$/, "$1-$2-$3");
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase() || "?";
}
