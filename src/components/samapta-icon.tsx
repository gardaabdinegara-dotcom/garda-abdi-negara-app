// Ikon garis kecil khusus Tes Samapta (24×24, mengikuti warna teks). Memakai kelas .icon yang sama dengan ikon aplikasi.
const PATHS = {
  close: "M6 6l12 12M18 6L6 18",
  tick: "M5 12.5l4.5 4.5L19 7",
  filter: "M4 5h16l-6 8v6l-4-2v-4z",
  down: "M6 9l6 6 6-6",
  right: "M9 6l6 6-6 6",
  left: "M15 6l-6 6 6 6",
  bksp: "M21 5H9l-6 7 6 7h12zM12 9.5l5 5M17 9.5l-5 5",
  lock: "M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM8 11V7a4 4 0 0 1 8 0v4",
  unlock: "M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM8 11V7a4 4 0 0 1 7.5-2",
  cloud: "M7 18a4 4 0 0 1-.5-8 6 6 0 0 1 11.5 1.5A3.3 3.3 0 0 1 17.5 18zM9.5 13.5l2 2 3.5-3.5",
  alert: "M12 3l9.5 17h-19zM12 10v4M12 17h.01",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  table: "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM3 10h18M9 4v16",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  field: "M4 20V6l8-3 8 3v14M4 12h16M12 3v17",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
} as const;

export type SamIconName = keyof typeof PATHS;

export function SamIcon({ name, className = "icon" }: { name: SamIconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
