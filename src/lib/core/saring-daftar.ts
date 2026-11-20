// Penyaringan daftar siswa dan daftar akun. Dipakai di server (saringan dari alamat ?q=&status=) dan di klien
// (menyaring sambil mengetik), jadi hasil keduanya selalu sama.

export const SARING_SISWA = ["semua", "aktif", "nonaktif", "TNI", "Polri", "Kedinasan"] as const;
export type SaringSiswa = (typeof SARING_SISWA)[number];

export const SARING_SISWA_LABEL: Record<SaringSiswa, string> = { semua: "Semua", aktif: "Aktif", nonaktif: "Nonaktif", TNI: "TNI", Polri: "Polri", Kedinasan: "Kedinasan" };

const JALUR_SARING: readonly SaringSiswa[] = ["TNI", "Polri", "Kedinasan"];
export const isSaringJalur = (s: SaringSiswa) => JALUR_SARING.includes(s);

export interface SiswaCari {
  nama: string;
  kode: string;
  /** Nomor tersimpan (62…) siswa dan wali. */
  noWa: string;
  noWaWali: string;
  aktif: boolean;
  jalur: string;
}

/** Nama, kode GAN, atau paling sedikit 3 angka nomor WA siswa/wali (awalan 0 diabaikan). */
export function cocokCari(s: Pick<SiswaCari, "nama" | "kode" | "noWa" | "noWaWali">, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const digits = needle.replace(/\D/g, "").replace(/^0/, "");
  return s.nama.toLowerCase().includes(needle) || s.kode.toLowerCase().includes(needle) || (digits.length >= 3 && (s.noWa.includes(digits) || s.noWaWali.includes(digits)));
}

export function cocokSaring(s: Pick<SiswaCari, "aktif" | "jalur">, saring: SaringSiswa): boolean {
  if (saring === "aktif") return s.aktif;
  if (saring === "nonaktif") return !s.aktif;
  if (isSaringJalur(saring)) return s.jalur === saring;
  return true;
}

/** Saringan dari alamat: ?jalur=TNI|Polri|Kedinasan, ?status=aktif|nonaktif|semua. Bawaan: semua. */
export function saringDariAlamat(params: Record<string, string | string[] | undefined>): SaringSiswa {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const jalur = JALUR_SARING.find((j) => j.toLowerCase() === one(params.jalur).toLowerCase());
  if (jalur) return jalur;
  const status = one(params.status).toLowerCase();
  return status === "aktif" || status === "nonaktif" ? status : "semua";
}

export function alamatSaring(saring: SaringSiswa, q: string): string {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (isSaringJalur(saring)) params.set("jalur", saring);
  else if (saring !== "semua") params.set("status", saring);
  const text = params.toString();
  return text ? `/siswa?${text}` : "/siswa";
}

// ---------------------------------------------------------------- Akun

export interface AkunCari {
  nama: string;
  username: string;
  peran: string;
  /** Hanya untuk akun siswa: sudah/belum membuat PIN. Null untuk peran lain. */
  pin: "aktif" | "belum" | null;
}

/** Saringan akun: "semua", kode peran (OWNER, SISWA, …), atau "pin-belum". */
export type SaringAkun = string;

export function cocokAkun(a: AkunCari, q: string, saring: SaringAkun): boolean {
  const needle = q.trim().toLowerCase().replace(/^@/, "");
  if (needle && !a.nama.toLowerCase().includes(needle) && !a.username.toLowerCase().includes(needle)) return false;
  if (saring === "pin-belum") return a.pin === "belum";
  if (saring !== "semua") return a.peran === saring;
  return true;
}
