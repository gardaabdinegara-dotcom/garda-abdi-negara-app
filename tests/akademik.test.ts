// Skenario dari aplikasi Presensi lama (tests/domain.test.mjs), dipindahkan ke struktur tab baru.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import {
  addDays,
  addSessionType,
  approveAttendance,
  changeSessionType,
  deleteSession,
  describeWeekdays,
  isoWeekday,
  PRESENSI_TYPE_ARRANGEMENT_KEY,
  saveSessionScoped,
  saveSessionSeries,
  seriesDates,
  sessionTypeCatalog,
  sessionTypeLabels,
  archiveTest,
  attendanceSummary,
  buildReport,
  csvCell,
  currentReport,
  isLate,
  latestPublished,
  localClock,
  publishReport,
  recordAttendance,
  reviewSubmission,
  reviseReport,
  saveAssignment,
  saveHealth,
  saveReportNote,
  saveSession,
  saveTest,
  sessionTypeLabel,
  sessionTypeOptions,
  setSessionStatus,
  skdPasses,
  submitAssignment,
  submitAttendance,
  toAttendance,
  toHealth,
  toReport,
  toSession,
  toSubmission,
  visibleSession,
  type TestInput,
} from "../src/lib/core/akademik";
import { sessionDeleteInput, sessionInput, sessionSeriesInput, sessionTypeChangeInput } from "../src/lib/core/akademik-input";
import { createQrToken, readQrToken, rotatingQrToken } from "../src/lib/auth/qr";
import { createEnrollment, createStudent, saveClass, saveProgram, setStudentActive, updateEnrollmentStatus } from "../src/lib/core/domain";
import { toEnrollment, toStudent, type Actor, type Role, type User } from "../src/lib/core/types";
import { studentInput } from "../src/lib/core/validation";
import { runOperation, type OperationContext } from "../src/lib/data/coordinator";
import { AppError, type Tables } from "../src/lib/data/types";
import { ctx, emptyTables, freshDeps, INTI_TABLES, putUser, user } from "./helpers";

const DAY = "2026-11-13";
const PERIOD = "2026-11";

/** Konteks operasi pada jam lokal tertentu (WIB) di hari uji. */
const at = (time: string, actorId = "USR_tes"): OperationContext => {
  const [h, m] = time.split(":").map(Number);
  return { ...ctx(actorId), now: new Date(Date.UTC(2026, 10, 13, h! - 7, m!)).toISOString() };
};

function rejects(fn: () => unknown, pattern: RegExp | string) {
  assert.throws(fn, (error: unknown) => error instanceof AppError && (typeof pattern === "string" ? error.code === pattern : pattern.test(error.message)));
}

function linkRow(t: Tables, u: User, jenis: "SISWA" | "WALI" | "PENGAJAR_KELAS", target: { siswa_id?: string; kelas_id?: string }) {
  const row = { tautan_id: `TAU_${randomUUID()}`, user_id: u.user_id, jenis, siswa_id: target.siswa_id ?? "", kelas_id: target.kelas_id ?? "", aktif: true };
  t.Tautan_Akun!.push(row);
  return { ...row };
}

function account(t: Tables, peran: Role, links: { jenis: "SISWA" | "WALI" | "PENGAJAR_KELAS"; siswa_id?: string; kelas_id?: string }[] = []): Actor {
  const u = putUser(t, user(peran));
  return { user: u, links: links.map((l) => linkRow(t, u, l.jenis, l)) };
}

/** Lembaga kecil: kelas A (siswa a) dan kelas B (siswa b), satu pengajar kelas A, akun siswa & wali untuk a. */
async function fixture(date = DAY) {
  const t = await emptyTables();
  const owner = account(t, "OWNER");
  const program = saveProgram(t, { program_id: "", nama_program: "Reguler", target_seleksi: "Umum", aktif: true }, ctx(), owner).entityId;
  const kelasA = saveClass(t, { kelas_id: "", nama_kelas: "Intensif A", program_id: program, angkatan: "2026", aktif: true }, ctx(), owner).entityId;
  const kelasB = saveClass(t, { kelas_id: "", nama_kelas: "Intensif B", program_id: program, angkatan: "2026", aktif: true }, ctx(), owner).entityId;
  const input = (nama: string) => studentInput.parse({ nama, jenis_kelamin: "L", jalur_target: "TNI" });
  const a = createStudent(t, input("Siswa A"), ctx(), owner).entityId;
  const b = createStudent(t, input("Siswa B"), ctx(), owner).entityId;
  createEnrollment(t, { siswa_id: a, program_id: program, kelas_id: kelasA, tanggal_mulai: "2026-11-01" }, ctx(), owner);
  createEnrollment(t, { siswa_id: b, program_id: program, kelas_id: kelasB, tanggal_mulai: "2026-11-01" }, ctx(), owner);
  const teacher = account(t, "PENGAJAR", [{ jenis: "PENGAJAR_KELAS", kelas_id: kelasA }]);
  const siswa = account(t, "SISWA", [{ jenis: "SISWA", siswa_id: a }]);
  const siswaB = account(t, "SISWA", [{ jenis: "SISWA", siswa_id: b }]);
  const wali = account(t, "WALI", [{ jenis: "WALI", siswa_id: a }]);
  const sesi = saveSession(
    t,
    { sesi_id: "", nama: "Tes sesi", tanggal: date, jam_mulai: "07:00", jam_selesai: "10:00", jenis: "AKADEMIK", kelas_id: kelasA, pengajar_id: "" },
    ctx(),
    teacher,
  ).entityId;
  return { t, owner, program, kelasA, kelasB, a, b, teacher, siswa, siswaB, wali, sesi };
}

const session = (t: Tables, id: string) => toSession(t.Sesi!.find((r) => r.sesi_id === id)!);
const attendanceMap = (t: Tables) => new Map(t.Presensi!.map((r) => [String(r.presensi_id), toAttendance(r)]));
const summary = (t: Tables, siswaId: string) => attendanceSummary(siswaId, t.Sesi!.map(toSession), attendanceMap(t), PERIOD);
const test_ = (siswa_id: string, extra: Partial<TestInput>): TestInput => ({
  tes_id: "",
  siswa_id,
  kategori: "AKADEMIK",
  komponen: "numerik",
  nama_tes: "",
  tanggal: DAY,
  twk: "",
  tiu: "",
  tkp: "",
  skor: "",
  hasil_mentah: "",
  protokol: "",
  catatan: "",
  ...extra,
});
const reports = (t: Tables) => t.Rapor!.map(toReport);

describe("sesi dan presensi", () => {
  test("bidang bawaan ditampilkan dan bisa disimpan tanpa penyiapan spreadsheet", async () => {
    const { t, owner } = await fixture();
    const options = sessionTypeOptions(t);
    assert.deepEqual(options.map(({ label }) => label), ["Akademik", "SKD", "Psikotes", "Fisik", "KESWA (Kesehatan Jiwa)", "MI (Mental Ideologi)", "ADIRAGA"]);
    for (const { value, label } of options) {
      const input = sessionInput.parse({ nama: "Latihan", tanggal: DAY, jam_mulai: "07:00", jam_selesai: "09:00", jenis: value });
      const { entityId } = saveSession(t, input, ctx(), owner);
      assert.equal(sessionTypeLabel(session(t, entityId).jenis), label);
    }
  });

  test("admin dapat menambah bidang unik yang dipakai dalam sesi dan pengajar tidak dapat mengubah daftar", async () => {
    const { t, owner, teacher } = await fixture();
    const admin = account(t, "ADMIN");
    rejects(() => addSessionType(t, "Wawancara", ctx(), teacher), "FORBIDDEN");
    rejects(() => addSessionType(t, " keswa ", ctx(), admin), /sudah ada/);
    rejects(() => addSessionType(t, "MI  (Mental Ideologi)", ctx(), owner), /sudah ada/);
    addSessionType(t, "  Wawancara   Akhir  ", ctx(), admin);
    rejects(() => addSessionType(t, "wawancara akhir", ctx(), owner), /sudah ada/);

    const input = sessionInput.parse({ nama: "Latihan", tanggal: DAY, jam_mulai: "07:00", jam_selesai: "09:00", jenis: "Wawancara Akhir" });
    const { entityId } = saveSession(t, input, ctx(), owner);
    assert.equal(sessionTypeLabel(session(t, entityId).jenis), "Wawancara Akhir");
    rejects(() => saveSession(t, { ...input, sesi_id: entityId, jenis: "Belum terdaftar" }, ctx(), owner), /bidang yang tersedia/);

    // Sesi yang sudah tersimpan tetap bisa dirapikan meski bidang lamanya tidak ada di daftar.
    const setting = t.Pengaturan!.pop();
    assert.equal(setting?.value, "Wawancara Akhir");
    saveSession(t, { ...input, sesi_id: entityId, nama: "Jadwal wawancara" }, ctx(), owner);
    assert.equal(session(t, entityId).jenis, "Wawancara Akhir");
  });

  test("pengajuan menunggu sampai disahkan, unik per sesi/siswa, dan sesi tidak bisa ditutup selama ada yang menunggu", async () => {
    const f = await fixture();
    setSessionStatus(f.t, { sesi_id: f.sesi, status: "AKTIF" }, at("07:00"), f.teacher);
    submitAttendance(f.t, { sesi_id: f.sesi, status_diajukan: "HADIR", catatan: "" }, at("07:05"), f.siswa);
    assert.equal(attendanceMap(f.t).get(`${f.sesi}:${f.a}`)?.status, "MENUNGGU");
    rejects(() => submitAttendance(f.t, { sesi_id: f.sesi, status_diajukan: "HADIR", catatan: "" }, at("07:06"), f.siswa), /sudah tercatat/);
    rejects(() => setSessionStatus(f.t, { sesi_id: f.sesi, status: "SELESAI" }, at("09:00"), f.teacher), /menunggu/);
    approveAttendance(f.t, { sesi_id: f.sesi, siswa_id: f.a }, at("07:10"), f.teacher);
    setSessionStatus(f.t, { sesi_id: f.sesi, status: "SELESAI" }, at("10:00"), f.teacher);
    assert.deepEqual(summary(f.t, f.a), { total: 1, hadir: 1, terlambat: 0, izin: 0, sakit: 0, alfa: 0, persen: 100 });
    assert.equal(summary(f.t, f.b).total, 0, "siswa kelas lain tidak dihitung");
  });

  test("keterlambatan memakai toleransi lembaga (10 menit)", async () => {
    assert.equal(isLate("07:10", "07:00", 10), false);
    assert.equal(isLate("07:11", "07:00", 10), true);
    const f = await fixture();
    setSessionStatus(f.t, { sesi_id: f.sesi, status: "AKTIF" }, at("07:00"), f.teacher);
    submitAttendance(f.t, { sesi_id: f.sesi, status_diajukan: "HADIR", catatan: "" }, at("07:15"), f.siswa);
    assert.equal(attendanceMap(f.t).get(`${f.sesi}:${f.a}`)?.terlambat, true);
    approveAttendance(f.t, { sesi_id: f.sesi, siswa_id: "" }, at("07:20"), f.teacher);
    setSessionStatus(f.t, { sesi_id: f.sesi, status: "SELESAI" }, at("10:00"), f.teacher);
    assert.equal(summary(f.t, f.a).terlambat, 1);
    assert.equal(summary(f.t, f.a).hadir, 1, "terlambat tetap dihitung hadir");
  });

  test("sesi selesai tanpa catatan dihitung alfa", async () => {
    const f = await fixture();
    setSessionStatus(f.t, { sesi_id: f.sesi, status: "AKTIF" }, at("07:00"), f.teacher);
    setSessionStatus(f.t, { sesi_id: f.sesi, status: "SELESAI" }, at("10:00"), f.teacher);
    const s = summary(f.t, f.a);
    assert.equal(s.alfa, 1);
    assert.equal(s.hadir, 0);
    assert.equal(s.total, 1);
  });

  test("sesi dibatalkan tidak dihitung dan tidak menerima presensi", async () => {
    const f = await fixture();
    setSessionStatus(f.t, { sesi_id: f.sesi, status: "DIBATALKAN" }, at("07:00"), f.teacher);
    assert.equal(summary(f.t, f.a).total, 0);
    rejects(() => recordAttendance(f.t, { sesi_id: f.sesi, siswa_id: f.a, status: "HADIR", waktu: "", catatan: "" }, at("07:05"), f.teacher), /dibatalkan/);
  });

  test("peserta dibekukan saat sesi dibuka; pindah kelas tidak menghapus riwayat", async () => {
    const f = await fixture();
    setSessionStatus(f.t, { sesi_id: f.sesi, status: "AKTIF" }, at("07:00"), f.teacher);
    assert.deepEqual(session(f.t, f.sesi).peserta_ids, [f.a]);
    const enrollment = f.t.Pendaftaran!.map(toEnrollment).find((e) => e.siswa_id === f.a)!;
    updateEnrollmentStatus(f.t, { pendaftaran_id: enrollment.pendaftaran_id, status: "SELESAI", tanggal_selesai: DAY }, ctx(), f.owner);
    setSessionStatus(f.t, { sesi_id: f.sesi, status: "SELESAI" }, at("10:00"), f.teacher);
    assert.equal(summary(f.t, f.a).total, 1);
  });

  test("sesi hanya bisa dibuka pada tanggalnya", async () => {
    const f = await fixture("2026-11-14");
    rejects(() => setSessionStatus(f.t, { sesi_id: f.sesi, status: "AKTIF" }, at("07:00"), f.teacher), /tanggal kegiatannya/);
    rejects(() => recordAttendance(f.t, { sesi_id: f.sesi, siswa_id: f.a, status: "HADIR", waktu: "", catatan: "" }, at("07:00"), f.teacher), /akan datang/);
  });

  test("pengajar hanya mengelola sesinya sendiri di kelas yang diajarnya", async () => {
    const f = await fixture();
    const other = account(f.t, "PENGAJAR", [{ jenis: "PENGAJAR_KELAS", kelas_id: f.kelasA }]);
    rejects(() => setSessionStatus(f.t, { sesi_id: f.sesi, status: "AKTIF" }, at("07:00"), other), "FORBIDDEN");
    rejects(
      () => saveSession(f.t, { sesi_id: "", nama: "Sesi B", tanggal: DAY, jam_mulai: "08:00", jam_selesai: "09:00", jenis: "SKD", kelas_id: f.kelasB, pengajar_id: "" }, ctx(), f.teacher),
      "FORBIDDEN",
    );
    rejects(
      () => saveSession(f.t, { sesi_id: "", nama: "Terbalik", tanggal: DAY, jam_mulai: "09:00", jam_selesai: "08:00", jenis: "SKD", kelas_id: f.kelasA, pengajar_id: "" }, ctx(), f.teacher),
      /Jam mulai/,
    );
    // Admin boleh menunjuk pengajar, tetapi hanya pengajar yang ditautkan ke kelas itu.
    rejects(
      () => saveSession(f.t, { sesi_id: "", nama: "Sesi B", tanggal: DAY, jam_mulai: "08:00", jam_selesai: "09:00", jenis: "SKD", kelas_id: f.kelasB, pengajar_id: f.teacher.user.user_id }, ctx(), f.owner),
      /belum ditautkan/,
    );
  });

  test("wali tidak bisa mengajukan presensi; siswa kelas lain ditolak", async () => {
    const f = await fixture();
    setSessionStatus(f.t, { sesi_id: f.sesi, status: "AKTIF" }, at("07:00"), f.teacher);
    rejects(() => submitAttendance(f.t, { sesi_id: f.sesi, status_diajukan: "HADIR", catatan: "" }, at("07:05"), f.wali), "FORBIDDEN");
    rejects(() => submitAttendance(f.t, { sesi_id: f.sesi, status_diajukan: "HADIR", catatan: "" }, at("07:05"), f.siswaB), /tidak terdaftar/);
    rejects(() => submitAttendance(f.t, { sesi_id: f.sesi, status_diajukan: "IZIN", catatan: "" }, at("07:05"), f.siswa), /keterangan/);
  });

  test("pengajar bisa mengosongkan pengajuan agar siswa mengajukan ulang", async () => {
    const f = await fixture();
    setSessionStatus(f.t, { sesi_id: f.sesi, status: "AKTIF" }, at("07:00"), f.teacher);
    submitAttendance(f.t, { sesi_id: f.sesi, status_diajukan: "HADIR", catatan: "" }, at("07:05"), f.siswa);
    recordAttendance(f.t, { sesi_id: f.sesi, siswa_id: f.a, status: "KOSONG", waktu: "", catatan: "" }, at("07:06"), f.teacher);
    submitAttendance(f.t, { sesi_id: f.sesi, status_diajukan: "SAKIT", catatan: "Demam" }, at("07:07"), f.siswa);
    approveAttendance(f.t, { sesi_id: f.sesi, siswa_id: "" }, at("07:08"), f.teacher);
    assert.equal(attendanceMap(f.t).get(`${f.sesi}:${f.a}`)?.status, "SAKIT");
  });

  test("sesi terlihat sesuai peran", async () => {
    const f = await fixture();
    const s = session(f.t, f.sesi);
    const students = f.t.Siswa!.map(toStudent);
    const enrollments = f.t.Pendaftaran!.map(toEnrollment);
    const waliB = account(f.t, "WALI", [{ jenis: "WALI", siswa_id: f.b }]);
    const teacherB = account(f.t, "PENGAJAR", [{ jenis: "PENGAJAR_KELAS", kelas_id: f.kelasB }]);
    assert.equal(visibleSession(f.wali, s, students, enrollments), true);
    assert.equal(visibleSession(waliB, s, students, enrollments), false);
    assert.equal(visibleSession(f.siswaB, s, students, enrollments), false);
    assert.equal(visibleSession(teacherB, s, students, enrollments), false);
    assert.equal(visibleSession(f.owner, s, students, enrollments), true);
  });
});

describe("token QR presensi", () => {
  test("token sah, kedaluwarsa, dan dipalsukan", () => {
    const now = Date.now();
    const { token } = createQrToken("SES_1", now);
    assert.equal(readQrToken(token, now + 60_000), "SES_1");
    assert.equal(readQrToken(token, now + 11 * 60_000), null, "lewat 10 menit");
    assert.equal(readQrToken(`${token}x`, now), null);
    const forged = Buffer.from(JSON.stringify({ s: "SES_2", e: now + 60_000 })).toString("base64url");
    assert.equal(readQrToken(`${forged}.${token.split(".")[1]}`, now), null);
    assert.equal(readQrToken("", now), null);
  });

  test("QR layar penuh berganti tiap 10 menit; token sama dalam satu jendela dan masih sah sebentar setelah berganti", () => {
    const start = Date.UTC(2026, 10, 17, 9, 10); // 16.10 WIB
    const a = rotatingQrToken("SES_1", start + 60_000);
    const b = rotatingQrToken("SES_1", start + 9 * 60_000);
    assert.equal(a.token, b.token, "dimuat ulang dalam jendela yang sama → QR tidak berubah");
    assert.equal(a.rotatesAt, start + 10 * 60_000);
    assert.notEqual(rotatingQrToken("SES_1", start + 10 * 60_000).token, a.token, "jendela baru → QR baru");
    assert.equal(readQrToken(a.token, start + 12 * 60_000), "SES_1", "dipindai tepat sebelum berganti tetap sempat dikirim");
    assert.equal(readQrToken(a.token, start + 16 * 60_000), null);
  });
});

describe("nilai dan tes", () => {
  test("pengajar tidak bisa mengisi nilai siswa kelas lain", async () => {
    const f = await fixture();
    rejects(() => saveTest(f.t, test_(f.b, { skor: "70" }), ctx(), f.teacher), "FORBIDDEN");
    rejects(() => saveTest(f.t, test_(f.a, { skor: "70" }), ctx(), f.siswa), "FORBIDDEN");
  });

  test("nol dihitung dalam rata-rata, komponen kosong tetap kosong", async () => {
    const f = await fixture();
    for (const skor of ["100", "0"]) saveTest(f.t, test_(f.a, { skor }), ctx(), f.teacher);
    const report = buildReport(f.t, f.a, PERIOD, ctx().now);
    const academic = report.sections[0]!.rows;
    assert.equal(academic[0]!.score, 50);
    assert.equal(academic[2]!.score, null);
    assert.equal(academic[2]!.note, "Belum diisi");
  });

  test("SKD: ketiga komponen harus memenuhi acuan, total tinggi saja tidak cukup", async () => {
    const f = await fixture();
    saveTest(f.t, test_(f.a, { kategori: "SKD", twk: "150", tiu: "175", tkp: "155" }), ctx(), f.teacher);
    const skd = buildReport(f.t, f.a, PERIOD, ctx().now).sections[1]!;
    assert.equal(buildReport(f.t, f.a, PERIOD, ctx().now).summary.skd, 480);
    assert.match(skd.rows[2]!.note, /Di bawah acuan 156/);
    assert.equal(skdPasses({ twk: 150, tiu: 175, tkp: 155 }, { twk: 65, tiu: 80, tkp: 156 }), false);
    assert.equal(skdPasses({ twk: 65, tiu: 80, tkp: 156 }, { twk: 65, tiu: 80, tkp: 156 }), true);
  });

  test("nilai di luar rentang dan tanggal masa depan ditolak", async () => {
    const f = await fixture();
    rejects(() => saveTest(f.t, test_(f.a, { kategori: "SKD", twk: "151", tiu: "80", tkp: "166" }), ctx(), f.teacher), /TWK harus/);
    rejects(() => saveTest(f.t, test_(f.a, { skor: "101" }), ctx(), f.teacher), /Skor harus/);
    rejects(() => saveTest(f.t, test_(f.a, { skor: "" }), ctx(), f.teacher), /wajib/);
    rejects(() => saveTest(f.t, test_(f.a, { komponen: "lari", skor: "50" }), ctx(), f.teacher), /komponen/);
    rejects(() => saveTest(f.t, test_(f.a, { tanggal: "2026-11-14", skor: "50" }), ctx(), f.teacher), /masa depan/);
    rejects(() => saveTest(f.t, test_(f.a, { kategori: "FISIK", komponen: "lari", skor: "80", hasil_mentah: "20000" }), ctx(), f.teacher), /Hasil asli/);
  });

  test("hasil tes yang diarsipkan tidak dihitung", async () => {
    const f = await fixture();
    const id = saveTest(f.t, test_(f.a, { skor: "40" }), ctx(), f.teacher).entityId;
    saveTest(f.t, test_(f.a, { skor: "80" }), ctx(), f.teacher);
    archiveTest(f.t, id, ctx(), f.teacher);
    assert.equal(buildReport(f.t, f.a, PERIOD, ctx().now).sections[0]!.rows[0]!.score, 80);
  });
});

describe("kesehatan", () => {
  test("tekanan darah harus berpasangan; isian kosong tetap kosong", async () => {
    const f = await fixture();
    const base = { siswa_id: f.a, tanggal: DAY, tinggi_cm: "170", berat_kg: "", sistolik: "", diastolik: "", catatan: "" };
    rejects(() => saveHealth(f.t, { ...base, sistolik: "120" }, ctx(), f.teacher), /berpasangan/);
    rejects(() => saveHealth(f.t, { ...base, tinggi_cm: "" }, ctx(), f.teacher), /setidaknya satu/);
    saveHealth(f.t, { ...base, catatan: "Sehat" }, ctx(), f.teacher);
    const health = toHealth(f.t.Kesehatan![0]!);
    assert.equal(health.tinggi_cm, 170);
    assert.equal(health.berat_kg, null);
    assert.equal(health.sistolik, null);
  });
});

describe("tugas", () => {
  test("siswa mengirim tautan, pengajar menilai, dan setelah diperiksa tidak bisa dikirim ulang", async () => {
    const f = await fixture();
    const tugas = saveAssignment(f.t, { tugas_id: "", nama: "Latihan TIU", bidang: "SKD", kelas_id: f.kelasA, tenggat: "2026-11-20", instruksi: "", aktif: true }, ctx(), f.teacher).entityId;
    rejects(() => submitAssignment(f.t, { tugas_id: tugas, tautan: "drive.google.com/x", catatan: "" }, ctx(), f.siswa), /https/);
    rejects(() => submitAssignment(f.t, { tugas_id: tugas, tautan: "https://contoh.id/x", catatan: "" }, ctx(), f.wali), "FORBIDDEN");
    rejects(() => submitAssignment(f.t, { tugas_id: tugas, tautan: "https://contoh.id/x", catatan: "" }, ctx(), f.siswaB), "FORBIDDEN");
    submitAssignment(f.t, { tugas_id: tugas, tautan: "https://contoh.id/hasil", catatan: "" }, ctx(), f.siswa);
    rejects(() => reviewSubmission(f.t, { tugas_id: tugas, siswa_id: f.a, status: "DIPERIKSA", nilai: "", catatan: "" }, ctx(), f.teacher), /wajib/);
    reviewSubmission(f.t, { tugas_id: tugas, siswa_id: f.a, status: "DIPERIKSA", nilai: "85", catatan: "Bagus" }, ctx(), f.teacher);
    const sub = toSubmission(f.t.Pengumpulan![0]!);
    assert.equal(sub.nilai, 85);
    assert.equal(sub.tautan, "https://contoh.id/hasil");
    rejects(() => submitAssignment(f.t, { tugas_id: tugas, tautan: "https://contoh.id/baru", catatan: "" }, ctx(), f.siswa), /sudah diperiksa/);
  });

  test("tugas semua kelas hanya oleh admin; pengajar hanya kelasnya", async () => {
    const f = await fixture();
    const base = { tugas_id: "", nama: "Tugas", bidang: "AKADEMIK" as const, tenggat: "2026-11-20", instruksi: "", aktif: true };
    rejects(() => saveAssignment(f.t, { ...base, kelas_id: "" }, ctx(), f.teacher), "FORBIDDEN");
    rejects(() => saveAssignment(f.t, { ...base, kelas_id: f.kelasB }, ctx(), f.teacher), "FORBIDDEN");
    saveAssignment(f.t, { ...base, kelas_id: "" }, ctx(), f.owner);
  });
});

describe("rapor", () => {
  test("rapor terbit tidak berubah walau nilai diubah kemudian; draf tidak bisa disimpan saat terbit", async () => {
    const f = await fixture();
    saveTest(f.t, test_(f.a, { skor: "80" }), ctx(), f.teacher);
    rejects(() => publishReport(f.t, { siswa_id: f.a, periode: PERIOD, catatan: "" }, ctx(), f.teacher), "FORBIDDEN");
    publishReport(f.t, { siswa_id: f.a, periode: PERIOD, catatan: "" }, ctx(), f.owner);
    saveTest(f.t, test_(f.a, { skor: "0" }), ctx(), f.teacher);
    const published = latestPublished(reports(f.t), f.a, PERIOD)!;
    assert.equal(published.snapshot!.sections[0]!.rows[0]!.score, 80);
    assert.equal(buildReport(f.t, f.a, PERIOD, ctx().now).sections[0]!.rows[0]!.score, 40);
    rejects(() => saveReportNote(f.t, { siswa_id: f.a, periode: PERIOD, catatan: "Edit" }, ctx(), f.teacher), /revisi draf/);
  });

  test("wali tetap melihat versi terbit terakhir saat admin menyiapkan revisi", async () => {
    const f = await fixture();
    publishReport(f.t, { siswa_id: f.a, periode: PERIOD, catatan: "Versi 1" }, ctx(), f.owner);
    rejects(() => publishReport(f.t, { siswa_id: f.a, periode: PERIOD, catatan: "" }, ctx(), f.owner), /revisi draf/);
    reviseReport(f.t, { siswa_id: f.a, periode: PERIOD }, ctx(), f.owner);
    const draft = currentReport(reports(f.t), f.a, PERIOD)!;
    assert.equal(draft.status, "DRAF");
    assert.equal(draft.versi, 2);
    const visible = latestPublished(reports(f.t), f.a, PERIOD)!;
    assert.equal(visible.versi, 1);
    assert.equal(visible.catatan, "Versi 1");
    publishReport(f.t, { siswa_id: f.a, periode: PERIOD, catatan: "Versi 2" }, ctx(), f.owner);
    assert.equal(latestPublished(reports(f.t), f.a, PERIOD)!.versi, 2);
    assert.equal(reports(f.t).filter((r) => r.status === "TERBIT" && r.rapor_id.includes(":v")).length, 2, "riwayat versi tersimpan");
  });

  test("siswa nonaktif: rapor terbit tetap ada, nilai baru ditolak", async () => {
    const f = await fixture();
    publishReport(f.t, { siswa_id: f.a, periode: PERIOD, catatan: "Arsip terbit" }, ctx(), f.owner);
    setStudentActive(f.t, f.a, false, ctx(), f.owner);
    assert.equal(latestPublished(reports(f.t), f.a, PERIOD)?.catatan, "Arsip terbit");
    rejects(() => saveTest(f.t, test_(f.a, { skor: "80" }), ctx(), f.teacher), /Siswa tidak ditemukan/);
  });

  test("rapor memuat tujuh bagian", async () => {
    const f = await fixture();
    const report = buildReport(f.t, f.a, PERIOD, ctx().now);
    assert.deepEqual(
      report.sections.map((s) => s.title),
      ["Akademik", "Seleksi Kompetensi Dasar", "Psikotes", "Perkembangan fisik", "Tugas", "Kesehatan", "Kehadiran"],
    );
    assert.equal(report.student.kelas, "Intensif A");
  });
});

describe("penyimpanan bersamaan", () => {
  test("pengajuan presensi dan penutupan sesi bersamaan tidak menghasilkan keadaan bertentangan", async () => {
    const deps = await freshDeps();
    const today = localClock("Asia/Jakarta", new Date().toISOString()).date;
    let f!: Awaited<ReturnType<typeof fixture>>;
    // Siapkan data di penyimpanan palsu lewat koordinator.
    const seeded = await fixture(today);
    seeded.t.Sesi!.forEach((row) => (row.status = "AKTIF"));
    seeded.t.Sesi!.forEach((row) => (row.peserta_ids = seeded.a));
    await runOperation(deps, {
      sheet: "inti",
      operationId: randomUUID(),
      actorId: "SISTEM",
      action: "uji",
      fingerprint: {},
      tables: INTI_TABLES,
      apply: (t) => {
        for (const [name, list] of Object.entries(seeded.t)) if (name !== "Pengaturan") t[name]!.push(...list);
        return { entityType: "Uji", entityId: "seed", message: "ok" };
      },
    });
    f = seeded;
    const tables = ["Pengaturan", "Siswa", "Pendaftaran", "Sesi", "Presensi"];
    const results = await Promise.allSettled([
      runOperation(deps, { sheet: "inti", operationId: randomUUID(), actorId: f.siswa.user.user_id, action: "ajukan", fingerprint: 1, tables, apply: (t, c) => submitAttendance(t, { sesi_id: f.sesi, status_diajukan: "HADIR", catatan: "" }, c, f.siswa) }),
      runOperation(deps, { sheet: "inti", operationId: randomUUID(), actorId: f.teacher.user.user_id, action: "tutup", fingerprint: 2, tables, apply: (t, c) => setSessionStatus(t, { sesi_id: f.sesi, status: "SELESAI" }, c, f.teacher) }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const after = await deps.store.read("inti", ["Sesi", "Presensi"]);
    const closed = after.Sesi!.map(toSession).find((s) => s.sesi_id === f.sesi)!.status === "SELESAI";
    const pending = after.Presensi!.some((r) => r.status === "MENUNGGU");
    assert.ok(!(closed && pending), "sesi selesai tidak boleh menyisakan pengajuan menunggu");
  });
});

describe("ekspor CSV", () => {
  test("sel diberi kutip dan rumus dinetralkan", () => {
    assert.equal(csvCell('Andi "A"'), '"Andi ""A"""');
    assert.equal(csvCell("=HYPERLINK(1)"), `"'=HYPERLINK(1)"`);
    assert.equal(csvCell("+62812"), `"'+62812"`);
    assert.equal(csvCell(null), '""');
  });
});

describe("sesi untuk semua siswa dan QR langsung sah (arah 17 Nov 2026)", () => {
  const semua = (f: Awaited<ReturnType<typeof fixture>>, actor: Actor) =>
    saveSession(f.t, { sesi_id: "", nama: "Latihan jasmani", tanggal: DAY, jam_mulai: "07:00", jam_selesai: "09:00", jenis: "FISIK", kelas_id: "", pengajar_id: "" }, ctx(), actor).entityId;

  test("sesi tanpa kelas berisi semua siswa aktif, dibekukan saat dibuka", async () => {
    const f = await fixture();
    const sesi = semua(f, f.owner);
    setSessionStatus(f.t, { sesi_id: sesi, status: "AKTIF" }, at("07:00"), f.owner);
    assert.deepEqual([...session(f.t, sesi).peserta_ids].sort(), [f.a, f.b].sort());
    submitAttendance(f.t, { sesi_id: sesi, status_diajukan: "HADIR", catatan: "" }, at("07:02"), f.siswa);
    submitAttendance(f.t, { sesi_id: sesi, status_diajukan: "HADIR", catatan: "" }, at("07:03"), f.siswaB);
    assert.equal(attendanceMap(f.t).get(`${sesi}:${f.b}`)?.status, "MENUNGGU");
  });

  test("pengajar tidak bisa membuat sesi untuk semua siswa", async () => {
    const f = await fixture();
    rejects(() => semua(f, f.teacher), "FORBIDDEN");
  });

  test("bila diizinkan, hadir lewat QR langsung sah; izin dan pengajuan mandiri tetap menunggu", async () => {
    const f = await fixture();
    f.t.Pengaturan!.find((row) => row.key === "presensi_qr_langsung_sah")!.value = true;
    const sesi = semua(f, f.owner);
    setSessionStatus(f.t, { sesi_id: sesi, status: "AKTIF" }, at("07:00"), f.owner);
    const out = submitAttendance(f.t, { sesi_id: sesi, status_diajukan: "HADIR", catatan: "" }, at("07:04"), f.siswa, "QR");
    const record = attendanceMap(f.t).get(`${sesi}:${f.a}`)!;
    assert.equal(record.status, "HADIR");
    assert.equal(record.disahkan_oleh, "QR");
    assert.match(out.message, /tercatat/);
    submitAttendance(f.t, { sesi_id: sesi, status_diajukan: "HADIR", catatan: "" }, at("07:05"), f.siswaB, "MANDIRI");
    assert.equal(attendanceMap(f.t).get(`${sesi}:${f.b}`)?.status, "MENUNGGU");
  });

  test("tanpa izin owner, hadir lewat QR tetap menunggu", async () => {
    const f = await fixture();
    const sesi = semua(f, f.owner);
    setSessionStatus(f.t, { sesi_id: sesi, status: "AKTIF" }, at("07:00"), f.owner);
    submitAttendance(f.t, { sesi_id: sesi, status_diajukan: "HADIR", catatan: "" }, at("07:04"), f.siswa, "QR");
    assert.equal(attendanceMap(f.t).get(`${sesi}:${f.a}`)?.status, "MENUNGGU");
  });
});

describe("sesi berulang (Ulangi)", () => {
  // Hari uji (DAY) = Jumat 13 November 2026, pukul 10.00 WIB.
  const base = { sesi_id: "", nama: "Latihan jasmani pagi", jam_mulai: "06:00", jam_selesai: "08:00", jenis: "FISIK", kelas_id: "", pengajar_id: "" };
  const seriesOf = (t: Tables, seriId: string) =>
    t.Sesi!.map(toSession)
      .filter((s) => s.seri_id === seriId)
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal));

  test("tanggal seri mengikuti hari terpilih dan ringkasannya mudah dibaca", () => {
    assert.equal(isoWeekday("2026-11-23"), 1);
    assert.equal(isoWeekday("2026-11-29"), 7);
    const dates = seriesDates("2026-11-23", "2026-12-20", [1, 2, 3, 4, 5, 6]);
    assert.equal(dates.length, 24);
    assert.equal(dates[0], "2026-11-23");
    assert.equal(dates.at(-1), "2026-12-19");
    assert.ok(!dates.includes("2026-11-29"), "Minggu tidak dipilih");
    assert.deepEqual(seriesDates("2026-11-30", "2026-11-23", [1]), [], "rentang terbalik");
    assert.deepEqual(seriesDates("2026-11-01", addDays("2026-11-01", 93), [1]), [], "lebih dari tiga bulan");
    assert.equal(describeWeekdays([1, 2, 3, 4, 5, 6]), "Senin sampai Sabtu");
    assert.equal(describeWeekdays([4, 2]), "Selasa dan Kamis");
    assert.equal(describeWeekdays([1, 3, 5]), "Sen, Rab, Jum");
    assert.equal(describeWeekdays([7]), "Setiap Minggu");
    assert.equal(describeWeekdays([1, 2, 3, 4, 5, 6, 7]), "Setiap hari");
  });

  test("isian Ulangi: hari wajib, unik, dan sampai tanggal tidak boleh sebelum tanggal mulai", () => {
    const ok = sessionSeriesInput.parse({ nama: "Latihan", tanggal: "2026-11-23", jam_mulai: "06:00", jam_selesai: "08:00", jenis: "FISIK", sampai: "2026-12-20", hari: ["3", "1", "3"] });
    assert.deepEqual(ok.hari, [1, 3]);
    const noDay = sessionSeriesInput.safeParse({ nama: "Latihan", tanggal: "2026-11-23", jam_mulai: "06:00", jam_selesai: "08:00", jenis: "FISIK", sampai: "2026-12-20", hari: [] });
    assert.equal(noDay.success, false);
    assert.equal(noDay.error?.issues[0]?.path[0], "hari");
    const backwards = sessionSeriesInput.safeParse({ nama: "Latihan", tanggal: "2026-11-23", jam_mulai: "06:00", jam_selesai: "08:00", jenis: "FISIK", sampai: "2026-11-20", hari: ["1"] });
    assert.equal(backwards.success, false);
    assert.equal(backwards.error?.issues[0]?.path[0], "sampai");
    assert.equal(sessionSeriesInput.safeParse({ ...ok, sesi_id: "SES_1", hari: ["1"] }).success, false, "Ulangi hanya untuk sesi baru");
    assert.deepEqual(sessionDeleteInput.parse({ sesi_id: "SES_1", lingkup: "aneh" }), { sesi_id: "SES_1", lingkup: "satu" });
  });

  test("satu seri berbagi seri_id; tanggal lewat dan sesi kembar dilewati", async () => {
    const f = await fixture();
    // Sesi kembar (nama sama tanpa beda huruf besar, jam mulai sama) pada Senin 16 Nov.
    saveSession(f.t, { ...base, nama: "latihan  jasmani PAGI", tanggal: "2026-11-16" }, ctx(), f.owner);
    // Jam mulai berbeda pada Rabu 18 Nov tidak dianggap kembar.
    saveSession(f.t, { ...base, tanggal: "2026-11-18", jam_mulai: "15:30", jam_selesai: "17:00" }, ctx(), f.owner);
    const out = saveSessionSeries(f.t, { ...base, tanggal: "2026-11-09", sampai: "2026-11-21", hari: [1, 3, 5] }, ctx(), f.owner);
    const series = seriesOf(f.t, out.data!.seri_id);
    // Sen/Rab/Jum 9 sampai 21 Nov: 9 dan 11 sudah lewat, 16 kembar.
    assert.deepEqual(series.map((s) => s.tanggal), ["2026-11-13", "2026-11-18", "2026-11-20"]);
    assert.equal(out.data!.jumlah, 3);
    assert.equal(out.entityId, series[0]!.sesi_id);
    assert.ok(series.every((s) => s.status === "AKAN_DATANG" && s.jenis === "FISIK" && s.jam_mulai === "06:00" && s.nama === base.nama));
    assert.match(out.message, /3 sesi berulang/);
    assert.match(out.message, /2 tanggal yang sudah lewat/);
    assert.match(out.message, /1 tanggal dilewati/);
    assert.equal(session(f.t, f.sesi).seri_id, "", "sesi tunggal tidak punya seri");
  });

  test("batas seri: paling banyak 62 sesi, rentang sekitar 3 bulan, dan aturan sesi tetap berlaku", async () => {
    const f = await fixture();
    const count = f.t.Sesi!.length;
    rejects(() => saveSessionSeries(f.t, { ...base, tanggal: DAY, sampai: addDays(DAY, 91), hari: [1, 2, 3, 4, 5, 6, 7] }, ctx(), f.owner), /paling banyak 62/);
    rejects(() => saveSessionSeries(f.t, { ...base, tanggal: DAY, sampai: addDays(DAY, 93), hari: [1] }, ctx(), f.owner), /paling panjang/);
    rejects(() => saveSessionSeries(f.t, { ...base, tanggal: "2026-11-02", sampai: "2026-11-12", hari: [1, 2, 3] }, ctx(), f.owner), /sudah lewat/);
    rejects(() => saveSessionSeries(f.t, { ...base, tanggal: "2026-11-16", sampai: "2026-11-20", hari: [6, 7] }, ctx(), f.owner), /hari terpilih/);
    rejects(() => saveSessionSeries(f.t, { ...base, tanggal: "2026-11-16", sampai: "2026-11-20", hari: [1] }, ctx(), f.teacher), "FORBIDDEN");
    rejects(() => saveSessionSeries(f.t, { ...base, jam_mulai: "09:00", tanggal: "2026-11-16", sampai: "2026-11-20", hari: [1] }, ctx(), f.owner), /Jam mulai/);
    assert.equal(f.t.Sesi!.length, count, "tidak ada sesi yang tersimpan sebagian");
    // Pengajar boleh membuat seri untuk kelas yang diajarnya.
    const own = saveSessionSeries(f.t, { ...base, kelas_id: f.kelasA, tanggal: "2026-11-16", sampai: "2026-11-27", hari: [2, 4] }, ctx(), f.teacher);
    assert.equal(seriesOf(f.t, own.data!.seri_id).length, 4);
  });

  test("seluruh seri tersimpan dalam satu operasi; bila gagal tidak ada yang tersimpan", async () => {
    const deps = await freshDeps();
    const today = localClock("Asia/Jakarta", new Date().toISOString()).date;
    const seeded = await fixture(today);
    await runOperation(deps, {
      sheet: "inti",
      operationId: randomUUID(),
      actorId: "SISTEM",
      action: "uji",
      fingerprint: {},
      tables: INTI_TABLES,
      apply: (t) => {
        for (const [name, list] of Object.entries(seeded.t)) if (name !== "Pengaturan") t[name]!.push(...list);
        return { entityType: "Uji", entityId: "seed", message: "ok" };
      },
    });
    const tables = ["Pengaturan", "Pengguna", "Tautan_Akun", "Kelas", "Sesi", "Presensi"];
    const before = (await deps.store.read("inti", ["Sesi"])).Sesi!.length;
    await assert.rejects(
      runOperation(deps, {
        sheet: "inti",
        operationId: randomUUID(),
        actorId: seeded.owner.user.user_id,
        action: "simpanSesiBerulang",
        fingerprint: 1,
        tables,
        apply: (t, c) => saveSessionSeries(t, { ...base, tanggal: today, sampai: addDays(today, 90), hari: [1, 2, 3, 4, 5, 6, 7] }, c, seeded.owner),
      }),
      /paling banyak 62/,
    );
    assert.equal((await deps.store.read("inti", ["Sesi"])).Sesi!.length, before);
    const result = await runOperation(deps, {
      sheet: "inti",
      operationId: randomUUID(),
      actorId: seeded.owner.user.user_id,
      action: "simpanSesiBerulang",
      fingerprint: 2,
      tables,
      apply: (t, c) => saveSessionSeries(t, { ...base, tanggal: today, sampai: addDays(today, 27), hari: [1, 2, 3, 4, 5, 6] }, c, seeded.owner),
    });
    const after = (await deps.store.read("inti", ["Sesi"])).Sesi!.map(toSession);
    const seri = after.filter((s) => s.seri_id && s.seri_id === (result.outcome.data as { seri_id: string }).seri_id);
    assert.equal(after.length, before + seri.length);
    assert.equal(seri.length, 24, "empat minggu Senin sampai Sabtu");
  });

  /** Seri Senin sampai Sabtu 16 sampai 28 Nov (12 sesi) dengan beberapa sesi yang tidak boleh ikut diubah. */
  async function seriesFixture() {
    const f = await fixture();
    const out = saveSessionSeries(f.t, { ...base, tanggal: "2026-11-16", sampai: "2026-11-28", hari: [1, 2, 3, 4, 5, 6] }, ctx(), f.owner);
    const ids = seriesOf(f.t, out.data!.seri_id).map((s) => s.sesi_id);
    assert.equal(ids.length, 12);
    setSessionStatus(f.t, { sesi_id: ids[3]!, status: "DIBATALKAN" }, ctx(), f.owner); // Kam 19 Nov dibatalkan
    f.t.Presensi!.push({
      presensi_id: `${ids[5]}:${f.a}`,
      sesi_id: ids[5]!,
      siswa_id: f.a,
      status: "IZIN",
      status_diajukan: "",
      metode: "PENGAJAR",
      waktu: "06:00",
      terlambat: false,
      catatan: "Acara keluarga",
      disahkan_oleh: "",
      disahkan_pada: "",
    }); // Sab 21 Nov sudah ada presensi
    f.t.Sesi!.find((r) => r.sesi_id === ids[7])!.status = "SELESAI"; // Sel 24 Nov: keadaan yang tidak boleh disentuh
    return { ...f, ids, seriId: out.data!.seri_id };
  }

  test("ubah sesi ini dan berikutnya: hanya sesi yang belum berjalan dan tanpa presensi yang ikut", async () => {
    const f = await seriesFixture();
    const target = session(f.t, f.ids[1]!);
    const input = { sesi_id: target.sesi_id, nama: "Latihan jasmani", tanggal: target.tanggal, jam_mulai: "06:30", jam_selesai: "08:30", jenis: "FISIK", kelas_id: "", pengajar_id: "" };
    const out = saveSessionScoped(f.t, { ...input, lingkup: "seri" }, ctx(), f.owner);
    const changed = (id: string) => session(f.t, id).jam_mulai === "06:30" && session(f.t, id).nama === "Latihan jasmani";
    assert.equal(changed(f.ids[0]!), false, "sesi sebelumnya tidak ikut");
    assert.equal(changed(f.ids[1]!), true);
    assert.equal(changed(f.ids[2]!), true);
    assert.equal(changed(f.ids[3]!), false, "sesi dibatalkan tidak ikut");
    assert.equal(changed(f.ids[5]!), false, "sesi dengan presensi tidak ikut");
    assert.equal(changed(f.ids[7]!), false, "sesi selesai tidak ikut");
    assert.ok(f.ids.slice(8).every(changed));
    assert.deepEqual(
      f.ids.map((id) => session(f.t, id).tanggal),
      seriesDates("2026-11-16", "2026-11-28", [1, 2, 3, 4, 5, 6]),
      "tanggal tiap sesi tetap",
    );
    assert.match(out.message, /Sesi ini dan 7 sesi berikutnya/);
    assert.match(out.message, /3 sesi yang sudah berjalan/);

    // Hanya sesi ini.
    const third = session(f.t, f.ids[2]!);
    saveSessionScoped(f.t, { ...input, sesi_id: third.sesi_id, tanggal: third.tanggal, jam_mulai: "07:00", jam_selesai: "09:00", lingkup: "satu" }, ctx(), f.owner);
    assert.equal(session(f.t, f.ids[2]!).jam_mulai, "07:00");
    assert.equal(session(f.t, f.ids[4]!).jam_mulai, "06:30");
  });

  test("hapus sesi ini dan berikutnya: sesi selesai dan sesi dengan presensi tetap tersimpan", async () => {
    const f = await seriesFixture();
    const rowsBefore = f.t.Sesi!.length;
    rejects(() => deleteSession(f.t, { sesi_id: f.ids[4]!, lingkup: "seri" }, ctx(), f.teacher), "FORBIDDEN");
    deleteSession(f.t, { sesi_id: f.ids[9]!, lingkup: "satu" }, ctx(), f.owner);
    assert.equal(session(f.t, f.ids[9]!).status, "DIHAPUS");
    assert.equal(session(f.t, f.ids[10]!).status, "AKAN_DATANG");
    const out = deleteSession(f.t, { sesi_id: f.ids[4]!, lingkup: "seri" }, ctx(), f.owner);
    assert.deepEqual(
      f.ids.map((id) => session(f.t, id).status),
      ["AKAN_DATANG", "AKAN_DATANG", "AKAN_DATANG", "DIBATALKAN", "DIHAPUS", "AKAN_DATANG", "DIHAPUS", "SELESAI", "DIHAPUS", "DIHAPUS", "DIHAPUS", "DIHAPUS"],
    );
    assert.equal(f.t.Sesi!.length, rowsBefore, "baris tidak pernah dibuang");
    assert.match(out.message, /^5 sesi dihapus/);
    assert.match(out.message, /2 sesi yang sudah berjalan/);
    // Sesi tunggal tetap memakai jalur hapus biasa.
    assert.equal(deleteSession(f.t, { sesi_id: f.sesi, lingkup: "seri" }, ctx(), f.owner).message, "Sesi dihapus.");
  });
});

describe("bidang presensi bisa dikelola", () => {
  test("ubah nama hanya mengganti label; sesi tetap menyimpan kode bidang", async () => {
    const { t, owner } = await fixture();
    const { entityId } = saveSession(t, { sesi_id: "", nama: "Pembinaan", tanggal: DAY, jam_mulai: "13:00", jam_selesai: "14:00", jenis: "MI", kelas_id: "", pengajar_id: "" }, ctx(), owner);
    changeSessionType(t, { value: "MI", aksi: "ubah", nama: "  Mental   Ideologi ", tampil: true }, ctx(), owner);
    assert.equal(session(t, entityId).jenis, "MI");
    assert.equal(sessionTypeLabel("MI", sessionTypeLabels(t)), "Mental Ideologi");
    assert.equal(sessionTypeLabel("MI"), "MI (Mental Ideologi)", "tanpa daftar label tetap memakai label bawaan");
    assert.ok(sessionTypeOptions(t).some((o) => o.value === "MI" && o.label === "Mental Ideologi"));
    // Nama tidak boleh sama dengan bidang lain (kode, nama tampilan, atau nama bawaan).
    rejects(() => changeSessionType(t, { value: "SKD", aksi: "ubah", nama: "fisik", tampil: true }, ctx(), owner), /sudah dipakai/);
    rejects(() => changeSessionType(t, { value: "SKD", aksi: "ubah", nama: "mental ideologi", tampil: true }, ctx(), owner), /sudah dipakai/);
    rejects(() => addSessionType(t, "Mental Ideologi", ctx(), owner), /sudah ada/);
    // Kembali ke nama bawaan menghapus nama tampilan.
    changeSessionType(t, { value: "MI", aksi: "ubah", nama: "MI (Mental Ideologi)", tampil: true }, ctx(), owner);
    const stored = JSON.parse(String(t.Pengaturan!.find((r) => r.key === PRESENSI_TYPE_ARRANGEMENT_KEY)!.value));
    assert.deepEqual(stored.nama, {});
  });

  test("bidang tersembunyi hilang dari pilihan sesi baru, tetapi tetap melabeli sesi lama", async () => {
    const { t, owner, teacher } = await fixture();
    addSessionType(t, "Renang", ctx(), owner);
    const old = saveSession(t, { sesi_id: "", nama: "Renang pagi", tanggal: DAY, jam_mulai: "06:00", jam_selesai: "07:00", jenis: "Renang", kelas_id: "", pengajar_id: "" }, ctx(), owner).entityId;
    changeSessionType(t, { value: "Renang", aksi: "ubah", nama: "Renang laut", tampil: false }, ctx(), owner);
    assert.ok(!sessionTypeOptions(t).some((o) => o.value === "Renang"));
    assert.equal(sessionTypeLabels(t).Renang, "Renang laut");
    assert.equal(sessionTypeCatalog(t).find((e) => e.value === "Renang")?.hidden, true);
    const input = { sesi_id: "", nama: "Renang sore", tanggal: DAY, jam_mulai: "16:00", jam_selesai: "17:00", jenis: "Renang", kelas_id: "", pengajar_id: "" };
    rejects(() => saveSession(t, input, ctx(), owner), /bidang yang tersedia/);
    // Sesi lama masih bisa dirapikan dengan bidangnya.
    saveSession(t, { ...input, sesi_id: old, nama: "Renang pagi (koreksi)", jam_mulai: "06:00", jam_selesai: "07:00" }, ctx(), owner);
    assert.equal(session(t, old).jenis, "Renang");
    changeSessionType(t, { value: "Renang", aksi: "tampil" }, ctx(), owner);
    assert.ok(sessionTypeOptions(t).some((o) => o.value === "Renang" && o.label === "Renang laut"));
    rejects(() => changeSessionType(t, { value: "Renang", aksi: "sembunyi" }, ctx(), teacher), "FORBIDDEN");
    rejects(() => changeSessionType(t, { value: "Tidak ada", aksi: "sembunyi" }, ctx(), owner), "NOT_FOUND");
  });

  test("urutan bisa diatur naik/turun dan minimal satu bidang tetap tampil", async () => {
    const { t, owner } = await fixture();
    const order = () => sessionTypeOptions(t).map((o) => o.value);
    assert.deepEqual(order(), ["AKADEMIK", "SKD", "PSIKOTES", "FISIK", "KESWA", "MI", "ADIRAGA"]);
    for (let i = 0; i < 3; i += 1) changeSessionType(t, { value: "FISIK", aksi: "naik" }, ctx(), owner);
    assert.deepEqual(order().slice(0, 2), ["FISIK", "AKADEMIK"]);
    assert.match(changeSessionType(t, { value: "FISIK", aksi: "naik" }, ctx(), owner).message, /tidak berubah/);
    changeSessionType(t, { value: "AKADEMIK", aksi: "turun" }, ctx(), owner);
    assert.deepEqual(order().slice(0, 3), ["FISIK", "SKD", "AKADEMIK"]);
    // Bidang baru masuk di akhir daftar.
    addSessionType(t, "Wawancara", ctx(), owner);
    assert.equal(order().at(-1), "Wawancara");
    for (const value of order().slice(1)) changeSessionType(t, { value, aksi: "sembunyi" }, ctx(), owner);
    assert.deepEqual(order(), ["FISIK"]);
    rejects(() => changeSessionType(t, { value: "FISIK", aksi: "sembunyi" }, ctx(), owner), /minimal satu/);
    // Susunan rusak di spreadsheet tidak merusak daftar.
    t.Pengaturan!.find((r) => r.key === PRESENSI_TYPE_ARRANGEMENT_KEY)!.value = "{rusak";
    assert.equal(order().length, 8);
  });

  test("isian ubah bidang divalidasi", () => {
    assert.deepEqual(sessionTypeChangeInput.parse({ value: "MI", aksi: "ubah", nama: "  Mental  Ideologi ", tampil: true }), { value: "MI", aksi: "ubah", nama: "Mental Ideologi", tampil: true });
    assert.equal(sessionTypeChangeInput.safeParse({ value: "MI", aksi: "ubah", nama: " " }).success, false);
    assert.equal(sessionTypeChangeInput.safeParse({ value: "MI", aksi: "hapus" }).success, false);
    assert.deepEqual(sessionTypeChangeInput.parse({ value: "FISIK", aksi: "naik", nama: "abaikan" }), { value: "FISIK", aksi: "naik" });
  });
});
