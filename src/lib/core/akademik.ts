// Domain akademik Fase 2: sesi, presensi, nilai & tes, tugas, kesehatan, dan rapor.
// Aturan dipindahkan dari aplikasi Presensi lama (src/server/domain.mjs & mutations.mjs) ke struktur tab baru.
import type { OperationContext, OperationOutcome } from "../data/coordinator";
import { bool, num, str } from "../data/rows";
import { DEFAULT_SETTINGS } from "../data/schema";
import { AppError, type Cell, type Row, type Tables } from "../data/types";
import { created, find, forbidden, notFound, replace, rows, updated, upsert } from "./table-ops";
import { linkedStudentIds, taughtClassIds, toClass, toEnrollment, toStudent, toUser, type Actor, type Enrollment, type Student } from "./types";

// ---------------------------------------------------------------- Konstanta

export const SESSION_TYPES = ["AKADEMIK", "SKD", "PSIKOTES", "FISIK"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];
export const SESSION_TYPE_LABEL: Record<SessionType, string> = { AKADEMIK: "Akademik", SKD: "SKD", PSIKOTES: "Psikotes", FISIK: "Fisik" };

const PRESENSI_TYPE_LABEL: Record<string, string> = {
  ...SESSION_TYPE_LABEL,
  KESWA: "KESWA (Kesehatan Jiwa)",
  MI: "MI (Mental Ideologi)",
  ADIRAGA: "ADIRAGA",
};
const PRESENSI_TYPE_PREFIX = "presensi_bidang:";
/** Satu baris Pengaturan berisi JSON susunan bidang: urutan, yang disembunyikan, dan nama tampilan. */
export const PRESENSI_TYPE_ARRANGEMENT_KEY = "presensi_bidang_atur";
export const PRESENSI_TYPE_NAME_MAX = 60;

export interface SessionTypeOption {
  value: string;
  label: string;
}

/** Bidang presensi lengkap dengan susunannya. `value` disimpan di sesi dan tidak pernah berubah. */
export interface SessionTypeEntry extends SessionTypeOption {
  hidden: boolean;
  builtIn: boolean;
}

export interface SessionTypeArrangement {
  urutan: string[];
  sembunyi: string[];
  nama: Record<string, string>;
}

/** Label bidang. Kirim `labels` (dari sessionTypeLabels) agar nama yang diubah owner ikut tampil. */
export function sessionTypeLabel(value: string, labels?: Readonly<Record<string, string>>): string {
  if (labels && Object.hasOwn(labels, value)) return labels[value]!;
  return Object.hasOwn(PRESENSI_TYPE_LABEL, value) ? PRESENSI_TYPE_LABEL[value]! : value;
}

export const normalizeSessionTypeName = (name: string) => name.normalize("NFC").trim().replace(/\s+/g, " ");
const sessionTypeNameKey = (name: string) => normalizeSessionTypeName(name).toLowerCase();

const validTypeName = (name: string) => Boolean(name) && name.length <= PRESENSI_TYPE_NAME_MAX;

/** Susunan bidang dari Pengaturan. Isian rusak diabaikan sehingga daftar bawaan tetap tampil. */
export function sessionTypeArrangement(t: Tables): SessionTypeArrangement {
  const raw = str((t.Pengaturan ?? []).find((row) => row.key === PRESENSI_TYPE_ARRANGEMENT_KEY)?.value ?? "");
  const out: SessionTypeArrangement = { urutan: [], sembunyi: [], nama: {} };
  if (!raw.trim()) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!parsed || typeof parsed !== "object") return out;
  const value = parsed as Record<string, unknown>;
  const texts = (list: unknown) => (Array.isArray(list) ? [...new Set(list.filter((x): x is string => typeof x === "string"))] : []);
  out.urutan = texts(value.urutan);
  out.sembunyi = texts(value.sembunyi);
  if (value.nama && typeof value.nama === "object" && !Array.isArray(value.nama)) {
    for (const [key, label] of Object.entries(value.nama as Record<string, unknown>)) {
      if (typeof label !== "string") continue;
      const name = normalizeSessionTypeName(label);
      if (validTypeName(name)) out.nama[key] = name;
    }
  }
  return out;
}

/** Bidang bawaan dan tambahan dengan nama asli, sebelum disusun. */
function baseSessionTypes(t: Tables): SessionTypeEntry[] {
  const entries: SessionTypeEntry[] = Object.entries(PRESENSI_TYPE_LABEL).map(([value, label]) => ({ value, label, hidden: false, builtIn: true }));
  const seen = new Set(entries.flatMap(({ value, label }) => [sessionTypeNameKey(value), sessionTypeNameKey(label)]));
  for (const row of t.Pengaturan ?? []) {
    if (!str(row.key).startsWith(PRESENSI_TYPE_PREFIX)) continue;
    const name = normalizeSessionTypeName(str(row.value));
    const key = sessionTypeNameKey(name);
    if (!validTypeName(name) || seen.has(key)) continue;
    seen.add(key);
    // Nama bidang tambahan disimpan di sesi agar riwayat tetap bisa menampilkannya.
    entries.push({ value: name, label: name, hidden: false, builtIn: false });
  }
  return entries;
}

/** Semua bidang (termasuk yang disembunyikan) sesuai urutan, nama tampilan, dan status tampil dari owner. */
export function sessionTypeCatalog(t: Tables): SessionTypeEntry[] {
  const base = baseSessionTypes(t);
  const arrangement = sessionTypeArrangement(t);
  const hidden = new Set(arrangement.sembunyi);
  const rank = new Map(arrangement.urutan.map((value, index) => [value, index]));
  return base
    .map((entry, index) => ({
      ...entry,
      label: Object.hasOwn(arrangement.nama, entry.value) ? arrangement.nama[entry.value]! : entry.label,
      hidden: hidden.has(entry.value),
      index,
    }))
    .sort((a, b) => (rank.get(a.value) ?? rank.size + a.index) - (rank.get(b.value) ?? rank.size + b.index))
    .map(({ index: _index, ...entry }) => entry);
}

/** Pilihan bidang saat membuat atau mengubah sesi: hanya yang tampil, sesuai urutan owner. */
export function sessionTypeOptions(t: Tables): SessionTypeOption[] {
  return sessionTypeCatalog(t)
    .filter((entry) => !entry.hidden)
    .map(({ value, label }) => ({ value, label }));
}

/** Nama tampilan semua bidang, termasuk yang disembunyikan, untuk melabeli sesi lama. */
export function sessionTypeLabels(t: Tables): Record<string, string> {
  return Object.fromEntries(sessionTypeCatalog(t).map(({ value, label }) => [value, label]));
}

/** Nama yang sudah dipakai bidang lain (kode, nama tampilan, dan nama bawaan). */
function takenTypeNames(catalog: readonly SessionTypeEntry[], except = ""): Set<string> {
  return new Set(
    catalog
      .filter((entry) => entry.value !== except)
      .flatMap((entry) => [entry.value, entry.label, sessionTypeLabel(entry.value)])
      .map(sessionTypeNameKey),
  );
}

export const SESSION_STATUS = ["AKAN_DATANG", "AKTIF", "SELESAI", "DIBATALKAN", "DIHAPUS"] as const;
export type SessionStatus = (typeof SESSION_STATUS)[number];
export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  AKAN_DATANG: "Akan datang",
  AKTIF: "Berlangsung",
  SELESAI: "Selesai",
  DIBATALKAN: "Dibatalkan",
  DIHAPUS: "Dihapus",
};
/** Sesi yang dihapus disembunyikan dari semua daftar dan rekap (barisnya tetap di spreadsheet). */
export const liveSession = (s: { status: string }) => s.status !== "DIHAPUS";

/**
 * Sesi yang sudah dibuka (Berlangsung) tetapi lupa ditutup dianggap selesai begitu hari kegiatannya lewat
 * (lewat tengah malam, waktu lembaga). Jadwal, rekap, dan beranda memakai status efektif ini, jadi siswa tanpa catatan
 * dihitung alfa seperti sesi yang ditutup biasa. Pengajuan yang masih menunggu tetap bisa disahkan owner/admin.
 */
export const lupaDitutup = (s: { status: string; tanggal: string }, today: string) => s.status === "AKTIF" && s.tanggal < today;

export function statusEfektif<T extends Session>(s: T, today: string): T {
  return lupaDitutup(s, today) ? { ...s, status: "SELESAI", tutup_otomatis: true } : s;
}

export const ATTENDANCE_STATUS = ["MENUNGGU", "HADIR", "IZIN", "SAKIT", "ALFA", "KOSONG"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[number];
export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  MENUNGGU: "Menunggu",
  HADIR: "Hadir",
  IZIN: "Izin",
  SAKIT: "Sakit",
  ALFA: "Alfa",
  KOSONG: "Belum dicatat",
};
export const TEACHER_MARKS = ["HADIR", "IZIN", "SAKIT", "ALFA", "KOSONG"] as const;
export const SELF_MARKS = ["HADIR", "IZIN", "SAKIT"] as const;
export type SelfMark = (typeof SELF_MARKS)[number];
export const METHOD_LABEL: Record<string, string> = { PENGAJAR: "Pengajar", MANDIRI: "Mandiri", QR: "QR sesi" };

export const TEST_CATEGORIES = ["SKD", "AKADEMIK", "PSIKOTES", "FISIK"] as const;
export type TestCategory = (typeof TEST_CATEGORIES)[number];
export const TEST_CATEGORY_LABEL: Record<TestCategory, string> = { SKD: "SKD", AKADEMIK: "Akademik", PSIKOTES: "Psikotes", FISIK: "Fisik" };

export const COMPONENTS = {
  AKADEMIK: { numerik: "Penalaran Numerik", indonesia: "Bahasa Indonesia", inggris: "Bahasa Inggris", ipu: "Ilmu Pengetahuan Umum" },
  PSIKOTES: { kecerdasan: "Kecerdasan", kecermatan: "Kecermatan", kepribadian: "Kepribadian" },
  FISIK: { lari: "Lari 12 menit", pullup: "Pull-up", situp: "Sit-up", pushup: "Push-up", shuttle: "Shuttle run", chinning: "Chinning" },
} as const;
export type ComponentCategory = keyof typeof COMPONENTS;
export const FITNESS_UNIT: Record<string, string> = { lari: "m", pullup: "kali", situp: "kali", pushup: "kali", shuttle: "detik", chinning: "kali" };
const FITNESS_RAW: Record<string, [number, number]> = { lari: [0, 10000], shuttle: [0.1, 300] };

/** Nilai maksimal SKD (Permenpan); acuan kelulusan latihan diatur di Pengaturan. */
export const SKD_MAX = { twk: 150, tiu: 175, tkp: 225 } as const;
export const SKD_KEYS = ["twk", "tiu", "tkp"] as const;

export const SUBMISSION_STATUS = ["DIKIRIM", "DIPERIKSA", "DIKEMBALIKAN"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUS)[number];
export const SUBMISSION_LABEL: Record<SubmissionStatus, string> = { DIKIRIM: "Menunggu periksa", DIPERIKSA: "Diperiksa", DIKEMBALIKAN: "Dikembalikan" };

/** Batas label kedisiplinan dari persentase kehadiran. */
export const DISCIPLINE = { sangat: 95, baik: 85, cukup: 75 } as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

// ---------------------------------------------------------------- Sesi berulang (tanggal)

/** Batas satu seri: paling banyak 62 sesi dan rentang sekitar tiga bulan. */
export const SERIES_MAX_SESSIONS = 62;
export const SERIES_MAX_DAYS = 92;
/** Hari dalam seminggu, 1 = Senin sampai 7 = Minggu (urutan ISO). */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const WEEKDAY_SHORT: Record<number, string> = { 1: "Sen", 2: "Sel", 3: "Rab", 4: "Kam", 5: "Jum", 6: "Sab", 7: "Min" };
export const WEEKDAY_LONG: Record<number, string> = { 1: "Senin", 2: "Selasa", 3: "Rabu", 4: "Kamis", 5: "Jumat", 6: "Sabtu", 7: "Minggu" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const utcDate = (date: string) => new Date(`${date}T00:00:00Z`);
const validDate = (date: string) => ISO_DATE.test(date) && !Number.isNaN(utcDate(date).getTime()) && utcDate(date).toISOString().slice(0, 10) === date;

/** Hari ISO (1 = Senin, 7 = Minggu) untuk tanggal YYYY-MM-DD. */
export function isoWeekday(date: string): number {
  const day = utcDate(date).getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDays(date: string, days: number): string {
  const d = utcDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const daysBetween = (from: string, to: string) => Math.round((utcDate(to).getTime() - utcDate(from).getTime()) / 86_400_000);

/** Tanggal dari awal sampai akhir (keduanya ikut) yang jatuh pada hari terpilih. Rentang tidak sah = kosong. */
export function seriesDates(start: string, end: string, days: readonly number[]): string[] {
  if (!validDate(start) || !validDate(end) || end < start || daysBetween(start, end) > SERIES_MAX_DAYS) return [];
  const chosen = new Set(days);
  const out: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    if (chosen.has(isoWeekday(date))) out.push(date);
  }
  return out;
}

/** "Senin sampai Sabtu", "Selasa dan Kamis", "Sen, Rab, Jum", atau "Setiap hari". */
export function describeWeekdays(days: readonly number[]): string {
  const list = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (list.length === 0) return "-";
  if (list.length === 7) return "Setiap hari";
  if (list.length === 1) return `Setiap ${WEEKDAY_LONG[list[0]!]}`;
  if (list.length === 2) return `${WEEKDAY_LONG[list[0]!]} dan ${WEEKDAY_LONG[list[1]!]}`;
  const contiguous = list.every((d, i) => i === 0 || d === list[i - 1]! + 1);
  if (contiguous) return `${WEEKDAY_LONG[list[0]!]} sampai ${WEEKDAY_LONG[list[list.length - 1]!]}`;
  return list.map((d) => WEEKDAY_SHORT[d]).join(", ");
}

// ---------------------------------------------------------------- Bentuk data

export interface Session {
  sesi_id: string;
  nama: string;
  tanggal: string;
  jam_mulai: string;
  jam_selesai: string;
  jenis: string;
  kelas_id: string;
  pengajar_id: string;
  status: SessionStatus;
  /** Daftar peserta yang dibekukan saat sesi dibuka; kosong berarti belum dibekukan. */
  peserta_ids: string[];
  /** Sesi yang dibuat sekaligus lewat "Ulangi" berbagi seri_id; kosong = sesi tunggal. */
  seri_id: string;
  /** true bila sesi lupa ditutup dan dianggap selesai karena hari kegiatannya sudah lewat (lihat statusEfektif). */
  tutup_otomatis?: boolean;
}

export interface Attendance {
  presensi_id: string;
  sesi_id: string;
  siswa_id: string;
  status: AttendanceStatus;
  status_diajukan: SelfMark | "";
  metode: string;
  waktu: string;
  terlambat: boolean;
  catatan: string;
  disahkan_oleh: string;
  disahkan_pada: string;
}

export interface TestResult {
  tes_id: string;
  siswa_id: string;
  kategori: TestCategory;
  komponen: string;
  nama_tes: string;
  tanggal: string;
  twk: number | null;
  tiu: number | null;
  tkp: number | null;
  skor: number | null;
  hasil_mentah: number | null;
  protokol: string;
  sumber: string;
  catatan: string;
  pengajar_id: string;
  diarsipkan: boolean;
  created_at: string;
}

export interface Assignment {
  tugas_id: string;
  nama: string;
  bidang: SessionType;
  /** Kosong berarti untuk semua kelas. */
  kelas_id: string;
  tenggat: string;
  instruksi: string;
  pengajar_id: string;
  aktif: boolean;
}

export interface Submission {
  pengumpulan_id: string;
  tugas_id: string;
  siswa_id: string;
  tautan: string;
  catatan: string;
  status: SubmissionStatus;
  nilai: number | null;
  diperiksa_oleh: string;
  updated_at: string;
}

export interface Health {
  ukur_id: string;
  siswa_id: string;
  tanggal: string;
  tinggi_cm: number | null;
  berat_kg: number | null;
  sistolik: number | null;
  diastolik: number | null;
  catatan: string;
  pemeriksa: string;
  created_at: string;
}

export interface ReportRow {
  rapor_id: string;
  siswa_id: string;
  periode: string;
  versi: number;
  status: "DRAF" | "TERBIT";
  catatan: string;
  snapshot: ReportSnapshot | null;
  diterbitkan_oleh: string;
  diterbitkan_pada: string;
}

const oneOf = <T extends string>(values: readonly T[], value: Cell | undefined, fallback: T): T =>
  (values as readonly string[]).includes(str(value)) ? (str(value) as T) : fallback;

export const optNum = (value: Cell | undefined | null): number | null => {
  if (value === "" || value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const toSession = (row: Row): Session => ({
  sesi_id: str(row.sesi_id),
  nama: str(row.nama),
  tanggal: str(row.tanggal),
  jam_mulai: str(row.jam_mulai),
  jam_selesai: str(row.jam_selesai),
  jenis: str(row.jenis).trim() || "AKADEMIK",
  kelas_id: str(row.kelas_id),
  pengajar_id: str(row.pengajar_id),
  status: oneOf(SESSION_STATUS, row.status, "AKAN_DATANG"),
  peserta_ids: str(row.peserta_ids)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
  seri_id: str(row.seri_id).trim(),
});

export const toAttendance = (row: Row): Attendance => ({
  presensi_id: str(row.presensi_id),
  sesi_id: str(row.sesi_id),
  siswa_id: str(row.siswa_id),
  status: oneOf(ATTENDANCE_STATUS, row.status, "KOSONG"),
  status_diajukan: (SELF_MARKS as readonly string[]).includes(str(row.status_diajukan)) ? (str(row.status_diajukan) as SelfMark) : "",
  metode: str(row.metode),
  waktu: str(row.waktu),
  terlambat: bool(row.terlambat),
  catatan: str(row.catatan),
  disahkan_oleh: str(row.disahkan_oleh),
  disahkan_pada: str(row.disahkan_pada),
});

export const toTest = (row: Row): TestResult => ({
  tes_id: str(row.tes_id),
  siswa_id: str(row.siswa_id),
  kategori: oneOf(TEST_CATEGORIES, row.kategori, "SKD"),
  komponen: str(row.komponen),
  nama_tes: str(row.nama_tes),
  tanggal: str(row.tanggal),
  twk: optNum(row.twk),
  tiu: optNum(row.tiu),
  tkp: optNum(row.tkp),
  skor: optNum(row.skor),
  hasil_mentah: optNum(row.hasil_mentah),
  protokol: str(row.protokol),
  sumber: str(row.sumber),
  catatan: str(row.catatan),
  pengajar_id: str(row.pengajar_id),
  diarsipkan: bool(row.diarsipkan),
  created_at: str(row.created_at),
});

export const toAssignment = (row: Row): Assignment => ({
  tugas_id: str(row.tugas_id),
  nama: str(row.nama),
  bidang: oneOf(SESSION_TYPES, row.bidang, "AKADEMIK"),
  kelas_id: str(row.kelas_id),
  tenggat: str(row.tenggat),
  instruksi: str(row.instruksi),
  pengajar_id: str(row.pengajar_id),
  aktif: row.aktif === "" ? true : bool(row.aktif),
});

export const toSubmission = (row: Row): Submission => ({
  pengumpulan_id: str(row.pengumpulan_id),
  tugas_id: str(row.tugas_id),
  siswa_id: str(row.siswa_id),
  tautan: str(row.tautan),
  catatan: str(row.catatan),
  status: oneOf(SUBMISSION_STATUS, row.status, "DIKIRIM"),
  nilai: optNum(row.nilai),
  diperiksa_oleh: str(row.diperiksa_oleh),
  updated_at: str(row.updated_at),
});

export const toHealth = (row: Row): Health => ({
  ukur_id: str(row.ukur_id),
  siswa_id: str(row.siswa_id),
  tanggal: str(row.tanggal),
  tinggi_cm: optNum(row.tinggi_cm),
  berat_kg: optNum(row.berat_kg),
  sistolik: optNum(row.sistolik),
  diastolik: optNum(row.diastolik),
  catatan: str(row.catatan),
  pemeriksa: str(row.pemeriksa),
  created_at: str(row.created_at),
});

export function toReport(row: Row): ReportRow {
  let snapshot: ReportSnapshot | null = null;
  try {
    snapshot = str(row.snapshot_json) ? (JSON.parse(str(row.snapshot_json)) as ReportSnapshot) : null;
  } catch {
    snapshot = null;
  }
  return {
    rapor_id: str(row.rapor_id),
    siswa_id: str(row.siswa_id),
    periode: str(row.periode),
    versi: num(row.versi, 1),
    status: str(row.status) === "TERBIT" ? "TERBIT" : "DRAF",
    catatan: str(row.catatan),
    snapshot,
    diterbitkan_oleh: str(row.diterbitkan_oleh),
    diterbitkan_pada: str(row.diterbitkan_pada),
  };
}

// ---------------------------------------------------------------- Pengaturan & waktu

export interface AcademicSettings {
  nama_lembaga: string;
  lokasi: string;
  zona_waktu: string;
  toleransi: number;
  predikat_a: number;
  predikat_b: number;
  predikat_c: number;
  acuan: { twk: number; tiu: number; tkp: number };
  /** Pengajuan HADIR lewat QR langsung sah tanpa pengesahan pelatih. */
  qr_langsung_sah: boolean;
}

export function academicSettings(t: Tables): AcademicSettings {
  const value = (key: string) => (t.Pengaturan ?? []).find((row) => row.key === key)?.value ?? DEFAULT_SETTINGS[key] ?? "";
  return {
    nama_lembaga: str(value("nama_lembaga")),
    lokasi: str(value("lokasi")),
    zona_waktu: str(value("zona_waktu")) || "Asia/Jakarta",
    toleransi: num(value("toleransi_terlambat_menit"), 10),
    predikat_a: num(value("predikat_a"), 80),
    predikat_b: num(value("predikat_b"), 60),
    predikat_c: num(value("predikat_c"), 40),
    acuan: { twk: num(value("acuan_twk"), 65), tiu: num(value("acuan_tiu"), 80), tkp: num(value("acuan_tkp"), 156) },
    qr_langsung_sah: bool(value("presensi_qr_langsung_sah")) || String(value("presensi_qr_langsung_sah")) === "1",
  };
}

/** Tanggal (YYYY-MM-DD) dan jam (HH:MM) lokal lembaga untuk sebuah waktu ISO. */
export function localClock(timeZone: string, iso: string): { date: string; time: string } {
  const instant = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant);
  return { date, time };
}

export const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

/** Terlambat bila jam masuk melewati jam mulai ditambah toleransi lembaga. */
export const isLate = (time: string, start: string, tolerance: number) => toMinutes(time) > toMinutes(start) + tolerance;

// ---------------------------------------------------------------- Hak akses akademik

const isAdmin = (actor: Actor) => actor.user.peran === "OWNER" || actor.user.peran === "ADMIN";
export const isAcademicStaff = (actor: Actor) => isAdmin(actor) || actor.user.peran === "PENGAJAR";
export const canPublishReport = isAdmin;

export function teachesClass(actor: Actor, kelasId: string): boolean {
  if (isAdmin(actor)) return true;
  return actor.user.peran === "PENGAJAR" && taughtClassIds(actor).includes(kelasId);
}

/** Pengajar hanya boleh mengisi nilai/kesehatan/presensi siswa yang aktif di kelas yang diajarnya. */
export function canTeachStudent(actor: Actor, siswaId: string, enrollments: readonly Enrollment[]): boolean {
  if (isAdmin(actor)) return true;
  if (actor.user.peran !== "PENGAJAR") return false;
  const classes = new Set(taughtClassIds(actor));
  return enrollments.some((e) => e.siswa_id === siswaId && e.status === "AKTIF" && classes.has(e.kelas_id));
}

/** Mengubah status sesi dan mencatat presensi: admin, atau pengajar pemilik sesi. */
export const canManageSession = (actor: Actor, session: Session) =>
  isAdmin(actor) || (actor.user.peran === "PENGAJAR" && session.pengajar_id === actor.user.user_id);

/**
 * Siswa aktif yang terdaftar AKTIF di kelas sesi pada tanggal sesi.
 * Sesi tanpa kelas berlaku untuk semua siswa aktif yang sudah mendaftar pada tanggal itu.
 */
export function eligibleStudents(session: Pick<Session, "kelas_id" | "tanggal">, students: readonly Student[], enrollments: readonly Enrollment[]): string[] {
  if (!session.kelas_id) {
    return students
      .filter((s) => s.aktif && (!s.tanggal_daftar || s.tanggal_daftar <= session.tanggal))
      .sort((a, b) => a.kode_siswa.localeCompare(b.kode_siswa))
      .map((s) => s.siswa_id);
  }
  const active = new Set(students.filter((s) => s.aktif).map((s) => s.siswa_id));
  return [
    ...new Set(
      enrollments
        .filter((e) => e.kelas_id === session.kelas_id && e.status === "AKTIF" && active.has(e.siswa_id) && (!e.tanggal_mulai || e.tanggal_mulai <= session.tanggal))
        .map((e) => e.siswa_id),
    ),
  ];
}

/** Peserta sesi: daftar beku bila sudah dibuka, selain itu dihitung dari pendaftaran saat ini. */
export function participantsOf(session: Session, students: readonly Student[], enrollments: readonly Enrollment[]): string[] {
  return session.peserta_ids.length ? session.peserta_ids : eligibleStudents(session, students, enrollments);
}

/** Sesi yang boleh dilihat pengguna ini. */
export function visibleSession(actor: Actor, session: Session, students: readonly Student[], enrollments: readonly Enrollment[]): boolean {
  if (isAdmin(actor)) return true;
  if (actor.user.peran === "PENGAJAR") return session.pengajar_id === actor.user.user_id || taughtClassIds(actor).includes(session.kelas_id);
  const mine = linkedStudentIds(actor, actor.user.peran === "WALI" ? "WALI" : "SISWA");
  const participants = participantsOf(session, students, enrollments);
  return mine.some((id) => participants.includes(id));
}

// ---------------------------------------------------------------- Pembantu perintah

function numberIn(value: unknown, label: string, min: number, max: number, optional = false): number | null {
  const text = typeof value === "number" ? String(value) : String(value ?? "").trim().replace(",", ".");
  if (text === "") {
    if (optional) return null;
    throw new AppError(`${label} wajib diisi.`);
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new AppError(`${label} harus antara ${min} dan ${max}.`);
  return parsed;
}

const tablesOf = (t: Tables) => ({
  students: rows(t, "Siswa").map(toStudent),
  enrollments: rows(t, "Pendaftaran").map(toEnrollment),
});

function activeStudent(t: Tables, siswaId: string): Student {
  const found = find(t, "Siswa", "siswa_id", siswaId);
  const student = found ? toStudent(found.row) : null;
  if (!student || !student.aktif) throw notFound("Siswa");
  return student;
}

/** Siswa yang boleh diubah datanya oleh staf ini (aktif dan diajar). */
function teachableStudent(t: Tables, actor: Actor, siswaId: string): Student {
  const student = activeStudent(t, siswaId);
  if (!canTeachStudent(actor, siswaId, rows(t, "Pendaftaran").map(toEnrollment))) throw forbidden("Siswa ini bukan siswa di kelas yang Anda ajar.");
  return student;
}

function sessionById(t: Tables, sesiId: string) {
  const found = find(t, "Sesi", "sesi_id", sesiId);
  if (!found) throw notFound("Sesi");
  return { ...found, session: toSession(found.row) };
}

function clock(t: Tables, ctx: OperationContext) {
  const settings = academicSettings(t);
  return { settings, ...localClock(settings.zona_waktu, ctx.now) };
}

/**
 * Menyimpan penutupan otomatis ke spreadsheet: sesi Berlangsung yang tanggalnya sudah lewat menjadi Selesai.
 * Dipanggil di awal perintah yang menulis sesi atau presensi, jadi tidak ada penulisan saat halaman hanya dibuka.
 */
export function tutupSesiLupa(t: Tables, ctx: OperationContext): number {
  if (!t.Sesi) return 0;
  const { date } = clock(t, ctx);
  let n = 0;
  rows(t, "Sesi").forEach((row, index) => {
    if (!lupaDitutup({ status: str(row.status), tanggal: str(row.tanggal) }, date)) return;
    replace(t, "Sesi", index, { ...row, status: "SELESAI", ...updated(ctx) });
    n += 1;
  });
  return n;
}

// ---------------------------------------------------------------- Sesi

export function addSessionType(t: Tables, name: string, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!isAdmin(actor)) throw forbidden();
  const label = normalizeSessionTypeName(name);
  if (!validTypeName(label)) throw new AppError("Nama bidang tidak valid.");
  if (takenTypeNames(sessionTypeCatalog(t)).has(sessionTypeNameKey(label))) {
    throw new AppError("Nama bidang ini sudah ada.");
  }
  const row = { key: `${PRESENSI_TYPE_PREFIX}${ctx.newId("BDG")}`, value: label, ...updated(ctx) };
  rows(t, "Pengaturan").push(row);
  return { entityType: "Pengaturan", entityId: row.key, message: "Bidang presensi ditambahkan.", after: row };
}

export type SessionTypeChange =
  | { value: string; aksi: "ubah"; nama: string; tampil: boolean }
  | { value: string; aksi: "naik" | "turun" | "tampil" | "sembunyi" };

/**
 * Mengubah nama tampilan, urutan, atau status tampil satu bidang.
 * Sesi tetap menyimpan kode bidangnya, jadi riwayat utuh dan ikut tampil dengan nama baru.
 */
export function changeSessionType(t: Tables, input: SessionTypeChange, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!isAdmin(actor)) throw forbidden();
  const catalog = sessionTypeCatalog(t);
  const entry = catalog.find((e) => e.value === input.value);
  if (!entry) throw notFound("Bidang");
  const before = sessionTypeArrangement(t);
  const order = catalog.map((e) => e.value);
  const hidden = new Set(catalog.filter((e) => e.hidden).map((e) => e.value));
  const names = new Map(catalog.filter((e) => e.label !== sessionTypeLabel(e.value)).map((e) => [e.value, e.label]));
  // Nama asli bidang tambahan = kodenya; bidang bawaan memakai label bawaan.
  const original = sessionTypeLabel(entry.value);
  let message: string;

  if (input.aksi === "naik" || input.aksi === "turun") {
    // Bergeser di antara bidang dengan status tampil yang sama (daftar tampil atau daftar tersembunyi).
    const group = order.filter((value) => hidden.has(value) === entry.hidden);
    const at = group.indexOf(entry.value);
    const target = group[input.aksi === "naik" ? at - 1 : at + 1];
    if (!target) return { entityType: "Pengaturan", entityId: PRESENSI_TYPE_ARRANGEMENT_KEY, message: "Urutan bidang tidak berubah." };
    const a = order.indexOf(entry.value);
    const b = order.indexOf(target);
    [order[a], order[b]] = [order[b]!, order[a]!];
    message = "Urutan bidang diperbarui.";
  } else {
    const show = input.aksi === "ubah" ? input.tampil : input.aksi === "tampil";
    if (input.aksi === "ubah") {
      const label = normalizeSessionTypeName(input.nama);
      if (!validTypeName(label)) throw new AppError("Nama bidang wajib diisi, maksimal 60 karakter.");
      if (takenTypeNames(catalog, entry.value).has(sessionTypeNameKey(label))) throw new AppError("Nama bidang ini sudah dipakai bidang lain.");
      if (label === original) names.delete(entry.value);
      else names.set(entry.value, label);
    }
    if (show) hidden.delete(entry.value);
    else hidden.add(entry.value);
    if (order.every((value) => hidden.has(value))) throw new AppError("Sisakan minimal satu bidang yang tampil saat membuat sesi.");
    message =
      input.aksi === "ubah"
        ? "Perubahan bidang disimpan."
        : show
          ? "Bidang ditampilkan lagi di pilihan sesi."
          : "Bidang disembunyikan dari pilihan sesi. Riwayat sesinya tetap aman.";
  }

  const after: SessionTypeArrangement = {
    urutan: order,
    sembunyi: order.filter((value) => hidden.has(value)),
    nama: Object.fromEntries(order.filter((value) => names.has(value)).map((value) => [value, names.get(value)!])),
  };
  putSetting(t, PRESENSI_TYPE_ARRANGEMENT_KEY, JSON.stringify(after), ctx);
  return {
    entityType: "Pengaturan",
    entityId: PRESENSI_TYPE_ARRANGEMENT_KEY,
    message,
    before: { key: PRESENSI_TYPE_ARRANGEMENT_KEY, value: JSON.stringify(before) },
    after: { key: PRESENSI_TYPE_ARRANGEMENT_KEY, value: JSON.stringify(after) },
  };
}

function putSetting(t: Tables, key: string, value: string, ctx: OperationContext) {
  const found = find(t, "Pengaturan", "key", key);
  const row = { key, value, ...updated(ctx) };
  if (found) replace(t, "Pengaturan", found.index, { ...found.row, ...row });
  else rows(t, "Pengaturan").push(row);
}

export interface SessionInput {
  sesi_id: string;
  nama: string;
  tanggal: string;
  jam_mulai: string;
  jam_selesai: string;
  jenis: string;
  kelas_id: string;
  pengajar_id: string;
}

/** Menambah sesi baru atau mengubah satu sesi. `seriId` hanya dipakai saat menambah (lihat saveSessionSeries). */
export function saveSession(t: Tables, input: SessionInput, ctx: OperationContext, actor: Actor, seriId = ""): OperationOutcome {
  if (!isAcademicStaff(actor)) throw forbidden();
  tutupSesiLupa(t, ctx);
  if (!TIME.test(input.jam_mulai) || !TIME.test(input.jam_selesai) || input.jam_mulai >= input.jam_selesai) {
    throw new AppError("Jam mulai harus lebih awal dari jam selesai.");
  }
  if (input.kelas_id) {
    const kelas = find(t, "Kelas", "kelas_id", input.kelas_id);
    if (!kelas || !toClass(kelas.row).aktif) throw new AppError("Kelas tidak ditemukan atau nonaktif.");
    if (!teachesClass(actor, input.kelas_id)) throw forbidden("Kelas ini bukan kelas yang Anda ajar.");
  } else if (!isAdmin(actor)) {
    throw forbidden("Sesi untuk semua siswa hanya bisa dibuat owner atau admin.");
  }

  const teacherId = actor.user.peran === "PENGAJAR" ? actor.user.user_id : input.pengajar_id || actor.user.user_id;
  const teacherRow = find(t, "Pengguna", "user_id", teacherId);
  const teacher = teacherRow ? toUser(teacherRow.row) : null;
  if (!teacher || !teacher.aktif || !["OWNER", "ADMIN", "PENGAJAR"].includes(teacher.peran)) throw new AppError("Pengajar tidak valid.");
  if (teacher.peran === "PENGAJAR" && input.kelas_id) {
    const teaches = rows(t, "Tautan_Akun").some(
      (row) => row.user_id === teacher.user_id && row.jenis === "PENGAJAR_KELAS" && row.kelas_id === input.kelas_id && bool(row.aktif),
    );
    if (!teaches) throw new AppError("Pengajar belum ditautkan ke kelas yang dipilih.");
  }

  const existing = input.sesi_id ? sessionById(t, input.sesi_id) : null;
  if (existing && !canManageSession(actor, existing.session)) throw forbidden("Sesi ini bukan penugasan Anda.");
  if (input.jenis !== existing?.session.jenis && !sessionTypeOptions(t).some((option) => option.value === input.jenis)) {
    throw new AppError("Pilih bidang yang tersedia di Presensi.");
  }

  if (existing) {
    const { row, index, session } = existing;
    // Owner/admin boleh merapikan sesi yang sudah selesai (nama, jam, bidang); pengajar harus membukanya kembali.
    if (session.status === "SELESAI" && !isAdmin(actor)) throw new AppError("Sesi selesai tidak dapat diubah. Buka kembali bila perlu koreksi.", "CONFLICT", 409);
    if ((session.status === "AKTIF" || session.status === "SELESAI") && (input.kelas_id !== session.kelas_id || input.tanggal !== session.tanggal)) {
      throw new AppError("Peserta dan tanggal sesi yang sudah dibuka tidak dapat diubah. Batalkan lalu buat sesi baru bila keliru.", "CONFLICT", 409);
    }
    const after = { ...row, nama: input.nama, tanggal: input.tanggal, jam_mulai: input.jam_mulai, jam_selesai: input.jam_selesai, jenis: input.jenis, kelas_id: input.kelas_id, pengajar_id: teacher.user_id, ...updated(ctx) };
    replace(t, "Sesi", index, after);
    return { entityType: "Sesi", entityId: session.sesi_id, message: "Sesi diperbarui.", before: row, after };
  }
  const after = {
    sesi_id: ctx.newId("SES"),
    nama: input.nama,
    tanggal: input.tanggal,
    jam_mulai: input.jam_mulai,
    jam_selesai: input.jam_selesai,
    jenis: input.jenis,
    kelas_id: input.kelas_id,
    pengajar_id: teacher.user_id,
    status: "AKAN_DATANG",
    peserta_ids: "",
    ...created(ctx),
    seri_id: seriId,
  };
  rows(t, "Sesi").push(after);
  return { entityType: "Sesi", entityId: after.sesi_id, message: "Sesi ditambahkan.", after };
}

// ---------------------------------------------------------------- Sesi berulang

export interface SessionSeriesInput extends SessionInput {
  /** Tanggal terakhir seri (ikut dibuat bila harinya terpilih). */
  sampai: string;
  /** Hari ISO terpilih, 1 = Senin sampai 7 = Minggu. */
  hari: number[];
}

/** Kunci "sesi yang sama": tanggal, jam mulai, dan nama (tanpa beda huruf besar/spasi). */
const slotKey = (tanggal: string, jamMulai: string, nama: string) => `${tanggal}|${jamMulai}|${normalizeSessionTypeName(nama).toLowerCase()}`;

/**
 * Membuat satu seri sesi sekaligus: satu sesi per tanggal yang harinya terpilih, semuanya berbagi seri_id baru.
 * Dijalankan dalam satu operasi, jadi bila satu sesi gagal, tidak ada yang tersimpan.
 * Tanggal yang sudah lewat dan tanggal yang sudah punya sesi dengan nama dan jam mulai sama dilewati.
 */
export function saveSessionSeries(t: Tables, input: SessionSeriesInput, ctx: OperationContext, actor: Actor): OperationOutcome<{ jumlah: number; seri_id: string; tanggal: string }> {
  if (!isAcademicStaff(actor)) throw forbidden();
  if (input.sesi_id) throw new AppError("Ulangi hanya bisa dipakai saat membuat sesi baru.");
  if (!validDate(input.tanggal) || !validDate(input.sampai)) throw new AppError("Tanggal seri tidak valid.");
  if (input.sampai < input.tanggal) throw new AppError("Sampai tanggal harus sama dengan atau sesudah tanggal mulai.");
  if (daysBetween(input.tanggal, input.sampai) > SERIES_MAX_DAYS) throw new AppError(`Rentang seri paling panjang ${SERIES_MAX_DAYS} hari (sekitar 3 bulan).`);
  const hari = [...new Set(input.hari)].filter((d) => d >= 1 && d <= 7);
  if (hari.length === 0) throw new AppError("Pilih minimal satu hari.");

  const { date: today } = clock(t, ctx);
  const all = seriesDates(input.tanggal, input.sampai, hari);
  if (all.length === 0) throw new AppError("Tidak ada tanggal yang jatuh pada hari terpilih dalam rentang itu.");
  const upcoming = all.filter((date) => date >= today);
  if (upcoming.length === 0) throw new AppError("Semua tanggal itu sudah lewat. Mulai dari hari ini atau sesudahnya.");
  const taken = new Set(rows(t, "Sesi").map(toSession).filter(liveSession).map((s) => slotKey(s.tanggal, s.jam_mulai, s.nama)));
  const dates = upcoming.filter((date) => !taken.has(slotKey(date, input.jam_mulai, input.nama)));
  if (dates.length === 0) throw new AppError("Semua tanggal itu sudah punya sesi dengan nama dan jam mulai yang sama.", "DUPLICATE", 409);
  if (dates.length > SERIES_MAX_SESSIONS) {
    throw new AppError(`Satu seri paling banyak ${SERIES_MAX_SESSIONS} sesi (terpilih ${dates.length}). Perpendek rentang atau kurangi hari.`);
  }

  const seriId = ctx.newId("SERI");
  let first = "";
  for (const tanggal of dates) {
    const { entityId } = saveSession(t, { ...input, sesi_id: "", tanggal }, ctx, actor, seriId);
    first ||= entityId;
  }
  const notes = [
    all.length - upcoming.length ? `${all.length - upcoming.length} tanggal yang sudah lewat tidak dibuat.` : "",
    upcoming.length - dates.length ? `${upcoming.length - dates.length} tanggal dilewati karena sudah ada sesi yang sama.` : "",
  ].filter(Boolean);
  return {
    entityType: "Sesi",
    entityId: first,
    message: [`${dates.length} sesi berulang ditambahkan.`, ...notes].join(" "),
    data: { jumlah: dates.length, seri_id: seriId, tanggal: dates[0]! },
    after: { seri_id: seriId, jumlah: dates.length, dari: dates[0]!, sampai: dates[dates.length - 1]!, hari: hari.join(","), nama: input.nama },
  };
}

/** Sesi dalam seri yang sudah berjalan atau sudah ada catatan presensinya tidak ikut diubah/dihapus bersama. */
export interface SeriesFollowers {
  /** Sesi sesudahnya dalam seri yang masih boleh diubah atau dihapus bersama (belum berjalan, tanpa presensi). */
  eligible: Session[];
  /** Sesi sesudahnya dalam seri yang dibiarkan (sudah dibuka, selesai, dibatalkan, lewat, atau ada presensi). */
  skipped: Session[];
}

/** Sesi sesudah `session` dalam seri yang sama. `recorded` = ID sesi yang punya catatan presensi. */
export function seriesFollowers(session: Session, sessions: readonly Session[], recorded: ReadonlySet<string>, today: string): SeriesFollowers {
  const out: SeriesFollowers = { eligible: [], skipped: [] };
  if (!session.seri_id) return out;
  const later = sessions
    .filter((s) => s.seri_id === session.seri_id && s.sesi_id !== session.sesi_id && liveSession(s) && `${s.tanggal} ${s.jam_mulai}` > `${session.tanggal} ${session.jam_mulai}`)
    .sort((a, b) => `${a.tanggal} ${a.jam_mulai}`.localeCompare(`${b.tanggal} ${b.jam_mulai}`));
  for (const s of later) {
    const free = s.status === "AKAN_DATANG" && s.tanggal >= today && !recorded.has(s.sesi_id);
    (free ? out.eligible : out.skipped).push(s);
  }
  return out;
}

/** ID sesi yang sudah punya catatan presensi (selain yang dikosongkan). */
export function recordedSessionIds(attendance: readonly Pick<Attendance, "sesi_id" | "status">[]): Set<string> {
  return new Set(attendance.filter((a) => a.status !== "KOSONG").map((a) => a.sesi_id));
}

function followersIn(t: Tables, session: Session, ctx: OperationContext): SeriesFollowers {
  const { date } = clock(t, ctx);
  return seriesFollowers(session, rows(t, "Sesi").map(toSession), recordedSessionIds(rows(t, "Presensi").map(toAttendance)), date);
}

const skippedNote = (count: number) => (count ? ` ${count} sesi yang sudah berjalan atau sudah ada presensinya tidak diubah.` : "");

export type SessionScope = "satu" | "seri";

/**
 * Mengubah sesi. Lingkup "seri": sesi ini (aturan biasa) ditambah sesi sesudahnya dalam seri yang belum berjalan
 * dan belum ada presensinya. Nama, jam, bidang, peserta, dan pengajar ikut; tanggal hanya untuk sesi ini.
 */
export function saveSessionScoped(t: Tables, input: SessionInput & { lingkup: SessionScope }, ctx: OperationContext, actor: Actor): OperationOutcome {
  const { lingkup, ...fields } = input;
  if (lingkup !== "seri" || !fields.sesi_id) return saveSession(t, fields, ctx, actor);
  const { session } = sessionById(t, fields.sesi_id);
  if (!session.seri_id) return saveSession(t, fields, ctx, actor);
  const followers = followersIn(t, session, ctx);
  const outcome = saveSession(t, fields, ctx, actor);
  for (const s of followers.eligible) {
    saveSession(t, { ...fields, sesi_id: s.sesi_id, tanggal: s.tanggal }, ctx, actor);
  }
  const n = followers.eligible.length;
  return {
    ...outcome,
    message: (n ? `Sesi ini dan ${n} sesi berikutnya di seri ini diperbarui.` : "Sesi diperbarui. Tidak ada sesi berikutnya di seri ini yang bisa ikut diubah.") + skippedNote(followers.skipped.length),
    after: { ...outcome.after, ikut_diubah: followers.eligible.map((s) => s.sesi_id).join(",") },
  };
}

/** Menghapus sesi (owner/admin). Lingkup "seri" ikut menghapus sesi sesudahnya yang belum berjalan dan tanpa presensi. */
export function deleteSession(t: Tables, input: { sesi_id: string; lingkup: SessionScope }, ctx: OperationContext, actor: Actor): OperationOutcome {
  const { session } = sessionById(t, input.sesi_id);
  const followers = input.lingkup === "seri" && session.seri_id ? followersIn(t, session, ctx) : null;
  const outcome = setSessionStatus(t, { sesi_id: input.sesi_id, status: "DIHAPUS" }, ctx, actor);
  if (!followers) return outcome;
  for (const s of followers.eligible) setSessionStatus(t, { sesi_id: s.sesi_id, status: "DIHAPUS" }, ctx, actor);
  const n = followers.eligible.length + 1;
  return {
    ...outcome,
    message:
      `${n} sesi dihapus.` +
      (followers.skipped.length ? ` ${followers.skipped.length} sesi yang sudah berjalan atau sudah ada presensinya tetap tersimpan.` : ""),
    after: { ...outcome.after, ikut_dihapus: followers.eligible.map((s) => s.sesi_id).join(",") },
  };
}

export function setSessionStatus(t: Tables, input: { sesi_id: string; status: SessionStatus }, ctx: OperationContext, actor: Actor): OperationOutcome {
  tutupSesiLupa(t, ctx);
  const { row, index, session } = sessionById(t, input.sesi_id);
  if (!canManageSession(actor, session)) throw forbidden("Sesi ini bukan penugasan Anda.");
  const { date } = clock(t, ctx);
  if (input.status === session.status) return { entityType: "Sesi", entityId: session.sesi_id, message: "Status sesi tidak berubah." };
  if (session.status === "DIHAPUS") throw notFound("Sesi");
  if (input.status === "DIHAPUS") {
    if (!isAdmin(actor)) throw forbidden("Hanya owner atau admin yang dapat menghapus sesi.");
    const after = { ...row, status: "DIHAPUS", ...updated(ctx) };
    replace(t, "Sesi", index, after);
    return { entityType: "Sesi", entityId: session.sesi_id, message: "Sesi dihapus.", before: row, after };
  }
  if (input.status === "AKTIF" && session.tanggal !== date) throw new AppError("Sesi hanya dapat dibuka pada tanggal kegiatannya.", "CONFLICT", 409);
  // Owner/admin bisa memulihkan sesi yang terlanjur dibatalkan, asalkan dulu sudah pernah dibuka (peserta beku).
  const restore = input.status === "SELESAI" && session.status === "DIBATALKAN" && session.peserta_ids.length > 0 && isAdmin(actor);
  if (input.status === "SELESAI" && !restore) {
    if (session.status !== "AKTIF") throw new AppError("Buka sesi terlebih dahulu sebelum menutupnya.", "CONFLICT", 409);
    const pending = rows(t, "Presensi").some((r) => r.sesi_id === session.sesi_id && r.status === "MENUNGGU");
    if (pending) throw new AppError("Sahkan atau tolak pengajuan yang menunggu sebelum menutup sesi.", "CONFLICT", 409);
  }
  if (input.status === "AKAN_DATANG" && session.status !== "DIBATALKAN") {
    throw new AppError("Hanya sesi yang dibatalkan yang dapat dijadwalkan ulang.", "CONFLICT", 409);
  }
  let peserta = session.peserta_ids;
  if ((input.status === "AKTIF" || input.status === "SELESAI") && peserta.length === 0) {
    const { students, enrollments } = tablesOf(t);
    peserta = eligibleStudents(session, students, enrollments);
  }
  const after = { ...row, status: input.status, peserta_ids: peserta.join(","), ...updated(ctx) };
  replace(t, "Sesi", index, after);
  const message =
    input.status === "SELESAI"
      ? "Sesi ditutup. Siswa tanpa catatan dihitung alfa pada rekap."
      : input.status === "AKTIF"
        ? "Sesi dibuka. Siswa sudah bisa mengajukan kehadiran."
        : input.status === "DIBATALKAN"
          ? "Sesi dibatalkan dan tidak dihitung dalam rekap."
          : "Sesi dijadwalkan ulang.";
  return { entityType: "Sesi", entityId: session.sesi_id, message, before: row, after };
}

// ---------------------------------------------------------------- Presensi

function attendanceTarget(t: Tables, session: Session, siswaId: string) {
  const { students, enrollments } = tablesOf(t);
  if (!participantsOf(session, students, enrollments).includes(siswaId)) throw new AppError("Siswa tidak terdaftar pada sesi ini.");
  return find(t, "Presensi", "presensi_id", `${session.sesi_id}:${siswaId}`);
}

export interface TeacherMarkInput {
  sesi_id: string;
  siswa_id: string;
  status: (typeof TEACHER_MARKS)[number];
  waktu: string;
  catatan: string;
}

/** Pengajar mencatat atau mengoreksi presensi seorang siswa. */
export function recordAttendance(t: Tables, input: TeacherMarkInput, ctx: OperationContext, actor: Actor): OperationOutcome {
  tutupSesiLupa(t, ctx);
  const { session } = sessionById(t, input.sesi_id);
  if (!canManageSession(actor, session)) throw forbidden("Sesi ini bukan penugasan Anda.");
  if (session.status === "DIBATALKAN") throw new AppError("Sesi dibatalkan dan tidak menerima catatan presensi.", "CONFLICT", 409);
  const { settings, date, time } = clock(t, ctx);
  if (session.tanggal > date) throw new AppError("Presensi belum bisa dicatat untuk sesi yang akan datang.", "CONFLICT", 409);
  const existing = attendanceTarget(t, session, input.siswa_id);
  const current = existing ? toAttendance(existing.row) : null;
  const waktu = input.waktu || (current?.waktu && current.waktu !== "" ? current.waktu : session.tanggal === date ? time : session.jam_mulai);
  if (!TIME.test(waktu)) throw new AppError("Jam masuk tidak valid.");
  const row: Row = {
    presensi_id: `${session.sesi_id}:${input.siswa_id}`,
    sesi_id: session.sesi_id,
    siswa_id: input.siswa_id,
    status: input.status,
    status_diajukan: current?.status_diajukan ?? "",
    metode: "PENGAJAR",
    waktu: input.status === "KOSONG" ? "" : waktu,
    terlambat: input.status === "HADIR" && isLate(waktu, session.jam_mulai, settings.toleransi),
    catatan: input.catatan || current?.catatan || "",
    disahkan_oleh: input.status === "KOSONG" ? "" : actor.user.user_id,
    disahkan_pada: input.status === "KOSONG" ? "" : ctx.now,
  };
  const { before, after } = upsert(t, "Presensi", "presensi_id", row, ctx);
  return { entityType: "Presensi", entityId: str(row.presensi_id), message: "Presensi disimpan.", before, after };
}

export interface SelfMarkInput {
  sesi_id: string;
  status_diajukan: SelfMark;
  catatan: string;
}

/** Siswa mengajukan kehadiran sendiri (mandiri atau lewat QR); menunggu pengesahan pengajar. */
export function submitAttendance(t: Tables, input: SelfMarkInput, ctx: OperationContext, actor: Actor, via: "MANDIRI" | "QR" = "MANDIRI"): OperationOutcome {
  if (actor.user.peran !== "SISWA") throw forbidden("Presensi mandiri khusus akun siswa.");
  const siswaId = linkedStudentIds(actor, "SISWA")[0];
  if (!siswaId) throw new AppError("Akun ini belum ditautkan ke data siswa. Hubungi admin.");
  activeStudent(t, siswaId);
  const { session } = sessionById(t, input.sesi_id);
  const { settings, date, time } = clock(t, ctx);
  if (session.status !== "AKTIF" || session.tanggal !== date) throw new AppError("Sesi presensi belum dibuka.", "CONFLICT", 409);
  const existing = attendanceTarget(t, session, siswaId);
  const current = existing ? toAttendance(existing.row) : null;
  if (current && current.status !== "KOSONG") throw new AppError("Presensi sesi ini sudah tercatat.", "DUPLICATE", 409);
  if (input.status_diajukan !== "HADIR" && !input.catatan) throw new AppError("Tuliskan keterangan izin atau sakit.");
  // QR membuktikan siswa ada di lokasi. Bila owner mengizinkan, hadir lewat QR langsung sah.
  const auto = via === "QR" && input.status_diajukan === "HADIR" && settings.qr_langsung_sah;
  const row: Row = {
    presensi_id: `${session.sesi_id}:${siswaId}`,
    sesi_id: session.sesi_id,
    siswa_id: siswaId,
    status: auto ? "HADIR" : "MENUNGGU",
    status_diajukan: input.status_diajukan,
    metode: via,
    waktu: time,
    terlambat: input.status_diajukan === "HADIR" && isLate(time, session.jam_mulai, settings.toleransi),
    catatan: input.catatan,
    disahkan_oleh: auto ? "QR" : "",
    disahkan_pada: auto ? ctx.now : "",
  };
  const { before, after } = upsert(t, "Presensi", "presensi_id", row, ctx);
  const message = auto ? "Kehadiran tercatat. Terima kasih." : "Pengajuan terkirim dan menunggu pengesahan pelatih.";
  return { entityType: "Presensi", entityId: str(row.presensi_id), message, before, after };
}

/** Mengesahkan satu pengajuan (siswa_id diisi) atau semua pengajuan yang menunggu di sesi itu. */
export function approveAttendance(t: Tables, input: { sesi_id: string; siswa_id: string }, ctx: OperationContext, actor: Actor): OperationOutcome {
  tutupSesiLupa(t, ctx);
  const { session } = sessionById(t, input.sesi_id);
  if (!canManageSession(actor, session)) throw forbidden("Sesi ini bukan penugasan Anda.");
  // Owner/admin tetap bisa mengesahkan pengajuan yang tertinggal di sesi yang sudah selesai (termasuk yang ditutup otomatis).
  if (session.status !== "AKTIF" && !(session.status === "SELESAI" && isAdmin(actor))) throw new AppError("Buka sesi terlebih dahulu.", "CONFLICT", 409);
  const list = rows(t, "Presensi");
  let count = 0;
  list.forEach((row, index) => {
    if (row.sesi_id !== session.sesi_id || row.status !== "MENUNGGU") return;
    if (input.siswa_id && row.siswa_id !== input.siswa_id) return;
    const record = toAttendance(row);
    replace(t, "Presensi", index, { ...row, status: record.status_diajukan || "HADIR", disahkan_oleh: actor.user.user_id, disahkan_pada: ctx.now, ...updated(ctx) });
    count += 1;
  });
  if (input.siswa_id && count === 0) throw new AppError("Pengajuan sudah diproses atau tidak ditemukan.", "CONFLICT", 409);
  return { entityType: "Sesi", entityId: session.sesi_id, message: count ? `${count} pengajuan disahkan.` : "Tidak ada pengajuan yang menunggu.", data: { count } };
}

export interface AttendanceSummary {
  total: number;
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alfa: number;
  persen: number | null;
}

export type AttendanceCounts = Omit<AttendanceSummary, "persen">;

export function emptyAttendanceCounts(): AttendanceCounts {
  return { total: 0, hadir: 0, terlambat: 0, izin: 0, sakit: 0, alfa: 0 };
}

/** Satu peserta pada sesi selesai. Catatan kosong dihitung alfa. */
export function countCompletedAttendance(counts: AttendanceCounts, record: Attendance | undefined) {
  counts.total += 1;
  if (record?.status === "HADIR") {
    counts.hadir += 1;
    if (record.terlambat) counts.terlambat += 1;
  } else if (record?.status === "IZIN") counts.izin += 1;
  else if (record?.status === "SAKIT") counts.sakit += 1;
  else counts.alfa += 1;
}

export function summarizeAttendance(counts: AttendanceCounts): AttendanceSummary {
  return { ...counts, persen: counts.total ? (counts.hadir / counts.total) * 100 : null };
}

export interface TrendPoint {
  tanggal: string;
  hadir: number;
  total: number;
  persen: number;
}

/**
 * Persentase hadir per tanggal dari sesi yang sudah selesai, untuk grafik Beranda.
 * Hanya peserta yang ada di `ids`; tanpa catatan dihitung tidak hadir (sama seperti rekap). Paling banyak `days` tanggal terakhir.
 */
export function attendanceTrend(sessions: readonly Session[], attendance: ReadonlyMap<string, Attendance>, ids: ReadonlySet<string>, days = 8): TrendPoint[] {
  const byDate = new Map<string, { hadir: number; total: number }>();
  for (const session of sessions) {
    if (session.status !== "SELESAI") continue;
    const peserta = session.peserta_ids.filter((id) => ids.has(id));
    if (peserta.length === 0) continue;
    const day = byDate.get(session.tanggal) ?? { hadir: 0, total: 0 };
    for (const id of peserta) {
      day.total += 1;
      if (attendance.get(`${session.sesi_id}:${id}`)?.status === "HADIR") day.hadir += 1;
    }
    byDate.set(session.tanggal, day);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-days)
    .map(([tanggal, day]) => ({ tanggal, ...day, persen: (day.hadir / day.total) * 100 }));
}

/** Rekap kehadiran satu siswa dari sesi yang sudah selesai pada periode (YYYY-MM). Tanpa catatan = alfa. */
export function attendanceSummary(siswaId: string, sessions: readonly Session[], attendance: ReadonlyMap<string, Attendance>, periode: string): AttendanceSummary {
  const counts = emptyAttendanceCounts();
  for (const session of sessions) {
    if (session.status !== "SELESAI" || !session.tanggal.startsWith(periode) || !session.peserta_ids.includes(siswaId)) continue;
    countCompletedAttendance(counts, attendance.get(`${session.sesi_id}:${siswaId}`));
  }
  return summarizeAttendance(counts);
}

export function disciplineLabel(persen: number | null): string {
  if (persen === null) return "Belum ada sesi selesai";
  if (persen >= DISCIPLINE.sangat) return "Sangat disiplin";
  if (persen >= DISCIPLINE.baik) return "Disiplin";
  if (persen >= DISCIPLINE.cukup) return "Cukup disiplin";
  return "Perlu pembinaan";
}

// ---------------------------------------------------------------- Nilai & tes

export interface TestInput {
  tes_id: string;
  siswa_id: string;
  kategori: TestCategory;
  komponen: string;
  nama_tes: string;
  tanggal: string;
  twk: string;
  tiu: string;
  tkp: string;
  skor: string;
  hasil_mentah: string;
  protokol: string;
  catatan: string;
}

export function saveTest(t: Tables, input: TestInput, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!isAcademicStaff(actor)) throw forbidden();
  teachableStudent(t, actor, input.siswa_id);
  const { date } = clock(t, ctx);
  if (input.tanggal > date) throw new AppError("Hasil tes tidak boleh bertanggal masa depan.");
  const row: Row = {
    tes_id: input.tes_id || ctx.newId("TES"),
    siswa_id: input.siswa_id,
    kategori: input.kategori,
    komponen: "",
    nama_tes: input.nama_tes,
    tanggal: input.tanggal,
    twk: "",
    tiu: "",
    tkp: "",
    skor: "",
    hasil_mentah: "",
    protokol: "",
    sumber: "Input pengajar",
    catatan: input.catatan,
    pengajar_id: actor.user.user_id,
    diarsipkan: false,
  };
  if (input.kategori === "SKD") {
    row.twk = numberIn(input.twk, "TWK", 0, SKD_MAX.twk)!;
    row.tiu = numberIn(input.tiu, "TIU", 0, SKD_MAX.tiu)!;
    row.tkp = numberIn(input.tkp, "TKP", 0, SKD_MAX.tkp)!;
  } else {
    const components = COMPONENTS[input.kategori];
    if (!(input.komponen in components)) throw new AppError("Pilih komponen yang sesuai bidang.");
    row.komponen = input.komponen;
    row.skor = numberIn(input.skor, "Skor", 0, 100)!;
    if (input.kategori === "FISIK") {
      const [min, max] = FITNESS_RAW[input.komponen] ?? [0, 500];
      row.hasil_mentah = numberIn(input.hasil_mentah, "Hasil asli", min, max)!;
      row.protokol = input.protokol || "Penilaian pengajar GAN";
    }
  }
  if (input.tes_id) {
    const found = find(t, "Hasil_Tes", "tes_id", input.tes_id);
    if (!found) throw notFound("Hasil tes");
    const old = toTest(found.row);
    if (old.siswa_id !== input.siswa_id || old.diarsipkan) throw new AppError("Hasil tes ini tidak dapat diubah.");
  }
  const { before, after } = upsert(t, "Hasil_Tes", "tes_id", row, ctx);
  return { entityType: "Hasil_Tes", entityId: str(row.tes_id), message: "Hasil tes disimpan dan rata-rata diperbarui.", before, after };
}

export function archiveTest(t: Tables, tesId: string, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!isAcademicStaff(actor)) throw forbidden();
  const found = find(t, "Hasil_Tes", "tes_id", tesId);
  if (!found) throw notFound("Hasil tes");
  teachableStudent(t, actor, str(found.row.siswa_id));
  const after = { ...found.row, diarsipkan: true, ...updated(ctx) };
  replace(t, "Hasil_Tes", found.index, after);
  return { entityType: "Hasil_Tes", entityId: tesId, message: "Hasil tes diarsipkan dan tidak dihitung lagi.", before: found.row, after };
}

export const mean = (values: readonly (number | null)[]): number | null => {
  const filled = values.filter((v): v is number => v !== null);
  return filled.length ? filled.reduce((sum, v) => sum + v, 0) / filled.length : null;
};

export function gradeOf(value: number | null, s: Pick<AcademicSettings, "predikat_a" | "predikat_b" | "predikat_c">): string {
  if (value === null) return "-";
  return value >= s.predikat_a ? "A" : value >= s.predikat_b ? "B" : value >= s.predikat_c ? "C" : "D";
}

export function labelOf(value: number | null, s: Pick<AcademicSettings, "predikat_a" | "predikat_b" | "predikat_c">): string {
  if (value === null) return "Belum diisi";
  return value >= s.predikat_a ? "Sangat baik" : value >= s.predikat_b ? "Baik" : value >= s.predikat_c ? "Cukup" : "Perlu pembinaan";
}

/** Lulus acuan latihan SKD hanya bila ketiga komponen memenuhi acuan; total tinggi saja tidak cukup. */
export function skdPasses(scores: { twk: number | null; tiu: number | null; tkp: number | null }, acuan: AcademicSettings["acuan"]): boolean {
  return SKD_KEYS.every((key) => scores[key] !== null && scores[key]! >= acuan[key]);
}

// ---------------------------------------------------------------- Kesehatan

export interface HealthInput {
  siswa_id: string;
  tanggal: string;
  tinggi_cm: string;
  berat_kg: string;
  sistolik: string;
  diastolik: string;
  catatan: string;
}

export function saveHealth(t: Tables, input: HealthInput, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!isAcademicStaff(actor)) throw forbidden();
  teachableStudent(t, actor, input.siswa_id);
  const { date } = clock(t, ctx);
  if (input.tanggal > date) throw new AppError("Pengukuran tidak boleh bertanggal masa depan.");
  const tinggi = numberIn(input.tinggi_cm, "Tinggi badan", 50, 250, true);
  const berat = numberIn(input.berat_kg, "Berat badan", 5, 300, true);
  const sistolik = numberIn(input.sistolik, "Sistolik", 40, 260, true);
  const diastolik = numberIn(input.diastolik, "Diastolik", 20, 160, true);
  if ((sistolik === null) !== (diastolik === null)) throw new AppError("Sistolik dan diastolik harus diisi berpasangan.");
  if ([tinggi, berat, sistolik].every((v) => v === null)) throw new AppError("Isi setidaknya satu pengukuran.");
  const after = {
    ukur_id: ctx.newId("KES"),
    siswa_id: input.siswa_id,
    tanggal: input.tanggal,
    tinggi_cm: tinggi ?? "",
    berat_kg: berat ?? "",
    sistolik: sistolik ?? "",
    diastolik: diastolik ?? "",
    catatan: input.catatan,
    pemeriksa: actor.user.nama,
    ...created(ctx),
  };
  rows(t, "Kesehatan").push(after);
  return { entityType: "Kesehatan", entityId: after.ukur_id, message: "Pengukuran kesehatan disimpan.", after };
}

// ---------------------------------------------------------------- Tugas & pengumpulan

export interface AssignmentInput {
  tugas_id: string;
  nama: string;
  bidang: SessionType;
  kelas_id: string;
  tenggat: string;
  instruksi: string;
  aktif: boolean;
}

export function saveAssignment(t: Tables, input: AssignmentInput, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!isAcademicStaff(actor)) throw forbidden();
  if (input.kelas_id) {
    const kelas = find(t, "Kelas", "kelas_id", input.kelas_id);
    if (!kelas) throw notFound("Kelas");
    if (!teachesClass(actor, input.kelas_id)) throw forbidden("Kelas ini bukan kelas yang Anda ajar.");
  } else if (!isAdmin(actor)) {
    throw forbidden("Tugas untuk semua kelas hanya dapat dibuat admin.");
  }
  if (input.tugas_id) {
    const found = find(t, "Tugas", "tugas_id", input.tugas_id);
    if (!found) throw notFound("Tugas");
    const old = toAssignment(found.row);
    if (!isAdmin(actor) && old.pengajar_id !== actor.user.user_id) throw forbidden("Tugas ini bukan buatan Anda.");
    const after = { ...found.row, nama: input.nama, bidang: input.bidang, kelas_id: input.kelas_id, tenggat: input.tenggat, instruksi: input.instruksi, aktif: input.aktif, ...updated(ctx) };
    replace(t, "Tugas", found.index, after);
    return { entityType: "Tugas", entityId: old.tugas_id, message: "Tugas diperbarui.", before: found.row, after };
  }
  const after = {
    tugas_id: ctx.newId("TGS"),
    nama: input.nama,
    bidang: input.bidang,
    kelas_id: input.kelas_id,
    tenggat: input.tenggat,
    instruksi: input.instruksi,
    pengajar_id: actor.user.user_id,
    aktif: true,
    ...created(ctx),
  };
  rows(t, "Tugas").push(after);
  return { entityType: "Tugas", entityId: after.tugas_id, message: "Tugas ditambahkan.", after };
}

/** Kelas tempat siswa terdaftar aktif (atau cuti). */
export const classesOfStudent = (siswaId: string, enrollments: readonly Enrollment[]) =>
  enrollments.filter((e) => e.siswa_id === siswaId && (e.status === "AKTIF" || e.status === "CUTI")).map((e) => e.kelas_id);

export const assignmentFor = (assignment: Assignment, classIds: readonly string[]) => !assignment.kelas_id || classIds.includes(assignment.kelas_id);

function assignmentById(t: Tables, tugasId: string): Assignment {
  const found = find(t, "Tugas", "tugas_id", tugasId);
  const assignment = found ? toAssignment(found.row) : null;
  if (!assignment || !assignment.aktif) throw notFound("Tugas");
  return assignment;
}

export function submitAssignment(t: Tables, input: { tugas_id: string; tautan: string; catatan: string }, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (actor.user.peran !== "SISWA") throw forbidden("Pengumpulan tugas khusus akun siswa.");
  const siswaId = linkedStudentIds(actor, "SISWA")[0];
  if (!siswaId) throw new AppError("Akun ini belum ditautkan ke data siswa. Hubungi admin.");
  activeStudent(t, siswaId);
  const assignment = assignmentById(t, input.tugas_id);
  if (!assignmentFor(assignment, classesOfStudent(siswaId, rows(t, "Pendaftaran").map(toEnrollment)))) throw forbidden("Tugas ini bukan untuk kelas Anda.");
  if (!/^https?:\/\/\S+$/i.test(input.tautan)) throw new AppError("Tautan harus diawali https:// atau http://.");
  const id = `${assignment.tugas_id}:${siswaId}`;
  const existing = find(t, "Pengumpulan", "pengumpulan_id", id);
  if (existing && toSubmission(existing.row).status === "DIPERIKSA") throw new AppError("Tugas ini sudah diperiksa pengajar.", "CONFLICT", 409);
  const { before, after } = upsert(
    t,
    "Pengumpulan",
    "pengumpulan_id",
    { pengumpulan_id: id, tugas_id: assignment.tugas_id, siswa_id: siswaId, tautan: input.tautan, catatan: input.catatan, status: "DIKIRIM", nilai: "", diperiksa_oleh: "" },
    ctx,
  );
  return { entityType: "Pengumpulan", entityId: id, message: "Tugas dikirim untuk diperiksa pengajar.", before, after };
}

export interface ReviewInput {
  tugas_id: string;
  siswa_id: string;
  status: "DIPERIKSA" | "DIKEMBALIKAN";
  nilai: string;
  catatan: string;
}

export function reviewSubmission(t: Tables, input: ReviewInput, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!isAcademicStaff(actor)) throw forbidden();
  teachableStudent(t, actor, input.siswa_id);
  const assignment = assignmentById(t, input.tugas_id);
  if (!assignmentFor(assignment, classesOfStudent(input.siswa_id, rows(t, "Pendaftaran").map(toEnrollment)))) throw new AppError("Tugas ini bukan untuk kelas siswa tersebut.");
  const nilai = numberIn(input.nilai, "Nilai tugas", 0, 100, input.status === "DIKEMBALIKAN");
  const id = `${assignment.tugas_id}:${input.siswa_id}`;
  const existing = find(t, "Pengumpulan", "pengumpulan_id", id);
  const { before, after } = upsert(
    t,
    "Pengumpulan",
    "pengumpulan_id",
    {
      pengumpulan_id: id,
      tugas_id: assignment.tugas_id,
      siswa_id: input.siswa_id,
      tautan: existing ? str(existing.row.tautan) : "",
      catatan: input.catatan || (existing ? str(existing.row.catatan) : ""),
      status: input.status,
      nilai: nilai ?? "",
      diperiksa_oleh: actor.user.user_id,
    },
    ctx,
  );
  return { entityType: "Pengumpulan", entityId: id, message: input.status === "DIPERIKSA" ? "Nilai tugas disimpan." : "Tugas dikembalikan untuk diperbaiki.", before, after };
}

// ---------------------------------------------------------------- Rapor

export interface ReportLine {
  label: string;
  value: string;
  /** Skor 0–100 untuk batang dan predikat; null bila tidak relevan atau belum diisi. */
  score: number | null;
  note: string;
}

export interface ReportSection {
  title: string;
  rows: ReportLine[];
  note?: string;
}

export interface ReportSnapshot {
  student: { siswa_id: string; nama: string; kode_siswa: string; kelas: string; jalur_target: string };
  periode: string;
  sections: ReportSection[];
  summary: { skd: number | null; attendance: number | null; academic: number | null; physical: number | null };
  settings: Pick<AcademicSettings, "nama_lembaga" | "lokasi" | "predikat_a" | "predikat_b" | "predikat_c" | "acuan">;
  createdAt: string;
}

export const REPORT_TABLES = ["Pengaturan", "Siswa", "Pendaftaran", "Kelas", "Sesi", "Presensi", "Hasil_Tes", "Tugas", "Pengumpulan", "Kesehatan", "Rapor"] as const;

const longDate = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`))
    : iso;

const fmt = (value: number | null | undefined) =>
  value === null || value === undefined ? "-" : value.toLocaleString("id-ID", { maximumFractionDigits: 1 });

/** Menyusun rapor bulanan tujuh bagian dari data saat ini. Rapor terbit menyimpan hasil ini sebagai snapshot. */
export function buildReport(t: Tables, siswaId: string, periode: string, now: string): ReportSnapshot {
  if (!PERIOD.test(periode)) throw new AppError("Periode rapor tidak valid.");
  const settings = academicSettings(t);
  const found = find(t, "Siswa", "siswa_id", siswaId);
  if (!found) throw notFound("Siswa");
  const student = toStudent(found.row);
  const enrollments = rows(t, "Pendaftaran").map(toEnrollment);
  const classNames = new Map(rows(t, "Kelas").map((r) => [str(r.kelas_id), str(r.nama_kelas)]));
  const classIds = enrollments.filter((e) => e.siswa_id === siswaId).map((e) => e.kelas_id);
  const openClasses = classesOfStudent(siswaId, enrollments);

  const tests = rows(t, "Hasil_Tes")
    .map(toTest)
    .filter((test) => test.siswa_id === siswaId && !test.diarsipkan && test.tanggal.startsWith(periode))
    .sort((a, b) => `${a.tanggal}${a.created_at}`.localeCompare(`${b.tanggal}${b.created_at}`));
  const byComponent = (kategori: ComponentCategory) =>
    Object.entries(COMPONENTS[kategori]).map(([key, label]) => {
      const items = tests.filter((test) => test.kategori === kategori && test.komponen === key);
      return { key, label, items, score: mean(items.map((test) => test.skor)) };
    });
  const componentRows = (kategori: ComponentCategory): ReportLine[] =>
    byComponent(kategori).map(({ label, score }) => ({ label, value: fmt(score), score, note: labelOf(score, settings) }));

  const skdTests = tests.filter((test) => test.kategori === "SKD");
  const skd = { twk: mean(skdTests.map((x) => x.twk)), tiu: mean(skdTests.map((x) => x.tiu)), tkp: mean(skdTests.map((x) => x.tkp)) };
  const skdTotal = skdTests.length ? (skd.twk ?? 0) + (skd.tiu ?? 0) + (skd.tkp ?? 0) : null;
  const maxTotal = SKD_MAX.twk + SKD_MAX.tiu + SKD_MAX.tkp;

  const fitness = byComponent("FISIK");
  const health = rows(t, "Kesehatan")
    .map(toHealth)
    .filter((h) => h.siswa_id === siswaId && h.tanggal.startsWith(periode))
    .sort((a, b) => `${a.tanggal}${a.created_at}`.localeCompare(`${b.tanggal}${b.created_at}`))
    .at(-1);

  const sessions = rows(t, "Sesi").map(toSession).filter(liveSession);
  const attendance = new Map(rows(t, "Presensi").map((r) => [str(r.presensi_id), toAttendance(r)]));
  const recap = attendanceSummary(siswaId, sessions, attendance, periode);

  const submissions = new Map(rows(t, "Pengumpulan").map((r) => [str(r.pengumpulan_id), toSubmission(r)]));
  const tasks = rows(t, "Tugas")
    .map(toAssignment)
    .filter((task) => task.aktif && task.tenggat.startsWith(periode) && assignmentFor(task, classIds));

  const bmi = health?.tinggi_cm && health.berat_kg ? health.berat_kg / (health.tinggi_cm / 100) ** 2 : null;

  const sections: ReportSection[] = [
    { title: "Akademik", rows: componentRows("AKADEMIK") },
    {
      title: "Seleksi Kompetensi Dasar",
      rows: SKD_KEYS.map((key) => ({
        label: key.toUpperCase(),
        value: fmt(skd[key]),
        score: skd[key] === null ? null : (skd[key]! / SKD_MAX[key]) * 100,
        note: skd[key] === null ? "Belum diisi" : skd[key]! >= settings.acuan[key] ? `Memenuhi acuan ${settings.acuan[key]}` : `Di bawah acuan ${settings.acuan[key]}`,
      })),
      note: `Total rata-rata ${fmt(skdTotal)} / ${maxTotal} dari ${skdTests.length} tes. ${
        skdTests.length ? (skdPasses(skd, settings.acuan) ? "Ketiga komponen memenuhi acuan latihan." : "Belum semua komponen memenuhi acuan latihan.") : ""
      }`.trim(),
    },
    { title: "Psikotes", rows: componentRows("PSIKOTES") },
    {
      title: "Perkembangan fisik",
      rows: fitness.map(({ key, label, items, score }) => {
        const raw = items.at(-1)?.hasil_mentah ?? null;
        return { label, value: raw === null ? "-" : `${fmt(raw)} ${FITNESS_UNIT[key]}`, score, note: labelOf(score, settings) };
      }),
    },
    {
      title: "Tugas",
      rows: tasks.length
        ? tasks.map((task) => {
            const submission = submissions.get(`${task.tugas_id}:${siswaId}`);
            return {
              label: task.nama,
              value: submission ? SUBMISSION_LABEL[submission.status] : "Belum dikumpulkan",
              score: submission?.status === "DIPERIKSA" ? submission.nilai : null,
              note: submission?.catatan ?? "",
            };
          })
        : [{ label: "Belum ada tugas bulan ini", value: "-", score: null, note: "" }],
    },
    {
      title: "Kesehatan",
      rows: [
        { label: "Tinggi badan", value: health?.tinggi_cm ? `${fmt(health.tinggi_cm)} cm` : "-", score: null, note: health ? `Diukur ${longDate(health.tanggal)}` : "Belum ada pengukuran" },
        { label: "Berat badan", value: health?.berat_kg ? `${fmt(health.berat_kg)} kg` : "-", score: null, note: health?.pemeriksa ? `Pemeriksa: ${health.pemeriksa}` : "" },
        { label: "Indeks Massa Tubuh", value: fmt(bmi), score: null, note: "Interpretasi oleh pemeriksa" },
        { label: "Tekanan darah", value: health?.sistolik ? `${health.sistolik}/${health.diastolik} mmHg` : "-", score: null, note: health?.catatan ?? "" },
      ],
    },
    {
      title: "Kehadiran",
      rows: [
        { label: "Hadir", value: `${recap.hadir} sesi`, score: recap.persen, note: recap.persen === null ? "Belum ada sesi selesai" : `${fmt(recap.persen)}% · ${disciplineLabel(recap.persen)}` },
        { label: "Izin / Sakit / Alfa", value: `${recap.izin} / ${recap.sakit} / ${recap.alfa}`, score: null, note: `${recap.total} sesi selesai` },
        { label: "Terlambat", value: `${recap.terlambat} sesi`, score: null, note: "Tetap dihitung hadir" },
      ],
    },
  ];

  return {
    student: {
      siswa_id: student.siswa_id,
      nama: student.nama,
      kode_siswa: student.kode_siswa,
      kelas: (openClasses.length ? openClasses : classIds).map((id) => classNames.get(id) ?? "?").join(", ") || "-",
      jalur_target: student.jalur_target,
    },
    periode,
    sections,
    summary: {
      skd: skdTotal,
      attendance: recap.persen,
      academic: mean(byComponent("AKADEMIK").map((c) => c.score)),
      physical: mean(fitness.map((c) => c.score)),
    },
    settings: {
      nama_lembaga: settings.nama_lembaga,
      lokasi: settings.lokasi,
      predikat_a: settings.predikat_a,
      predikat_b: settings.predikat_b,
      predikat_c: settings.predikat_c,
      acuan: settings.acuan,
    },
    createdAt: now,
  };
}

const reportId = (siswaId: string, periode: string) => `${siswaId}:${periode}`;

/** Rapor kerja (draf atau terbit) untuk staf. */
export function currentReport(reports: readonly ReportRow[], siswaId: string, periode: string): ReportRow | null {
  return reports.find((r) => r.rapor_id === reportId(siswaId, periode)) ?? null;
}

/** Versi terbit terakhir untuk siswa/wali: tetap tampil walau staf sedang menyiapkan revisi. */
export function latestPublished(reports: readonly ReportRow[], siswaId: string, periode: string): ReportRow | null {
  return (
    reports
      .filter((r) => r.siswa_id === siswaId && r.periode === periode && r.status === "TERBIT" && r.rapor_id.startsWith(`${reportId(siswaId, periode)}:v`))
      .sort((a, b) => b.versi - a.versi)[0] ?? null
  );
}

function reportForWrite(t: Tables, actor: Actor, siswaId: string, periode: string) {
  if (!PERIOD.test(periode)) throw new AppError("Periode rapor tidak valid.");
  const studentRow = find(t, "Siswa", "siswa_id", siswaId);
  if (!studentRow) throw notFound("Siswa");
  if (!canTeachStudent(actor, siswaId, rows(t, "Pendaftaran").map(toEnrollment))) throw forbidden("Siswa ini bukan siswa di kelas yang Anda ajar.");
  return find(t, "Rapor", "rapor_id", reportId(siswaId, periode));
}

export function saveReportNote(t: Tables, input: { siswa_id: string; periode: string; catatan: string }, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!isAcademicStaff(actor)) throw forbidden();
  activeStudent(t, input.siswa_id);
  const found = reportForWrite(t, actor, input.siswa_id, input.periode);
  if (found && toReport(found.row).status === "TERBIT") throw new AppError("Rapor sudah terbit. Buat revisi draf terlebih dahulu.", "CONFLICT", 409);
  const { before, after } = upsert(
    t,
    "Rapor",
    "rapor_id",
    {
      rapor_id: reportId(input.siswa_id, input.periode),
      siswa_id: input.siswa_id,
      periode: input.periode,
      versi: found ? num(found.row.versi, 1) : 1,
      status: "DRAF",
      catatan: input.catatan,
      snapshot_json: "",
      diterbitkan_oleh: "",
      diterbitkan_pada: "",
    },
    ctx,
  );
  return { entityType: "Rapor", entityId: str(after.rapor_id), message: "Draf rapor disimpan.", before, after };
}

export function publishReport(t: Tables, input: { siswa_id: string; periode: string; catatan: string }, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!canPublishReport(actor)) throw forbidden("Rapor hanya dapat diterbitkan oleh owner atau admin.");
  activeStudent(t, input.siswa_id);
  const found = reportForWrite(t, actor, input.siswa_id, input.periode);
  const current = found ? toReport(found.row) : null;
  if (current?.status === "TERBIT") throw new AppError("Rapor sudah terbit. Buat revisi draf terlebih dahulu.", "CONFLICT", 409);
  const versi = current?.versi ?? 1;
  const snapshot = JSON.stringify(buildReport(t, input.siswa_id, input.periode, ctx.now));
  const base = {
    siswa_id: input.siswa_id,
    periode: input.periode,
    versi,
    status: "TERBIT",
    catatan: input.catatan || current?.catatan || "",
    snapshot_json: snapshot,
    diterbitkan_oleh: actor.user.user_id,
    diterbitkan_pada: ctx.now,
  };
  const { before, after } = upsert(t, "Rapor", "rapor_id", { rapor_id: reportId(input.siswa_id, input.periode), ...base }, ctx);
  // Arsip versi terbit: tidak pernah diubah lagi.
  rows(t, "Rapor").push({ rapor_id: `${reportId(input.siswa_id, input.periode)}:v${versi}`, ...base, ...created(ctx) });
  return { entityType: "Rapor", entityId: str(after.rapor_id), message: `Rapor versi ${versi} diterbitkan. Isinya tidak berubah walau nilai diubah kemudian.`, before, after: { ...after, snapshot_json: "(snapshot)" } };
}

export function reviseReport(t: Tables, input: { siswa_id: string; periode: string }, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!canPublishReport(actor)) throw forbidden("Revisi rapor hanya dapat dibuat oleh owner atau admin.");
  const found = reportForWrite(t, actor, input.siswa_id, input.periode);
  const current = found ? toReport(found.row) : null;
  if (!found || current?.status !== "TERBIT") throw new AppError("Hanya rapor terbit yang dapat direvisi.", "CONFLICT", 409);
  const after = { ...found.row, status: "DRAF", versi: current.versi + 1, snapshot_json: "", diterbitkan_oleh: "", diterbitkan_pada: "", ...updated(ctx) };
  replace(t, "Rapor", found.index, after);
  return {
    entityType: "Rapor",
    entityId: reportId(input.siswa_id, input.periode),
    message: `Draf revisi versi ${current.versi + 1} dibuat. Siswa dan wali tetap melihat versi ${current.versi} sampai revisi diterbitkan.`,
    before: { ...found.row, snapshot_json: "(snapshot)" },
    after,
  };
}

// ---------------------------------------------------------------- Ekspor CSV

/** Sel CSV aman: diberi tanda kutip dan dicegah dibaca sebagai rumus di Excel/Sheets. */
export function csvCell(value: string | number | boolean | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
