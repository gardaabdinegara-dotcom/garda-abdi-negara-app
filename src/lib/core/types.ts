import { bool, num, str } from "../data/rows";
import type { Row } from "../data/types";

export const ROLES = ["OWNER", "ADMIN", "PENGAJAR", "SISWA", "WALI"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  PENGAJAR: "Pengajar",
  SISWA: "Siswa",
  WALI: "Wali",
};

export const FINANCE_ACCESS = ["TIDAK", "LIHAT", "CATAT"] as const;
export type FinanceAccess = (typeof FINANCE_ACCESS)[number];
export const FINANCE_ACCESS_LABEL: Record<FinanceAccess, string> = {
  TIDAK: "Tidak ada",
  LIHAT: "Lihat",
  CATAT: "Catat",
};

export const LINK_TYPES = ["SISWA", "WALI", "PENGAJAR_KELAS"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export const ENROLLMENT_STATUS = ["AKTIF", "CUTI", "SELESAI", "BERHENTI"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUS)[number];
export const ENROLLMENT_LABEL: Record<EnrollmentStatus, string> = {
  AKTIF: "Aktif",
  CUTI: "Cuti",
  SELESAI: "Selesai",
  BERHENTI: "Berhenti",
};

export const TARGETS = ["TNI", "Polri", "Kedinasan"] as const;
export type Target = (typeof TARGETS)[number];

export const GENDERS = ["L", "P"] as const;
export type Gender = (typeof GENDERS)[number];

export interface User {
  user_id: string;
  username: string;
  nama: string;
  peran: Role;
  password_hash: string;
  wajib_ganti_password: boolean;
  versi_otorisasi: number;
  akses_keuangan: FinanceAccess;
  aktif: boolean;
  terakhir_masuk: string;
  /** Terisi bila akun dihapus (disembunyikan dari aplikasi, baris tetap di spreadsheet). */
  dihapus_pada: string;
}

export interface AccountLink {
  tautan_id: string;
  user_id: string;
  jenis: LinkType;
  siswa_id: string;
  kelas_id: string;
  aktif: boolean;
}

export interface Student {
  siswa_id: string;
  kode_siswa: string;
  nama: string;
  jenis_kelamin: Gender | "";
  tanggal_lahir: string;
  jalur_target: Target | "";
  no_wa: string;
  nama_wali: string;
  no_wa_wali: string;
  tanggal_daftar: string;
  aktif: boolean;
  catatan: string;
  tempat_lahir: string;
  asal_sekolah: string;
  /** Terisi bila siswa dihapus (disembunyikan dari aplikasi, baris tetap di spreadsheet). */
  dihapus_pada: string;
}

export interface Program {
  program_id: string;
  nama_program: string;
  target_seleksi: string;
  aktif: boolean;
}

export interface ClassGroup {
  kelas_id: string;
  nama_kelas: string;
  program_id: string;
  angkatan: string;
  aktif: boolean;
}

export interface Enrollment {
  pendaftaran_id: string;
  siswa_id: string;
  program_id: string;
  kelas_id: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  status: EnrollmentStatus;
}

const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  (values as readonly string[]).includes(String(value)) ? (value as T) : fallback;

export const toUser = (row: Row): User => ({
  user_id: str(row.user_id),
  username: str(row.username),
  nama: str(row.nama),
  peran: oneOf(ROLES, row.peran, "SISWA"),
  password_hash: str(row.password_hash),
  wajib_ganti_password: bool(row.wajib_ganti_password),
  versi_otorisasi: num(row.versi_otorisasi, 1),
  akses_keuangan: oneOf(FINANCE_ACCESS, row.akses_keuangan, "TIDAK"),
  aktif: bool(row.aktif),
  terakhir_masuk: str(row.terakhir_masuk),
  dihapus_pada: str(row.dihapus_pada),
});

export const toLink = (row: Row): AccountLink => ({
  tautan_id: str(row.tautan_id),
  user_id: str(row.user_id),
  jenis: oneOf(LINK_TYPES, row.jenis, "SISWA"),
  siswa_id: str(row.siswa_id),
  kelas_id: str(row.kelas_id),
  aktif: bool(row.aktif),
});

export const toStudent = (row: Row): Student => ({
  siswa_id: str(row.siswa_id),
  kode_siswa: str(row.kode_siswa),
  nama: str(row.nama),
  jenis_kelamin: row.jenis_kelamin === "L" || row.jenis_kelamin === "P" ? row.jenis_kelamin : "",
  tanggal_lahir: str(row.tanggal_lahir),
  jalur_target: (TARGETS as readonly string[]).includes(str(row.jalur_target)) ? (row.jalur_target as Target) : "",
  no_wa: str(row.no_wa),
  nama_wali: str(row.nama_wali),
  no_wa_wali: str(row.no_wa_wali),
  tanggal_daftar: str(row.tanggal_daftar),
  aktif: bool(row.aktif),
  catatan: str(row.catatan),
  tempat_lahir: str(row.tempat_lahir),
  asal_sekolah: str(row.asal_sekolah),
  dihapus_pada: str(row.dihapus_pada),
});

export const toProgram = (row: Row): Program => ({
  program_id: str(row.program_id),
  nama_program: str(row.nama_program),
  target_seleksi: str(row.target_seleksi),
  aktif: bool(row.aktif),
});

export const toClass = (row: Row): ClassGroup => ({
  kelas_id: str(row.kelas_id),
  nama_kelas: str(row.nama_kelas),
  program_id: str(row.program_id),
  angkatan: str(row.angkatan),
  aktif: bool(row.aktif),
});

export const toEnrollment = (row: Row): Enrollment => ({
  pendaftaran_id: str(row.pendaftaran_id),
  siswa_id: str(row.siswa_id),
  program_id: str(row.program_id),
  kelas_id: str(row.kelas_id),
  tanggal_mulai: str(row.tanggal_mulai),
  tanggal_selesai: str(row.tanggal_selesai),
  status: oneOf(ENROLLMENT_STATUS, row.status, "AKTIF"),
});

/** Pengguna yang sedang masuk beserta tautannya. */
export interface Actor {
  user: User;
  links: AccountLink[];
}

export const linkedStudentIds = (actor: Actor, jenis: "SISWA" | "WALI") =>
  actor.links.filter((link) => link.aktif && link.jenis === jenis).map((link) => link.siswa_id);

export const taughtClassIds = (actor: Actor) =>
  actor.links.filter((link) => link.aktif && link.jenis === "PENGAJAR_KELAS").map((link) => link.kelas_id);
