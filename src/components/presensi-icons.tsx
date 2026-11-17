// Ikon garis kecil khusus layar Presensi (24×24, mengikuti warna teks). Dipakai komponen server dan klien.

const PATHS = {
  qr: "M3.5 3.5h6.5v6.5H3.5zM14 3.5h6.5v6.5H14zM3.5 14h6.5v6.5H3.5zM14 14h3v3M20.5 14v.01M14 20.5h3M20.5 17.5v3h-.5",
  plus: "M12 5v14M5 12h14",
  x: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  ok: "M5 12.5l4.5 4.5L19 7.5",
  okc: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.4l2.8 2.8 5.4-5.7",
  dotsv: "M12 5.5h.01M12 12h.01M12 18.5h.01",
  cal: "M6.5 5h11a3 3 0 0 1 3 3v9.5a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM3.5 10h17M8 3v4M16 3v4",
  dl: "M12 4v11M7 10.5l5 5 5-5M5 20h14",
  scan: "M4 8.5v-2A2.5 2.5 0 0 1 6.5 4h2M15.5 4h2A2.5 2.5 0 0 1 20 6.5v2M20 15.5v2a2.5 2.5 0 0 1-2.5 2.5h-2M8.5 20h-2A2.5 2.5 0 0 1 4 17.5v-2M4 12h16",
  note: "M7 3.5h7l5 5v12H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2zM14 3.5v5h5M9 13h6M9 16.5h4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2",
  lock: "M7.5 11h9a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 18.5v-5A2.5 2.5 0 0 1 7.5 11zM8 11V7.5a4 4 0 0 1 8 0V11",
  refresh: "M20 11.5A8 8 0 0 0 5.6 7M4 4v4h4M4 12.5A8 8 0 0 0 18.4 17M20 20v-4h-4",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  left: "M14.5 6l-6 6 6 6",
  right: "M9.5 6l6 6-6 6",
  edit: "M4 20h4L19 9l-4-4L4 16z",
  trash: "M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5l1-12.5M9.5 7V4.5h5V7",
  ban: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8",
  play: "M8 5.5v13l10.5-6.5z",
  undo: "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  users: "M9 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 5a3.5 3.5 0 0 1 0 7M18 14.2a6 6 0 0 1 3.5 5.8",
} as const;

export type PrIconName = keyof typeof PATHS;

export function PrIcon({ name, size = "md" }: { name: PrIconName; size?: "sm" | "md" | "lg" }) {
  return (
    <svg className={`pr-ic pr-ic-${size}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} strokeWidth={name === "dotsv" ? 3 : undefined} />
    </svg>
  );
}
