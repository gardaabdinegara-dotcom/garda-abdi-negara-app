import { z } from "zod";
import { ENROLLMENT_STATUS, FINANCE_ACCESS, GENDERS, LINK_TYPES, ROLES, TARGETS } from "./types";

const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, min > 0 ? `${label} wajib diisi.` : undefined)
    .max(max, `${label} maksimal ${max} karakter.`);

const optionalText = (max: number, label: string) => z.string().trim().max(max, `${label} maksimal ${max} karakter.`).default("");

const isoDate = (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} tidak valid.`);
const optionalDate = (label: string) => z.union([z.literal(""), isoDate(label)]).default("");

/** Menormalkan nomor WhatsApp Indonesia menjadi format 62xxxxxxxxxx; kosong diizinkan. */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

const phone = (label: string) =>
  z
    .string()
    .trim()
    .default("")
    .transform(normalizePhone)
    .refine((v) => v === "" || /^62\d{8,13}$/.test(v), `${label} tidak valid. Contoh: 0812 3456 7890.`);

const int = (label: string, min: number, max: number) =>
  z.coerce.number({ message: `${label} harus angka.` }).int(`${label} harus bilangan bulat.`).min(min, `${label} minimal ${min}.`).max(max, `${label} maksimal ${max}.`);

export const PROGRAM_TARGETS = [...TARGETS, "Umum"] as const;

export const settingsInput = z
  .object({
    nama_lembaga: trimmed(2, 80, "Nama lembaga"),
    lokasi: optionalText(120, "Lokasi"),
    zona_waktu: z.enum(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"], { message: "Zona waktu tidak dikenal." }),
    toleransi_terlambat_menit: int("Toleransi terlambat", 0, 120),
    kapasitas_siswa: int("Kapasitas siswa", 1, 1000),
    predikat_a: int("Batas predikat A", 1, 100),
    predikat_b: int("Batas predikat B", 1, 100),
    predikat_c: int("Batas predikat C", 1, 100),
    acuan_twk: int("Acuan TWK", 0, 150),
    acuan_tiu: int("Acuan TIU", 0, 175),
    acuan_tkp: int("Acuan TKP", 0, 225),
    presensi_qr_langsung_sah: z.boolean().default(false),
    samapta_kop: trimmed(2, 80, "Kop blangko").default("BIMBEL GARDA ABDI NEGARA"),
    samapta_tempat: trimmed(2, 80, "Tempat tes").default("Lap. Syekh Yusuf"),
    samapta_kota: trimmed(2, 40, "Kota penandatanganan").default("Gowa"),
    samapta_ttd_jabatan: trimmed(2, 60, "Jabatan penanda tangan").default("Koordinator Materi"),
    samapta_ttd_nama: trimmed(2, 80, "Nama penanda tangan").default("ADAM HIDI"),
    samapta_baik_sekali: int("Batas Baik Sekali", 1, 100).default(81),
    samapta_baik: int("Batas Baik", 1, 100).default(61),
    samapta_cukup: int("Batas Cukup", 1, 100).default(41),
  })
  .refine((v) => v.predikat_a > v.predikat_b && v.predikat_b > v.predikat_c, {
    message: "Batas predikat harus menurun: A > B > C.",
    path: ["predikat_b"],
  })
  .refine((v) => v.samapta_baik_sekali > v.samapta_baik && v.samapta_baik > v.samapta_cukup, {
    message: "Batas klasifikasi harus menurun: Baik Sekali > Baik > Cukup.",
    path: ["samapta_baik"],
  });
export type SettingsInput = z.infer<typeof settingsInput>;

export const programInput = z.object({
  program_id: z.string().default(""),
  nama_program: trimmed(2, 80, "Nama program"),
  target_seleksi: z.enum(PROGRAM_TARGETS, { message: "Pilih target seleksi." }),
  aktif: z.boolean().default(true),
});
export type ProgramInput = z.infer<typeof programInput>;

export const classInput = z.object({
  kelas_id: z.string().default(""),
  nama_kelas: trimmed(2, 60, "Nama kelas"),
  program_id: trimmed(1, 80, "Program"),
  angkatan: optionalText(20, "Angkatan"),
  aktif: z.boolean().default(true),
});
export type ClassInput = z.infer<typeof classInput>;

export const studentInput = z.object({
  nama: trimmed(2, 80, "Nama siswa"),
  jenis_kelamin: z.enum(GENDERS, { message: "Pilih jenis kelamin." }),
  tanggal_lahir: optionalDate("Tanggal lahir"),
  tempat_lahir: optionalText(60, "Tempat lahir"),
  asal_sekolah: optionalText(80, "Asal sekolah"),
  jalur_target: z.enum(TARGETS, { message: "Pilih jalur target." }),
  no_wa: phone("Nomor WA siswa"),
  nama_wali: optionalText(80, "Nama wali"),
  no_wa_wali: phone("Nomor WA wali"),
  tanggal_daftar: optionalDate("Tanggal daftar"),
  catatan: optionalText(500, "Catatan"),
});
export type StudentInput = z.infer<typeof studentInput>;

export const enrollmentInput = z.object({
  siswa_id: trimmed(1, 80, "Siswa"),
  program_id: trimmed(1, 80, "Program"),
  kelas_id: trimmed(1, 80, "Kelas"),
  tanggal_mulai: optionalDate("Tanggal mulai"),
});
export type EnrollmentInput = z.infer<typeof enrollmentInput>;

export const enrollmentStatusInput = z.object({
  pendaftaran_id: trimmed(1, 80, "Pendaftaran"),
  status: z.enum(ENROLLMENT_STATUS, { message: "Status tidak dikenal." }),
  tanggal_selesai: optionalDate("Tanggal selesai"),
});
export type EnrollmentStatusInput = z.infer<typeof enrollmentStatusInput>;

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username minimal 3 karakter.")
  .max(32, "Username maksimal 32 karakter.")
  .regex(/^[a-z0-9][a-z0-9._-]*$/, "Username hanya boleh huruf kecil, angka, titik, garis bawah, atau tanda hubung.");

export const userCreateInput = z.object({
  username: usernameSchema,
  nama: trimmed(2, 80, "Nama"),
  peran: z.enum(ROLES, { message: "Pilih peran." }),
  akses_keuangan: z.enum(FINANCE_ACCESS).default("TIDAK"),
});
export type UserCreateInput = z.infer<typeof userCreateInput>;

export const userUpdateInput = z.object({
  user_id: trimmed(1, 80, "Akun"),
  nama: trimmed(2, 80, "Nama"),
  peran: z.enum(ROLES, { message: "Pilih peran." }),
  aktif: z.boolean(),
  akses_keuangan: z.enum(FINANCE_ACCESS).default("TIDAK"),
});
export type UserUpdateInput = z.infer<typeof userUpdateInput>;

export const linkInput = z.object({
  user_id: trimmed(1, 80, "Akun"),
  jenis: z.enum(LINK_TYPES),
  siswa_id: z.string().trim().default(""),
  kelas_id: z.string().trim().default(""),
});
export type LinkInput = z.infer<typeof linkInput>;

/** Akun yang bisa membuka keuangan wajib memakai password lebih panjang (PRD bagian 7). */
/**
 * Aturan password akun owner/admin. Atas permintaan owner (17 Nov 2026) tidak ada syarat panjang, huruf/angka,
 * atau larangan memuat username; perlindungan tetap dari kunci sementara setelah 5 kali salah masuk.
 * Parameter username dan financeCapable dipertahankan agar pemanggil lama tidak berubah.
 */
export function passwordProblem(password: string, _username = "", _financeCapable = false): string | null {
  if (!password) return "Password wajib diisi.";
  if (password.length > 128) return "Password maksimal 128 karakter.";
  return null;
}

/** Mengubah hasil zod menjadi pesan per kolom. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    out[key] ??= issue.message;
  }
  return out;
}
