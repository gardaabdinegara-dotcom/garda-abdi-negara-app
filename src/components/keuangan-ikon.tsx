// Ikon garis khusus Keuangan (24×24, mengikuti warna teks). Dipakai komponen server dan klien.
const PATHS = {
  in: "M12 4v12M6.5 10.5 12 16l5.5-5.5M5 20h14",
  out: "M12 20V8M6.5 13.5 12 8l5.5 5.5M5 4h14",
  swap: "M4 8h15l-3.5-3.5M20 16H5l3.5 3.5",
  cash: "M4.5 6h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM14.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM6 9.5v.01M18 14.5v.01",
  bank: "M3 9.5 12 4l9 5.5M5 10v8M9.7 10v8M14.3 10v8M19 10v8M3 20.5h18",
  wallet: "M4 7.5V6a2 2 0 0 1 2-2h11v3.5M5.5 7.5h13A2.5 2.5 0 0 1 21 10v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18v-8a2.5 2.5 0 0 1 2.5-2.5zM16 14h2",
  cal: "M5.5 5h13A2.5 2.5 0 0 1 21 7.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-11A2.5 2.5 0 0 1 5.5 5zM3 10h18M8 3v4M16 3v4",
  clip: "m20 11.5-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7.1",
  x: "M6 6l12 12M18 6 6 18",
  back: "M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7zM12.5 9.5l5 5M17.5 9.5l-5 5",
  left: "m15 6-6 6 6 6",
  right: "m9 6 6 6-6 6",
  down: "m6 9 6 6 6-6",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4",
  dl: "M12 3v12M7 10l5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  book: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6",
  chart: "M3 20h18M6 16v-5M11 16V6M16 16v-8",
  scale: "M12 4v16M7 20h10M4 7h16M6.5 7 3.5 13a3 3 0 0 0 6 0zM17.5 7l-3 6a3 3 0 0 0 6 0z",
  ok: "m5 12.5 4.5 4.5L19 7.5",
  tag: "M3 12V4h8l10 10-8 8zM9 8.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z",
  lock: "M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM8 11V7.5a4 4 0 0 1 8 0V11",
  slider: "M4 7h10M18 7h2M4 17h4M12 17h8M18 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM12 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z",
  save: "M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM8 4v5h7V4M8 20v-6h8v6",
  fix: "M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4",
} as const;

export type KgIconName = keyof typeof PATHS;

export function KgIcon({ name, size, className }: { name: KgIconName; size?: "s" | "l"; className?: string }) {
  const classes = ["kg-i", size ? `kg-i-${size}` : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <svg className={classes} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Ikon akun menurut jenisnya. */
export const accountIcon = (jenis: string): KgIconName => (jenis === "KAS" ? "cash" : jenis === "BANK" ? "bank" : "wallet");
