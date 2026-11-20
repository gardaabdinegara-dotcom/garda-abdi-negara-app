// Target latihan mingguan: simpan di Pengaturan, progres Senin sampai Minggu, hari beruntun, rekor, dan catatan WA.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DurasiLatihan, JenisLatihan } from "../src/lib/core/latihan";
import { catatanDorong } from "../src/lib/core/latihan-rekap";
import {
  bacaIsianTarget,
  bacaTarget,
  hariBeruntun,
  menitTarget,
  namaTarget,
  parseTarget,
  progresTarget,
  rekorBeruntun,
  ringkasTargetKelompok,
  simpanTargetLatihan,
  tanggalMinggu,
  TARGET_KEY,
  tulisTarget,
  type TargetLatihan,
} from "../src/lib/core/latihan-target";
import { actor, ctx, emptyTables } from "./helpers";

// Jumat, 20 November 2026 (minggu 16 sampai 22 November).
const HARI_INI = "2026-11-20";
const KRAEPELIN_STANDAR: TargetLatihan = { jenis: "kraepelin", durasi: "standar", kali: 3 };
const l = (tanggal: string, jenis: JenisLatihan = "kraepelin", durasi: DurasiLatihan = "standar") => ({ tanggal, jenis, durasi });

describe("target latihan: simpan dan baca", () => {
  it("JSON target dibaca ulang sama; nilai rusak atau di luar batas berarti tidak ada target", () => {
    assert.deepEqual(parseTarget(tulisTarget(KRAEPELIN_STANDAR)), KRAEPELIN_STANDAR);
    assert.deepEqual(parseTarget(JSON.stringify({ jenis: null, durasi: null, kali: 7 })), { jenis: null, durasi: null, kali: 7 });
    assert.equal(parseTarget(""), null);
    assert.equal(parseTarget("bukan json"), null);
    assert.equal(parseTarget(JSON.stringify({ jenis: "kraepelin", durasi: "standar", kali: 0 })), null);
    assert.equal(parseTarget(JSON.stringify({ jenis: "kraepelin", durasi: "standar", kali: 8 })), null);
    assert.equal(parseTarget(JSON.stringify({ jenis: "lari", durasi: "standar", kali: 3 })), null);
  });

  it("nama target dan lama satu latihan", () => {
    assert.equal(namaTarget(KRAEPELIN_STANDAR), "Kraepelin Standar");
    assert.equal(namaTarget({ jenis: "pauli", durasi: "asli" }), "Pauli seperti tes asli");
    assert.equal(namaTarget({ jenis: null, durasi: "singkat" }), "Latihan Singkat");
    assert.equal(namaTarget({ jenis: "angka", durasi: null }), "Angka hilang");
    assert.equal(namaTarget({ jenis: null, durasi: null }), "Latihan apa saja");
    assert.equal(menitTarget(KRAEPELIN_STANDAR), 10);
    assert.equal(menitTarget({ jenis: null, durasi: "standar" }), null);
  });

  it("isian form: 'semua' berarti tidak dibatasi; kali harus 1 sampai 7", () => {
    assert.deepEqual(bacaIsianTarget({ jenis: "semua", durasi: "semua", kali: "2" }), { jenis: null, durasi: null, kali: 2 });
    assert.deepEqual(bacaIsianTarget({ jenis: "pauli", durasi: "singkat", kali: 5 }), { jenis: "pauli", durasi: "singkat", kali: 5 });
    assert.throws(() => bacaIsianTarget({ jenis: "x", durasi: "standar", kali: 3 }), /jenis/);
    assert.throws(() => bacaIsianTarget({ jenis: "pauli", durasi: "lama", kali: 3 }), /durasi/);
    assert.throws(() => bacaIsianTarget({ jenis: "pauli", durasi: "standar", kali: "9" }), /1 sampai 7/);
    assert.throws(() => bacaIsianTarget({ jenis: "pauli", durasi: "standar", kali: "2.5" }), /1 sampai 7/);
  });

  it("owner memasang, mengubah, lalu menghapus target; baris Pengaturan tidak pernah dihapus", async () => {
    const t = await emptyTables();
    const owner = actor("OWNER");
    const awal = t.Pengaturan!.length;
    simpanTargetLatihan(t, { jenis: "kraepelin", durasi: "standar", kali: 3 }, ctx(), owner);
    assert.deepEqual(bacaTarget(t), KRAEPELIN_STANDAR);
    assert.equal(t.Pengaturan!.length, awal + 1);
    simpanTargetLatihan(t, { jenis: "semua", durasi: "standar", kali: 4 }, ctx(), actor("ADMIN"));
    assert.deepEqual(bacaTarget(t), { jenis: null, durasi: "standar", kali: 4 });
    assert.equal(t.Pengaturan!.length, awal + 1, "kunci yang sama diperbarui, bukan ditambah");
    const out = simpanTargetLatihan(t, { jenis: "", durasi: "", kali: "", hapus: true }, ctx(), owner);
    assert.match(out.message, /dihapus/);
    assert.equal(bacaTarget(t), null);
    assert.equal(t.Pengaturan!.length, awal + 1);
    assert.equal(t.Pengaturan!.find((r) => r.key === TARGET_KEY)!.value, "");
  });

  it("siswa dan pengajar tidak boleh mengatur target", async () => {
    const t = await emptyTables();
    for (const peran of ["SISWA", "PENGAJAR"] as const) {
      assert.throws(() => simpanTargetLatihan(t, { jenis: "kraepelin", durasi: "standar", kali: 3 }, ctx(), actor(peran)), /owner atau admin/);
    }
  });
});

describe("target latihan: progres minggu ini", () => {
  it("minggu berjalan Senin sampai Minggu, termasuk saat melewati akhir bulan", () => {
    assert.deepEqual(tanggalMinggu(HARI_INI), ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    assert.equal(tanggalMinggu("2026-11-16")[0], "2026-11-16", "Senin adalah awal minggu");
    assert.equal(tanggalMinggu("2026-11-22")[0], "2026-11-16", "Minggu adalah akhir minggu");
    assert.deepEqual(tanggalMinggu("2026-12-02").slice(0, 2), ["2026-11-30", "2026-12-01"]);
  });

  it("dihitung per hari: dua latihan sesuai target di hari yang sama dihitung satu", () => {
    const riwayat = [
      l("2026-11-16"),
      l("2026-11-16"),
      l("2026-11-17", "pauli"),
      l("2026-11-18"),
      l("2026-11-19", "kraepelin", "singkat"),
      l("2026-11-20", "angka"),
      l("2026-11-15"), // minggu lalu
    ];
    const p = progresTarget(KRAEPELIN_STANDAR, riwayat, HARI_INI);
    assert.equal(p.dari, "2026-11-16");
    assert.equal(p.sampai, "2026-11-22");
    assert.equal(p.selesai, 2);
    assert.equal(p.kurang, 1);
    assert.equal(p.terpenuhi, false);
    assert.equal(p.sisaHari, 2);
    assert.deepEqual(p.hari.map((h) => h.status), ["target", "lain", "target", "lain", "lain", "kosong", "kosong"]);
    assert.deepEqual(p.hari.map((h) => h.hariIni), [false, false, false, false, true, false, false]);
    assert.deepEqual(p.hari.map((h) => h.nanti), [false, false, false, false, false, true, true]);
    assert.equal(p.latihanLain, 3);
    assert.deepEqual(p.jenisLain, ["pauli", "kraepelin", "angka"]);
  });

  it("target tanpa jenis atau durasi menerima latihan apa saja yang cocok", () => {
    const riwayat = [l("2026-11-16", "pauli", "singkat"), l("2026-11-17", "simbol", "asli"), l("2026-11-18", "angka", "singkat")];
    assert.equal(progresTarget({ jenis: null, durasi: null, kali: 3 }, riwayat, HARI_INI).terpenuhi, true);
    assert.equal(progresTarget({ jenis: null, durasi: "singkat", kali: 3 }, riwayat, HARI_INI).selesai, 2);
    assert.equal(progresTarget({ jenis: "pauli", durasi: null, kali: 1 }, riwayat, HARI_INI).terpenuhi, true);
  });

  it("latihan bertanggal setelah hari ini diabaikan; Minggu adalah hari terakhir", () => {
    const p = progresTarget(KRAEPELIN_STANDAR, [l("2026-11-21"), l("2026-11-22")], HARI_INI);
    assert.equal(p.selesai, 0);
    assert.equal(progresTarget(KRAEPELIN_STANDAR, [], "2026-11-22").sisaHari, 0);
  });

  it("ringkasan kelompok: berapa siswa memenuhi target", () => {
    const by = new Map([
      ["S1", [l("2026-11-16"), l("2026-11-18"), l("2026-11-20")]],
      ["S2", [l("2026-11-16")]],
    ]);
    const r = ringkasTargetKelompok(KRAEPELIN_STANDAR, ["S1", "S2", "S3"], by, HARI_INI);
    assert.equal(r.total, 3);
    assert.equal(r.memenuhi, 1);
    assert.equal(r.perSiswa.S3!.selesai, 0);
    assert.equal(r.sisaHari, 2);
  });
});

describe("hari beruntun dan rekor", () => {
  it("hari beruntun sampai hari ini; bila hari ini belum latihan, dihitung sampai kemarin", () => {
    const tanggal = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"];
    assert.equal(hariBeruntun(tanggal, HARI_INI), 5);
    assert.equal(hariBeruntun(tanggal.slice(0, 4), HARI_INI), 4, "hari ini belum latihan, rangkaian belum putus");
    assert.equal(hariBeruntun(["2026-11-17", "2026-11-18"], HARI_INI), 0, "kemarin terlewat: putus");
    assert.equal(hariBeruntun([], HARI_INI), 0);
    assert.equal(hariBeruntun(["2026-11-20", "2026-11-20", "2026-11-21"], HARI_INI), 1, "tanggal ganda dan tanggal depan diabaikan");
  });

  it("rekor adalah rangkaian terpanjang, termasuk melewati akhir bulan", () => {
    const tanggal = ["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-05", "2026-11-06", "2026-11-19", "2026-11-20"];
    assert.equal(rekorBeruntun(tanggal), 4);
    assert.equal(rekorBeruntun(["2026-11-20", "2026-11-21", "2026-11-22"], HARI_INI), 1);
    assert.equal(rekorBeruntun([]), 0);
  });
});

describe("catatan WA perlu didorong", () => {
  const latihan = { jenis: "kraepelin" as const } as Parameters<typeof catatanDorong>[0]["terakhir"];
  it("alasan sesuai tanda rekap", () => {
    assert.equal(catatanDorong({ tanda: "lama", terakhir: latihan, tren: 0, hariSejak: 9 }), "sudah 9 hari belum latihan");
    assert.equal(catatanDorong({ tanda: "turun", terakhir: latihan, tren: -12, hariSejak: 0 }), "skor Kraepelin turun 12 poin");
    assert.equal(catatanDorong({ tanda: "belum", terakhir: null, tren: null, hariSejak: null }), "belum pernah mencoba latihan psikotes");
    assert.equal(catatanDorong({ tanda: null, terakhir: latihan, tren: 3, hariSejak: 0 }), null);
  });

  it("di bawah target hanya bila progres target diberikan", () => {
    const p = progresTarget(KRAEPELIN_STANDAR, [l("2026-11-16")], HARI_INI);
    assert.equal(catatanDorong({ tanda: null, terakhir: latihan, tren: 0, hariSejak: 4 }, p), "latihan Kraepelin Standar minggu ini baru 1 dari 3 hari");
    const penuh = progresTarget({ ...KRAEPELIN_STANDAR, kali: 1 }, [l("2026-11-16")], HARI_INI);
    assert.equal(catatanDorong({ tanda: null, terakhir: latihan, tren: 0, hariSejak: 4 }, penuh), null);
  });
});
