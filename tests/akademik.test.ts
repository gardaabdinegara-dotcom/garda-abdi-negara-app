// Skenario dari aplikasi Presensi lama (tests/domain.test.mjs), dipindahkan ke struktur tab baru.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import {
  approveAttendance,
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
import { createQrToken, readQrToken, rotatingQrToken } from "../src/lib/auth/qr";
import { createEnrollment, createStudent, saveClass, saveProgram, setStudentActive, updateEnrollmentStatus } from "../src/lib/core/domain";
import { toEnrollment, toStudent, type Actor, type User } from "../src/lib/core/types";
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

function account(t: Tables, peran: "OWNER" | "PENGAJAR" | "SISWA" | "WALI", links: { jenis: "SISWA" | "WALI" | "PENGAJAR_KELAS"; siswa_id?: string; kelas_id?: string }[] = []): Actor {
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
