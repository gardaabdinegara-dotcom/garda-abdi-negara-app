// Format tampilan layar Presensi. Tanpa impor server, jadi aman dipakai komponen klien.

/** "15:30" → "15.30" (penulisan jam bahasa Indonesia). */
export const fmtTime = (time: string) => time.replace(":", ".");

export const timeRange = (start: string, end: string) => `${fmtTime(start)}–${fmtTime(end)}`;

const PREFIX = /^(m|muh|moh|mhd|muhammad|muhamad|mohammad|mohamad|mochammad|mochamad|moch)\.?$/i;

/** Nama panggilan untuk kartu siswa: kata pertama, kecuali singkatan seperti "Muh." */
export function shortName(nama: string): string {
  const parts = nama.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1 && PREFIX.test(parts[0]!)) return parts[1]!;
  return parts[0] ?? nama;
}

/** Jam lokal lembaga sekarang, HH:MM. */
export function nowTime(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
}

/** "HH:MM" → menit sejak tengah malam. */
export function toMinutesSafe(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Tambah menit pada "HH:MM". */
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = Math.max(0, Math.min(23 * 60 + 59, (h ?? 0) * 60 + (m ?? 0) + minutes));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const dateOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
};

const dayDiff = (a: string, b: string) => Math.round((dateOf(a).getTime() - dateOf(b).getTime()) / 86_400_000);

/** "Sel, 17 Nov" */
export function shortDate(iso: string): string {
  const date = dateOf(iso);
  const weekday = new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" }).format(date).replace(".", "");
  const month = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" }).format(date).replace(".", "");
  return `${weekday}, ${date.getUTCDate()} ${month}`;
}

/** "Selasa, 17 Nov" */
export function longDay(iso: string): string {
  const date = dateOf(iso);
  const weekday = new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: "UTC" }).format(date);
  const month = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" }).format(date).replace(".", "");
  return `${weekday}, ${date.getUTCDate()} ${month}`;
}

/** "Hari ini", "Besok", "Kemarin", atau "Rab, 18 Nov". */
export function relativeDay(iso: string, today: string): string {
  const diff = dayDiff(iso, today);
  if (diff === 0) return "Hari ini";
  if (diff === 1) return "Besok";
  if (diff === -1) return "Kemarin";
  return shortDate(iso);
}

/** Nama hari singkat untuk lencana jadwal: "Besok", "Kamis", atau "24 Nov". */
export function dayBadge(iso: string, today: string): string {
  const diff = dayDiff(iso, today);
  if (diff === 0) return "Hari ini";
  if (diff === 1) return "Besok";
  if (diff > 1 && diff < 7) return new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: "UTC" }).format(dateOf(iso));
  const month = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" }).format(dateOf(iso)).replace(".", "");
  return `${dateOf(iso).getUTCDate()} ${month}`;
}

export function shiftDay(date: string, days: number): string {
  const d = dateOf(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function shiftMonth(periode: string, months: number): string {
  const [y, m] = periode.split("-").map(Number);
  const d = new Date(Date.UTC(y!, (m ?? 1) - 1 + months, 1));
  return d.toISOString().slice(0, 7);
}

/** "November" atau "November 2025" bila beda tahun dengan acuan. */
export function monthName(periode: string, reference?: string): string {
  const [y, m] = periode.split("-").map(Number);
  const sameYear = reference ? reference.slice(0, 4) === periode.slice(0, 4) : false;
  return new Intl.DateTimeFormat("id-ID", { month: "long", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" }).format(new Date(Date.UTC(y!, (m ?? 1) - 1, 1)));
}

export const pct = (value: number | null | undefined) => (value === null || value === undefined ? "-" : `${Math.round(value)}%`);
