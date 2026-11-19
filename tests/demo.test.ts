// Data contoh mode pratinjau: lengkap, deterministik, dan bisa dibaca aplikasi.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { kelompokkanPerSiswa, rekapDari } from "../src/lib/core/latihan-rekap";
import { toLatihan } from "../src/lib/core/latihan-simpan";
import { toStudent } from "../src/lib/core/types";
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
    assert.deepEqual(a.inti.Latihan_Psikotes, b.inti.Latihan_Psikotes);
  });

  test("latihan psikotes tiga minggu: kolom tersimpan cocok dengan hitungan ulang, semua tanda rekap muncul", () => {
    const d = buildDemoData(viewer, NOW);
    const rows = d.inti.Latihan_Psikotes!;
    assert.ok(rows.length > 100, `jumlah latihan ${rows.length}`);
    for (const row of rows) {
      const l = toLatihan(row);
      for (const key of ["dijawab", "benar", "salah", "kecepatan", "ketelitian", "stabilitas", "performa", "skor"] as const) {
        assert.equal(row[key], l[key], `${key} ${row.latihan_id}`);
      }
      assert.ok(String(row.mulai) < NOW, "tidak ada latihan di masa depan");
      assert.ok(String(row.tanggal) >= "2026-10-26" && String(row.tanggal) <= "2026-11-17", `tanggal ${row.tanggal}`);
      assert.ok(d.inti.Pengguna!.some((u) => u.user_id === row.created_by && u.peran === "SISWA"), "disimpan atas nama akun siswa");
    }
    const latihan = rows.map(toLatihan);
    assert.ok(new Set(latihan.map((l) => l.jenis)).size === 4, "keempat jenis ada");
    assert.ok(new Set(latihan.map((l) => l.durasi)).size >= 2, "durasi bervariasi");
    const rekap = rekapDari(d.inti.Siswa!.map(toStudent), kelompokkanPerSiswa(latihan), "2026-11-17");
    const tanda = new Set(rekap.baris.map((b) => b.tanda));
    for (const t of ["belum", "lama", "turun", null]) assert.ok(tanda.has(t as never), `tanda ${t} ada`);
    assert.ok(rekap.siswaBerlatih >= 15, `siswa berlatih dalam periode ${rekap.siswaBerlatih}`);
    // Siswa yang rutin latihan menunjukkan kemajuan: skor terakhir jenis favoritnya di atas skor pertama.
    const naik = rekap.baris.filter((b) => b.sesi >= 7 && b.tanda === null);
    assert.ok(naik.length >= 8);
    for (const b of naik) {
      const sama = latihan.filter((l) => l.siswa_id === b.student.siswa_id && l.jenis === b.terakhir!.jenis).sort((x, y) => x.mulai.localeCompare(y.mulai));
      assert.ok(sama.at(-1)!.skor > sama[0]!.skor, `${b.student.nama}: ${sama.map((l) => l.skor).join(",")}`);
    }
  });

  test("laporan keuangan contoh siap diperiksa (semua kategori terpetakan, saldo awal terverifikasi)", () => {
    const d = buildDemoData(viewer, NOW);
    const report = financialStatements(composeState(d.inti, d.keuangan), "2026-10-01", "2026-10-31");
    assert.equal(report.period.BELUM_DIPETAKAN, 0);
    assert.ok(report.income > 0);
    assert.deepEqual(report.warnings, []);
  });
});
