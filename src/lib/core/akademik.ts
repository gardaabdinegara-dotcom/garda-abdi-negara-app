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
export const PRESENSI_TYPE_NAME_MAX = 60;

export interface SessionTypeOption {
  value: string;
  label: string;
}

export function sessionTypeLabel(value: string): string {
  return Object.hasOwn(PRESENSI_TYPE_LABEL, value) ? PRESENSI_TYPE_LABEL[value]! : value;
}

export const normalizeSessionTypeName = (name: string) => name.normalize("NFC").trim().replace(/\s+/g, " ");
const sessionTypeNameKey = (name: string) => normalizeSessionTypeName(name).toLowerCase();

export function sessionTypeOptions(t: Tables): SessionTypeOption[] {
  const options = Object.entries(PRESENSI_TYPE_LABEL).map(([value, label]) => ({ value, label }));
  const seen = new Set(options.flatMap(({ value, label }) => [sessionTypeNameKey(value), sessionTypeNameKey(label)]));
  for (const row of t.Pengaturan ?? []) {
    if (!str(row.key).startsWith(PRESENSI_TYPE_PREFIX)) continue;
    const name = normalizeSessionTypeName(str(row.value));
    const key = sessionTypeNameKey(name);
    if (!name || name.length > PRESENSI_TYPE_NAME_MAX || seen.has(key)) continue;
    seen.add(key);
    // Nama bidang tambahan disimpan di sesi agar riwayat tetap bisa menampilkannya.
    options.push({ value: name, label: name });
  }
  return options;
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

/** Nilai maksimal SKD (Permenpan) — acuan kelulusan latihan diatur di Pengaturan. */
export const SKD_MAX = { twk: 150, tiu: 175, tkp: 225 } as const;
export const SKD_KEYS = ["twk", "tiu", "tkp"] as const;

export const SUBMISSION_STATUS = ["DIKIRIM", "DIPERIKSA", "DIKEMBALIKAN"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUS)[number];
export const SUBMISSION_LABEL: Record<SubmissionStatus, string> = { DIKIRIM: "Menunggu periksa", DIPERIKSA: "Diperiksa", DIKEMBALIKAN: "Dikembalikan" };

/** Batas label kedisiplinan dari persentase kehadiran. */
export const DISCIPLINE = { sangat: 95, baik: 85, cukup: 75 } as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

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

// ---------------------------------------------------------------- Sesi

export function addSessionType(t: Tables, name: string, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!isAdmin(actor)) throw forbidden();
  const label = normalizeSessionTypeName(name);
  if (!label || label.length > PRESENSI_TYPE_NAME_MAX) throw new AppError("Nama bidang tidak valid.");
  const key = sessionTypeNameKey(label);
  if (sessionTypeOptions(t).some((option) => [option.value, option.label].some((text) => sessionTypeNameKey(text) === key))) {
    throw new AppError("Nama bidang ini sudah ada.");
  }
  const row = { key: `${PRESENSI_TYPE_PREFIX}${ctx.newId("BDG")}`, value: label, ...updated(ctx) };
  rows(t, "Pengaturan").push(row);
  return { entityType: "Pengaturan", entityId: row.key, message: "Bidang presensi ditambahkan.", after: row };
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

export function saveSession(t: Tables, input: SessionInput, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!isAcademicStaff(actor)) throw forbidden();
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
  };
  rows(t, "Sesi").push(after);
  return { entityType: "Sesi", entityId: after.sesi_id, message: "Sesi ditambahkan.", after };
}

export function setSessionStatus(t: Tables, input: { sesi_id: string; status: SessionStatus }, ctx: OperationContext, actor: Actor): OperationOutcome {
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
  const { session } = sessionById(t, input.sesi_id);
  if (!canManageSession(actor, session)) throw forbidden("Sesi ini bukan penugasan Anda.");
  if (session.status !== "AKTIF") throw new AppError("Buka sesi terlebih dahulu.", "CONFLICT", 409);
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

/** Versi terbit terakhir untuk siswa/wali — tetap tampil walau staf sedang menyiapkan revisi. */
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
