// Data contoh mode pratinjau: lengkap, deterministik, dan bisa dibaca aplikasi.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildDemoData } from "../src/lib/demo/data-contoh";
import { composeState } from "../src/lib/keuangan/sumber";
import { financialStatements } from "../src/lib/keuangan/reporting";
import { user } from "./helpers";

const viewer = user("OWNER", { user_id: "USR_pemilik_demo", username: "admin" });
const NOW = "2026-11-17T09:00:00.000Z";

describe("data contoh mode pratinjau", () => {
  test("berisi siswa, presensi, tes samapta, dan transaksi", () => {
    const d = buildDemoData(viewer, NOW);
    assert.equal(d.inti.Siswa!.length, 24);
    assert.ok(d.inti.Sesi!.some((s) => s.status === "AKTIF"), "ada sesi yang sedang berlangsung");
    assert.ok(d.inti.Presensi!.some((p) => p.status === "MENUNGGU"), "ada pengajuan menunggu");
    assert.equal(d.inti.Tes_Samapta!.length, 2);
    assert.ok(d.inti.Hasil_Samapta!.length >= 48);
    assert.ok(d.keuangan.Transaksi!.length > 40);
    assert.ok(d.inti.Pengguna!.some((u) => u.user_id === viewer.user_id), "pembuka pratinjau ada di data contoh");
  });

  test("sama persis bila dibuat ulang di hari yang sama (aman untuk banyak server)", () => {
    const a = buildDemoData(viewer, NOW);
    const b = buildDemoData(viewer, NOW);
    assert.deepEqual(a.inti.Sesi!.map((s) => s.sesi_id), b.inti.Sesi!.map((s) => s.sesi_id));
    assert.deepEqual(a.inti.Tes_Samapta!.map((s) => s.tes_id), b.inti.Tes_Samapta!.map((s) => s.tes_id));
    assert.deepEqual(a.keuangan.Transaksi!.map((t) => t.nominal), b.keuangan.Transaksi!.map((t) => t.nominal));
  });

  test("laporan keuangan contoh siap diperiksa (semua kategori terpetakan, saldo awal terverifikasi)", () => {
    const d = buildDemoData(viewer, NOW);
    const report = financialStatements(composeState(d.inti, d.keuangan), "2026-10-01", "2026-10-31");
    assert.equal(report.period.BELUM_DIPETAKAN, 0);
    assert.ok(report.income > 0);
    assert.deepEqual(report.warnings, []);
  });
});
