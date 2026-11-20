// Validasi isian form modul akademik. Angka dibiarkan berupa teks; rentangnya diperiksa di domain.
import { z } from "zod";
import {
  daysBetween,
  normalizeSessionTypeName,
  PRESENSI_TYPE_NAME_MAX,
  SELF_MARKS,
  SERIES_MAX_DAYS,
  SESSION_STATUS,
  SESSION_TYPES,
  TEACHER_MARKS,
  TEST_CATEGORIES,
} from "./akademik";

const text = (max: number, label: string) => z.string().trim().max(max, `${label} maksimal ${max} karakter.`).default("");
const required = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} wajib diisi.`).max(max, `${label} maksimal ${max} karakter.`);
const date = (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} tidak valid.`);
const time = (label: string) => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label} tidak valid (JJ:MM).`);
const id = (label: string) => required(1, 120, label);
export const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periode tidak valid.");

export const sessionInput = z.object({
  sesi_id: z.string().default(""),
  nama: required(2, 80, "Nama kegiatan"),
  tanggal: date("Tanggal"),
  jam_mulai: time("Jam mulai"),
  jam_selesai: time("Jam selesai"),
  jenis: id("Bidang"),
  /** Kosong = semua siswa aktif (tanpa kelas). */
  kelas_id: z.string().trim().max(120).default(""),
  pengajar_id: z.string().default(""),
});

/** Sesi berulang: isian sesi biasa ditambah hari terpilih (1 = Senin … 7 = Minggu) dan tanggal akhir. */
export const sessionSeriesInput = sessionInput
  .extend({
    sesi_id: z.literal("", { message: "Ulangi hanya untuk sesi baru." }).default(""),
    sampai: date("Sampai tanggal"),
    hari: z
      .array(z.coerce.number().int().min(1, "Hari tidak valid.").max(7, "Hari tidak valid."))
      .min(1, "Pilih minimal satu hari.")
      .max(7)
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  })
  .superRefine((value, issue) => {
    if (value.sampai < value.tanggal) issue.addIssue({ code: "custom", path: ["sampai"], message: "Sampai tanggal harus sama dengan atau sesudah tanggal mulai." });
    const span = daysBetween(value.tanggal, value.sampai);
    if (span > SERIES_MAX_DAYS) issue.addIssue({ code: "custom", path: ["sampai"], message: `Rentang paling panjang ${SERIES_MAX_DAYS} hari (sekitar 3 bulan).` });
  });

/** Ubah atau hapus sesi dalam seri: hanya sesi ini, atau sesi ini dan berikutnya. */
export const sessionScope = z.enum(["satu", "seri"]).catch("satu");
export const sessionDeleteInput = z.object({ sesi_id: id("Sesi"), lingkup: sessionScope.default("satu") });

export const sessionTypeInput = z.object({
  nama: z.string().transform(normalizeSessionTypeName).pipe(required(1, PRESENSI_TYPE_NAME_MAX, "Nama bidang")),
});

const typeValue = z.string().trim().min(1, "Bidang tidak valid.").max(PRESENSI_TYPE_NAME_MAX);
export const sessionTypeChangeInput = z.discriminatedUnion("aksi", [
  z.object({
    value: typeValue,
    aksi: z.literal("ubah"),
    nama: z.string().transform(normalizeSessionTypeName).pipe(required(1, PRESENSI_TYPE_NAME_MAX, "Nama bidang")),
    tampil: z.boolean().default(false),
  }),
  z.object({ value: typeValue, aksi: z.enum(["naik", "turun", "tampil", "sembunyi"]) }),
]);

export const sessionStatusInput = z.object({ sesi_id: id("Sesi"), status: z.enum(SESSION_STATUS) });

export const teacherMarkInput = z.object({
  sesi_id: id("Sesi"),
  siswa_id: id("Siswa"),
  status: z.enum(TEACHER_MARKS, { message: "Pilih status presensi." }),
  waktu: z.union([z.literal(""), time("Jam masuk")]).default(""),
  catatan: text(500, "Keterangan"),
});

export const selfMarkInput = z.object({
  sesi_id: id("Sesi"),
  status_diajukan: z.enum(SELF_MARKS, { message: "Pilih hadir, izin, atau sakit." }),
  catatan: text(500, "Keterangan"),
});

export const approveInput = z.object({ sesi_id: id("Sesi"), siswa_id: z.string().default("") });

const score = z.string().trim().max(12).default("");
export const testInput = z.object({
  tes_id: z.string().default(""),
  siswa_id: id("Siswa"),
  kategori: z.enum(TEST_CATEGORIES, { message: "Pilih bidang tes." }),
  komponen: z.string().default(""),
  nama_tes: text(80, "Nama tes"),
  tanggal: date("Tanggal tes"),
  twk: score,
  tiu: score,
  tkp: score,
  skor: score,
  hasil_mentah: score,
  protokol: text(120, "Protokol"),
  catatan: text(500, "Catatan"),
});

export const healthInput = z.object({
  siswa_id: id("Siswa"),
  tanggal: date("Tanggal ukur"),
  tinggi_cm: score,
  berat_kg: score,
  sistolik: score,
  diastolik: score,
  catatan: text(500, "Catatan pemeriksa"),
});

export const assignmentInput = z.object({
  tugas_id: z.string().default(""),
  nama: required(2, 120, "Nama tugas"),
  bidang: z.enum(SESSION_TYPES, { message: "Pilih bidang." }),
  kelas_id: z.string().default(""),
  tenggat: date("Tenggat"),
  instruksi: text(1000, "Instruksi"),
  aktif: z.boolean().default(true),
});

export const submissionInput = z.object({
  tugas_id: id("Tugas"),
  tautan: required(8, 500, "Tautan hasil"),
  catatan: text(500, "Catatan"),
});

export const reviewInput = z.object({
  tugas_id: id("Tugas"),
  siswa_id: id("Siswa"),
  status: z.enum(["DIPERIKSA", "DIKEMBALIKAN"]),
  nilai: score,
  catatan: text(500, "Catatan"),
});

export const reportNoteInput = z.object({ siswa_id: id("Siswa"), periode: periodSchema, catatan: text(1000, "Catatan rapor") });
export const reportActionInput = z.object({ siswa_id: id("Siswa"), periode: periodSchema, catatan: text(1000, "Catatan rapor") });
