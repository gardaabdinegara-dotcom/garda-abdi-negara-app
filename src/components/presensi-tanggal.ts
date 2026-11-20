// Format tanggal pendek untuk sesi berulang. Tanpa "use client", jadi bisa dipakai komponen server dan klien.

const dayMonthFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });

/** "2026-11-23" → "23 Nov" */
export const dayMonth = (iso: string) => dayMonthFmt.format(new Date(`${iso}T00:00:00Z`)).replace(".", "");
