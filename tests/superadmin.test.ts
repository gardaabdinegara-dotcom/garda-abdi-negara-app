// Owner sebagai superadmin (arah 17 Nov 2026): data siswa dan akunnya selalu selaras, sesi selesai bisa
// dirapikan atau dibatalkan, dan tes samapta yang keliru dibuat bisa dibatalkan lalu dipulihkan.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { saveSession, setSessionStatus, toSession } from "../src/lib/core/akademik";
import { createStudent, deleteStudent, deleteUser, setStudentActive, updateStudent } from "../src/lib/core/domain";
import { createStudentAccount } from "../src/lib/core/pin";
import { saveSamaptaPos, saveSamaptaTest, setSamaptaStatus, toSamaptaTest } from "../src/lib/core/samapta";
import { samaptaPosInput } from "../src/lib/core/samapta-input";
import { toUser } from "../src/lib/core/types";
import { studentInput } from "../src/lib/core/validation";
import type { OperationContext } from "../src/lib/data/coordinator";
import { actor, ctx, emptyTables, putUser } from "./helpers";

const owner = actor("OWNER");
/** Konteks pada jam WIB tertentu, 13 Nov 2026. */
const at = (time: string): OperationContext => {
  const [h, m] = time.split(":").map(Number);
  return { ...ctx(), now: new Date(Date.UTC(2026, 10, 13, h! - 7, m!)).toISOString() };
};

async function withStudent() {
  const t = await emptyTables();
  putUser(t, owner.user);
  const siswaId = createStudent(t, studentInput.parse({ nama: "ANDI SAPUTRA", jenis_kelamin: "L", jalur_target: "TNI", tanggal_daftar: "2026-11-01" }), ctx(), owner).entityId;
  createStudentAccount(t, siswaId, ctx(), owner);
  const account = () => toUser(t.Pengguna!.find((u) => u.peran === "SISWA")!);
  return { t, siswaId, account };
}

describe("owner sebagai superadmin", () => {
  test("ganti nama siswa ikut mengganti nama akun loginnya", async () => {
    const { t, siswaId, account } = await withStudent();
    updateStudent(t, siswaId, studentInput.parse({ nama: "ANDI SAPUTRA PRATAMA", jenis_kelamin: "L", jalur_target: "TNI" }), ctx(), owner);
    assert.equal(account().nama, "ANDI SAPUTRA PRATAMA");
  });

  test("siswa nonaktif tidak bisa masuk; aktif lagi bersama siswanya", async () => {
    const { t, siswaId, account } = await withStudent();
    setStudentActive(t, siswaId, false, ctx(), owner);
    assert.equal(account().aktif, false);
    setStudentActive(t, siswaId, true, ctx(), owner);
    assert.equal(account().aktif, true);
  });

  test("sesi selesai: owner bisa merapikan nama/jam dan membatalkan lalu memulihkannya", async () => {
    const { t } = await withStudent();
    const base = { sesi_id: "", nama: "Latihan", tanggal: "2026-11-13", jam_mulai: "07:00", jam_selesai: "09:00", jenis: "FISIK" as const, kelas_id: "", pengajar_id: "" };
    const sesi = saveSession(t, base, ctx(), owner).entityId;
    setSessionStatus(t, { sesi_id: sesi, status: "AKTIF" }, at("07:00"), owner);
    setSessionStatus(t, { sesi_id: sesi, status: "SELESAI" }, at("09:00"), owner);
    saveSession(t, { ...base, sesi_id: sesi, nama: "Latihan jasmani pagi", jam_selesai: "09:30" }, ctx(), owner);
    const s = () => toSession(t.Sesi!.find((r) => r.sesi_id === sesi)!);
    assert.equal(s().nama, "Latihan jasmani pagi");
    assert.throws(() => saveSession(t, { ...base, sesi_id: sesi, tanggal: "2026-11-12" }, ctx(), owner), /tidak dapat diubah/);
    setSessionStatus(t, { sesi_id: sesi, status: "DIBATALKAN" }, at("10:00"), owner);
    setSessionStatus(t, { sesi_id: sesi, status: "SELESAI" }, at("10:05"), owner);
    assert.equal(s().status, "SELESAI");
  });

  test("tes samapta bisa dibatalkan (isian terkunci) lalu dipulihkan", async () => {
    const { t, siswaId } = await withStudent();
    const tesId = saveSamaptaTest(t, { tes_id: "", nama: "Tes keliru", tanggal: "2026-11-13", jam_mulai: "07:00", tempat: "", catatan: "" }, ctx(), owner).entityId;
    setSamaptaStatus(t, { tes_id: tesId, status: "DIBATALKAN" }, ctx(), owner);
    assert.equal(toSamaptaTest(t.Tes_Samapta![0]!).status, "DIBATALKAN");
    const pos = samaptaPosInput.parse({ tes_id: tesId, siswa_id: siswaId, pos: "situp", situp_jumlah: "30" });
    assert.throws(() => saveSamaptaPos(t, pos, ctx(), owner), /dibatalkan/);
    setSamaptaStatus(t, { tes_id: tesId, status: "BERJALAN" }, ctx(), owner);
    saveSamaptaPos(t, pos, ctx(), owner);
  });

  test("hapus siswa: hilang dari daftar, akunnya terhapus dan kode bisa dipakai akun baru", async () => {
    const { t, siswaId, account } = await withStudent();
    deleteStudent(t, siswaId, ctx(), owner);
    const siswa = t.Siswa!.find((r) => r.siswa_id === siswaId)!;
    assert.ok(siswa.dihapus_pada);
    assert.equal(account().aktif, false);
    assert.match(account().username, /~hapus-/);
    assert.ok(t.Tautan_Akun!.every((l) => l.aktif === false));
    assert.throws(() => deleteStudent(t, siswaId, ctx(), owner), /tidak ditemukan/);
  });

  test("hapus akun: bukan akun sendiri dan bukan owner terakhir", async () => {
    const { t, account } = await withStudent();
    assert.throws(() => deleteUser(t, owner.user.user_id, ctx(), owner), /sedang dipakai|terakhir/);
    deleteUser(t, account().user_id, ctx(), owner);
    assert.ok(account().dihapus_pada);
    const other = actor("OWNER");
    putUser(t, other.user);
    deleteUser(t, other.user.user_id, ctx(), owner);
    assert.ok(t.Pengguna!.find((u) => u.user_id === other.user.user_id)!.dihapus_pada, "owner lain boleh dihapus selama masih ada owner aktif");
  });

  test("hapus sesi dan tes samapta (owner); sesi terhapus tidak bisa diubah lagi", async () => {
    const { t } = await withStudent();
    const sesi = saveSession(t, { sesi_id: "", nama: "Salah input", tanggal: "2026-11-13", jam_mulai: "07:00", jam_selesai: "08:00", jenis: "FISIK", kelas_id: "", pengajar_id: "" }, ctx(), owner).entityId;
    setSessionStatus(t, { sesi_id: sesi, status: "DIHAPUS" }, at("07:00"), owner);
    assert.equal(t.Sesi!.find((r) => r.sesi_id === sesi)!.status, "DIHAPUS");
    assert.throws(() => setSessionStatus(t, { sesi_id: sesi, status: "AKTIF" }, at("07:00"), owner), /tidak ditemukan/);
    const tesId = saveSamaptaTest(t, { tes_id: "", nama: "Salah", tanggal: "2026-11-13", jam_mulai: "07:00", tempat: "", catatan: "" }, ctx(), owner).entityId;
    setSamaptaStatus(t, { tes_id: tesId, status: "DIHAPUS" }, ctx(), owner);
    assert.equal(toSamaptaTest(t.Tes_Samapta!.find((r) => r.tes_id === tesId)!).status, "DIHAPUS");
  });
});
