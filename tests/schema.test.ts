import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { normalizePhone, settingsInput, studentInput, usernameSchema } from "../src/lib/core/validation";
import { DEFAULT_SETTINGS, INTI, KEUANGAN, OPERATION_TABLE, SCHEMA } from "../src/lib/data/schema";
import { freshDeps } from "./helpers";

describe("skema spreadsheet", () => {
  test("nama tab tidak bentrok antara spreadsheet inti dan keuangan", () => {
    const inti = Object.keys(INTI);
    const keuangan = new Set(Object.keys(KEUANGAN));
    assert.deepEqual(inti.filter((name) => keuangan.has(name)), []);
  });

  test("setiap tab punya kolom unik dan kunci di kolom pertama", () => {
    for (const tables of Object.values(SCHEMA)) {
      for (const [name, def] of Object.entries(tables)) {
        assert.equal(def.name, name);
        assert.equal(def.key, def.columns[0], name);
        assert.equal(new Set(def.columns).size, def.columns.length, `kolom ganda di ${name}`);
      }
    }
  });

  test("tab operasi tersedia dan tab PRD inti lengkap", () => {
    assert.ok(INTI[OPERATION_TABLE.inti as keyof typeof INTI]);
    assert.ok(KEUANGAN[OPERATION_TABLE.keuangan as keyof typeof KEUANGAN]);
    for (const name of ["Pengaturan", "Pengguna", "Tautan_Akun", "Siswa", "Program", "Kelas", "Pendaftaran", "Sesi", "Presensi", "Hasil_Tes", "Tugas", "Pengumpulan", "Kesehatan", "Rapor", "Operasi"]) {
      assert.ok(name in INTI, name);
    }
  });

  test("setup aman dijalankan berulang dan mengisi pengaturan bawaan", async () => {
    const deps = await freshDeps();
    const { setupSheets } = await import("../src/lib/setup");
    const again = await setupSheets(deps, true);
    assert.deepEqual(
      again.map((r) => r.added.length),
      [0, 0],
    );
    const t = await deps.store.read("inti", ["Pengaturan"]);
    assert.deepEqual(new Set(t.Pengaturan!.map((row) => row.key)), new Set(Object.keys(DEFAULT_SETTINGS)));
  });
});

describe("validasi isian", () => {
  test("nomor WA dinormalkan ke 62", () => {
    assert.equal(normalizePhone("0812-3456-7890"), "6281234567890");
    assert.equal(normalizePhone("+62 812 3456 7890"), "6281234567890");
    assert.equal(normalizePhone("812 3456 7890"), "6281234567890");
    assert.equal(normalizePhone(""), "");
  });

  test("data siswa", () => {
    const ok = studentInput.parse({ nama: "  Andi  ", jenis_kelamin: "L", jalur_target: "TNI", no_wa: "0812 3456 7890" });
    assert.equal(ok.nama, "Andi");
    assert.equal(ok.no_wa, "6281234567890");
    assert.equal(studentInput.safeParse({ nama: "A", jenis_kelamin: "L", jalur_target: "TNI" }).success, false);
    assert.equal(studentInput.safeParse({ nama: "Andi", jenis_kelamin: "X", jalur_target: "TNI" }).success, false);
    assert.equal(studentInput.safeParse({ nama: "Andi", jenis_kelamin: "L", jalur_target: "TNI", no_wa: "123" }).success, false);
    assert.equal(studentInput.safeParse({ nama: "Andi", jenis_kelamin: "L", jalur_target: "TNI", tanggal_lahir: "13/11/2006" }).success, false);
  });

  test("username", () => {
    assert.equal(usernameSchema.parse(" Budi.Santoso "), "budi.santoso");
    for (const bad of ["ab", "budi santoso", ".budi", "budi@garda", "a".repeat(33)]) assert.equal(usernameSchema.safeParse(bad).success, false, bad);
  });

  test("batas predikat harus menurun", () => {
    const base = { nama_lembaga: "Garda", lokasi: "", zona_waktu: "Asia/Jakarta", toleransi_terlambat_menit: 10, kapasitas_siswa: 30, acuan_twk: 65, acuan_tiu: 80, acuan_tkp: 156 };
    assert.equal(settingsInput.safeParse({ ...base, predikat_a: 80, predikat_b: 60, predikat_c: 40 }).success, true);
    assert.equal(settingsInput.safeParse({ ...base, predikat_a: 60, predikat_b: 80, predikat_c: 40 }).success, false);
  });
});

describe("penulisan hanya sel yang berubah", () => {
  test("rentang kolom berubah digabung bila berurutan", async () => {
    const { changedRanges } = await import("../src/lib/data/rows");
    const { INTI } = await import("../src/lib/data/schema");
    const def = INTI.Hasil_Samapta;
    const before = { hasil_id: "T:S", tes_id: "T", siswa_id: "S", lari_jarak: "", lari_nilai: "", situp_jumlah: 30 };
    const after = { ...before, lari_jarak: 2400, lari_nilai: 80, updated_at: "x", updated_by: "y" };
    const col = (name: string) => def.columns.indexOf(name);
    assert.deepEqual(changedRanges(def, before, after), [
      { start: col("lari_jarak"), end: col("lari_nilai") },
      { start: col("updated_at"), end: col("updated_by") },
    ]);
    assert.deepEqual(changedRanges(def, before, { ...before }), []);
  });
});
