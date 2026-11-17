import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  addLink,
  createEnrollment,
  createStudent,
  createUser,
  deleteStudent,
  formatStudentCode,
  revokeSessions,
  saveClass,
  saveProgram,
  setStudentActive,
  setting,
  updateEnrollmentStatus,
  updateUser,
} from "../src/lib/core/domain";
import { createStudentAccount } from "../src/lib/core/pin";
import { studentInput, type StudentInput } from "../src/lib/core/validation";
import { AppError, type Tables } from "../src/lib/data/types";
import { actor, ctx, emptyTables, putUser, user } from "./helpers";

const owner = actor("OWNER");
const admin = actor("ADMIN");

const student = (nama: string): StudentInput => studentInput.parse({ nama, jenis_kelamin: "L", jalur_target: "TNI" });
const codes = (t: Tables) => t.Siswa!.map((row) => row.kode_siswa);
const code = (t: Tables, id: string) => t.Siswa!.find((row) => row.siswa_id === id)!.kode_siswa;

function rejects(fn: () => unknown, code: string) {
  assert.throws(fn, (error: unknown) => error instanceof AppError && error.code === code);
}

describe("kode siswa", () => {
  test("format GAN dengan 4 digit", () => {
    assert.equal(formatStudentCode(1), "GAN-0001");
    assert.equal(formatStudentCode(42), "GAN-0042");
    assert.equal(formatStudentCode(12345), "GAN-12345");
  });

  test("berurutan, unik, dan tidak dipakai ulang setelah siswa dinonaktifkan", async () => {
    const t = await emptyTables();
    const ids = ["Andi", "Budi", "Citra"].map((nama) => createStudent(t, student(nama), ctx(), admin).entityId);
    assert.deepEqual(codes(t), ["GAN-0001", "GAN-0002", "GAN-0003"]);
    setStudentActive(t, ids[1]!, false, ctx(), admin);
    const next = createStudent(t, student("Dewi"), ctx(), admin).entityId;
    assert.equal(code(t, next), "GAN-0004");
    assert.equal(setting(t, "penghitung_kode_siswa"), "4");
    assert.equal(new Set(codes(t)).size, codes(t).length);
  });

  test("kode siswa yang dihapus langsung dipakai siswa baru, beserta username akunnya", async () => {
    const t = await emptyTables();
    t.Pengguna!.push({ ...admin.user });
    const ids = ["Andi", "Budi", "Citra"].map((nama) => createStudent(t, student(nama), ctx(), admin).entityId);
    ids.forEach((id) => createStudentAccount(t, id, ctx(), admin));
    deleteStudent(t, ids[1]!, ctx(), admin);
    assert.equal(code(t, ids[1]!), "GAN-0002~hapus");
    const next = createStudent(t, student("Dewi"), ctx(), admin).entityId;
    assert.equal(code(t, next), "GAN-0002");
    const account = createStudentAccount(t, next, ctx(), admin);
    assert.equal(account.data!.username, "gan-0002");
    const after = createStudent(t, student("Eko"), ctx(), admin).entityId;
    assert.equal(code(t, after), "GAN-0004", "setelah celah terisi, lanjut dari penghitung");
  });

  test("melewati kode yang sudah terpakai (mis. diisi manual di spreadsheet)", async () => {
    const t = await emptyTables();
    createStudent(t, student("Andi"), ctx(), admin);
    t.Siswa!.push({ ...t.Siswa![0]!, siswa_id: "SIS_manual", kode_siswa: "GAN-0002" });
    const next = createStudent(t, student("Budi"), ctx(), admin).entityId;
    assert.equal(code(t, next), "GAN-0003");
  });

  test("kapasitas siswa aktif ditegakkan", async () => {
    const t = await emptyTables();
    t.Pengaturan!.find((row) => row.key === "kapasitas_siswa")!.value = 2;
    const first = createStudent(t, student("Andi"), ctx(), admin).entityId;
    createStudent(t, student("Budi"), ctx(), admin);
    rejects(() => createStudent(t, student("Citra"), ctx(), admin), "CAPACITY");
    setStudentActive(t, first, false, ctx(), admin);
    createStudent(t, student("Citra"), ctx(), admin);
    rejects(() => setStudentActive(t, first, true, ctx(), admin), "CAPACITY");
  });

  test("hanya owner dan admin yang bisa menambah siswa", async () => {
    const t = await emptyTables();
    for (const role of ["PENGAJAR", "SISWA", "WALI"] as const) rejects(() => createStudent(t, student("Xena"), ctx(), actor(role)), "FORBIDDEN");
    assert.equal(t.Siswa!.length, 0);
  });
});

describe("program, kelas, dan pendaftaran", () => {
  async function catalog() {
    const t = await emptyTables();
    const tni = saveProgram(t, { program_id: "", nama_program: "Reguler TNI", target_seleksi: "TNI", aktif: true }, ctx(), admin).entityId;
    const polri = saveProgram(t, { program_id: "", nama_program: "Reguler Polri", target_seleksi: "Polri", aktif: true }, ctx(), admin).entityId;
    const kelasTni = saveClass(t, { kelas_id: "", nama_kelas: "TNI A", program_id: tni, angkatan: "2026", aktif: true }, ctx(), admin).entityId;
    const kelasPolri = saveClass(t, { kelas_id: "", nama_kelas: "Polri A", program_id: polri, angkatan: "2026", aktif: true }, ctx(), admin).entityId;
    const siswa = createStudent(t, student("Andi"), ctx(), admin).entityId;
    return { t, tni, polri, kelasTni, kelasPolri, siswa };
  }

  test("nama program dan kelas tidak boleh ganda", async () => {
    const { t, tni } = await catalog();
    rejects(() => saveProgram(t, { program_id: "", nama_program: "reguler tni", target_seleksi: "TNI", aktif: true }, ctx(), admin), "VALIDATION");
    assert.throws(() => saveClass(t, { kelas_id: "", nama_kelas: "TNI A", program_id: tni, angkatan: "", aktif: true }, ctx(), admin), AppError);
  });

  test("kelas harus milik program yang dipilih", async () => {
    const { t, tni, kelasPolri, siswa } = await catalog();
    assert.throws(() => createEnrollment(t, { siswa_id: siswa, program_id: tni, kelas_id: kelasPolri, tanggal_mulai: "" }, ctx(), admin), /bukan bagian/);
  });

  test("satu pendaftaran terbuka per program; boleh daftar lagi setelah selesai", async () => {
    const { t, tni, kelasTni, siswa } = await catalog();
    const first = createEnrollment(t, { siswa_id: siswa, program_id: tni, kelas_id: kelasTni, tanggal_mulai: "" }, ctx(), admin).entityId;
    rejects(() => createEnrollment(t, { siswa_id: siswa, program_id: tni, kelas_id: kelasTni, tanggal_mulai: "" }, ctx(), admin), "DUPLICATE");
    updateEnrollmentStatus(t, { pendaftaran_id: first, status: "CUTI", tanggal_selesai: "" }, ctx(), admin);
    rejects(() => createEnrollment(t, { siswa_id: siswa, program_id: tni, kelas_id: kelasTni, tanggal_mulai: "" }, ctx(), admin), "DUPLICATE");
    updateEnrollmentStatus(t, { pendaftaran_id: first, status: "SELESAI", tanggal_selesai: "" }, ctx(), admin);
    assert.equal(t.Pendaftaran!.find((row) => row.pendaftaran_id === first)!.tanggal_selesai, "2026-11-13");
    const second = createEnrollment(t, { siswa_id: siswa, program_id: tni, kelas_id: kelasTni, tanggal_mulai: "" }, ctx(), admin).entityId;
    // Membuka kembali yang lama ditolak karena sudah ada yang aktif.
    rejects(() => updateEnrollmentStatus(t, { pendaftaran_id: first, status: "AKTIF", tanggal_selesai: "" }, ctx(), admin), "DUPLICATE");
    assert.ok(second);
  });

  test("program kelas tidak bisa dipindah selama ada siswa aktif", async () => {
    const { t, tni, polri, kelasTni, siswa } = await catalog();
    createEnrollment(t, { siswa_id: siswa, program_id: tni, kelas_id: kelasTni, tanggal_mulai: "" }, ctx(), admin);
    assert.throws(() => saveClass(t, { kelas_id: kelasTni, nama_kelas: "TNI A", program_id: polri, angkatan: "2026", aktif: true }, ctx(), admin), AppError);
  });

  test("siswa nonaktif tidak bisa didaftarkan", async () => {
    const { t, tni, kelasTni, siswa } = await catalog();
    setStudentActive(t, siswa, false, ctx(), admin);
    assert.throws(() => createEnrollment(t, { siswa_id: siswa, program_id: tni, kelas_id: kelasTni, tanggal_mulai: "" }, ctx(), admin), /nonaktif/);
  });
});

describe("akun", () => {
  const input = (username: string, peran: "OWNER" | "ADMIN" | "PENGAJAR" | "SISWA" | "WALI", akses: "TIDAK" | "LIHAT" | "CATAT" = "TIDAK") => ({
    username,
    nama: `Nama ${username}`,
    peran,
    akses_keuangan: akses,
  });

  test("owner pertama hanya lewat perintah setup dan hanya sekali", async () => {
    const t = await emptyTables();
    rejects(() => createUser(t, input("admin1", "ADMIN"), "h", ctx(), null), "FORBIDDEN");
    createUser(t, input("pemilik", "OWNER"), "h", ctx(), null);
    rejects(() => createUser(t, input("pemilik2", "OWNER"), "h", ctx(), null), "FORBIDDEN");
    assert.equal(t.Pengguna![0]!.wajib_ganti_password, true);
  });

  test("admin hanya membuat pengajar/siswa/wali dan tidak memberi akses keuangan", async () => {
    const t = await emptyTables();
    rejects(() => createUser(t, input("admin2", "ADMIN"), "h", ctx(), admin), "FORBIDDEN");
    rejects(() => createUser(t, input("owner2", "OWNER"), "h", ctx(), admin), "FORBIDDEN");
    rejects(() => createUser(t, input("guru", "PENGAJAR", "LIHAT"), "h", ctx(), admin), "FORBIDDEN");
    createUser(t, input("guru", "PENGAJAR"), "h", ctx(), admin);
    rejects(() => createUser(t, input("GURU", "SISWA"), "h", ctx(), admin), "DUPLICATE");
  });

  test("akses keuangan hanya tersimpan untuk admin", async () => {
    const t = await emptyTables();
    createUser(t, input("kasir", "ADMIN", "CATAT"), "h", ctx(), owner);
    createUser(t, input("guru", "PENGAJAR", "CATAT"), "h", ctx(), owner);
    assert.deepEqual(
      t.Pengguna!.map((row) => row.akses_keuangan),
      ["CATAT", "TIDAK"],
    );
  });

  test("tidak bisa mengubah peran sendiri atau menghapus owner terakhir", async () => {
    const t = await emptyTables();
    const me = putUser(t, user("OWNER"));
    const self = { user: me, links: [] };
    rejects(() => updateUser(t, { user_id: me.user_id, nama: "X", peran: "ADMIN", aktif: true, akses_keuangan: "TIDAK" }, ctx(), self), "VALIDATION");
    rejects(() => updateUser(t, { user_id: me.user_id, nama: "X", peran: "OWNER", aktif: false, akses_keuangan: "TIDAK" }, ctx(), self), "VALIDATION");
    const other = putUser(t, user("OWNER"));
    updateUser(t, { user_id: other.user_id, nama: "Owner Dua", peran: "ADMIN", aktif: true, akses_keuangan: "LIHAT" }, ctx(), self);
    assert.equal(t.Pengguna!.find((row) => row.user_id === other.user_id)!.peran, "ADMIN");
  });

  test("perubahan hak akses menaikkan versi otorisasi, ganti nama tidak", async () => {
    const t = await emptyTables();
    const guru = putUser(t, user("PENGAJAR"));
    const versi = () => Number(t.Pengguna!.find((row) => row.user_id === guru.user_id)!.versi_otorisasi);
    updateUser(t, { user_id: guru.user_id, nama: "Nama Baru", peran: "PENGAJAR", aktif: true, akses_keuangan: "TIDAK" }, ctx(), admin);
    assert.equal(versi(), 1);
    updateUser(t, { user_id: guru.user_id, nama: "Nama Baru", peran: "WALI", aktif: true, akses_keuangan: "TIDAK" }, ctx(), admin);
    assert.equal(versi(), 2);
    revokeSessions(t, guru.user_id, ctx(), admin);
    assert.equal(versi(), 3);
  });

  test("admin tidak bisa mengubah akses keuangan admin lain", async () => {
    const t = await emptyTables();
    const other = putUser(t, user("ADMIN", { akses_keuangan: "LIHAT" }));
    rejects(() => updateUser(t, { user_id: other.user_id, nama: "X", peran: "ADMIN", aktif: true, akses_keuangan: "CATAT" }, ctx(), admin), "FORBIDDEN");
  });

  test("aturan tautan akun", async () => {
    const t = await emptyTables();
    const siswaA = createStudent(t, student("Andi"), ctx(), admin).entityId;
    const siswaB = createStudent(t, student("Budi"), ctx(), admin).entityId;
    const akunSiswa = putUser(t, user("SISWA"));
    const akunSiswa2 = putUser(t, user("SISWA"));
    const guru = putUser(t, user("PENGAJAR"));
    const wali = putUser(t, user("WALI"));

    assert.throws(() => addLink(t, { user_id: guru.user_id, jenis: "SISWA", siswa_id: siswaA, kelas_id: "" }, ctx(), admin), /tidak sesuai/);
    addLink(t, { user_id: akunSiswa.user_id, jenis: "SISWA", siswa_id: siswaA, kelas_id: "" }, ctx(), admin);
    assert.throws(() => addLink(t, { user_id: akunSiswa.user_id, jenis: "SISWA", siswa_id: siswaB, kelas_id: "" }, ctx(), admin), /satu data siswa/);
    assert.throws(() => addLink(t, { user_id: akunSiswa2.user_id, jenis: "SISWA", siswa_id: siswaA, kelas_id: "" }, ctx(), admin), /akun siswa lain/);
    addLink(t, { user_id: wali.user_id, jenis: "WALI", siswa_id: siswaA, kelas_id: "" }, ctx(), admin);
    addLink(t, { user_id: wali.user_id, jenis: "WALI", siswa_id: siswaB, kelas_id: "" }, ctx(), admin);
    assert.equal(t.Tautan_Akun!.length, 3);
    rejects(() => addLink(t, { user_id: wali.user_id, jenis: "WALI", siswa_id: siswaB, kelas_id: "" }, ctx(), actor("PENGAJAR")), "FORBIDDEN");
  });
});
