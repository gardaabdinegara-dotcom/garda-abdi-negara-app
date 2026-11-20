// Perkembangan Samapta per siswa (deret hasil akhir, tren materi, geometri grafik), unduhan CSV hasil tes,
// dan pesan WA "Kirim hasil".
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toSamaptaResult, type SamaptaResult } from "../src/lib/core/samapta";
import { angkaCsv, csvHasilTes, KOLOM_CSV_SAMAPTA, namaBerkasHasil, teksCsv, waHasilSamapta, type BarisHasil } from "../src/lib/core/samapta-hasil";
import { grafikAkhir, selisihTerakhir, seriAkhir, seriMateri, skalaAkhir, titikSparkline, type RiwayatSamapta } from "../src/lib/core/samapta-perkembangan";
import { WA_TEMPLATE_DEFAULT } from "../src/lib/core/wa";

const BATAS = { baik: 61, baik_sekali: 81 };

function hasil(id: string, v: Partial<Record<keyof SamaptaResult, number | string>>): SamaptaResult {
  return toSamaptaResult({ hasil_id: id, tes_id: id, siswa_id: "S1", ...v });
}

function riwayat(): RiwayatSamapta[] {
  return [
    {
      test: { tes_id: "T1", nama: "Tes Samapta I", tanggal: "2026-10-18", status: "SELESAI" },
      result: hasil("T1", { lari_jarak: 2410, lari_nilai: 57, pull_jumlah: 8, pull_nilai: 63, situp_jumlah: 33, situp_nilai: 66, pushup_jumlah: 40, pushup_nilai: 88, shuttle_waktu: 17.8, shuttle_nilai: 70 }),
      score: { akhir: 64.63, klas: "Baik", pullLabel: "Pull Up" },
    },
    {
      test: { tes_id: "T2", nama: "Tes Samapta II", tanggal: "2026-11-15", status: "SELESAI" },
      result: hasil("T2", { lari_jarak: 2580, lari_nilai: 85, pull_nilai: 87, situp_jumlah: 40, situp_nilai: 69 }),
      score: { akhir: null, klas: null, pullLabel: "Pull Up" },
    },
    {
      test: { tes_id: "T3", nama: "Tes Samapta III", tanggal: "2026-11-29", status: "BERJALAN" },
      result: hasil("T3", { lari_jarak: 2620, lari_nilai: 88, pull_jumlah: 13, pull_nilai: 90, situp_jumlah: 38, situp_nilai: 67, pushup_nilai: 79, shuttle_waktu: 16.8, shuttle_nilai: 78 }),
      score: { akhir: 83.25, klas: "Baik Sekali", pullLabel: "Pull Up" },
    },
  ];
}

describe("perkembangan samapta: deret dan selisih", () => {
  it("selisih memakai dua nilai terakhir yang ada", () => {
    assert.equal(selisihTerakhir([64.63, 78.5, 83.25]), 4.75);
    assert.equal(selisihTerakhir([70, null, 67]), -3);
    assert.equal(selisihTerakhir([null, 70]), null);
    assert.equal(selisihTerakhir([]), null);
  });

  it("hasil akhir: tes yang belum lengkap dilewati, urutan lama ke baru", () => {
    const s = seriAkhir(riwayat());
    assert.deepEqual(s.map((t) => [t.tes_id, t.akhir]), [["T1", 64.63], ["T3", 83.25]]);
  });

  it("per materi: nilai per tes, nilai dan hasil ukur terakhir, serta ▲/▼ dibanding tes sebelumnya", () => {
    const m = new Map(seriMateri(riwayat()).map((x) => [x.key, x]));
    assert.deepEqual(m.get("lari")!.nilai, [57, 85, 88]);
    assert.deepEqual(m.get("lari")!.terakhir, { nilai: 88, mentah: 2620 });
    assert.equal(m.get("lari")!.delta, 3);
    assert.equal(m.get("situp")!.delta, -2);
    assert.equal(m.get("pushup")!.delta, -9, "tes II kosong: dibanding tes I");
    assert.equal(m.get("pushup")!.terakhir!.mentah, null, "nilai ada tanpa hasil ukur");
    assert.equal(m.get("pull")!.label, "Pull up");
    const putri = riwayat().map((r) => ({ ...r, score: { ...r.score, pullLabel: "Chinning" } }));
    assert.equal(seriMateri(putri).find((x) => x.key === "pull")!.label, "Chinning");
  });
});

describe("perkembangan samapta: grafik", () => {
  it("skala memuat nilai serta batas Baik dan Baik Sekali, kelipatan 10", () => {
    assert.deepEqual(skalaAkhir([64.63, 78.5, 83.25], BATAS), { min: 50, max: 90, step: 20 });
    assert.deepEqual(skalaAkhir([40], BATAS), { min: 30, max: 90, step: 20 });
    const atas = skalaAkhir([97], BATAS);
    assert.equal(atas.max, 100);
    assert.ok(atas.min <= 56);
  });

  it("titik, garis batas, dan bidang sesuai rancangan 340 × 198", () => {
    const g = grafikAkhir(
      [
        { tes_id: "T1", nama: "Tes Samapta I", tanggal: "2026-10-18", akhir: 64.63, klas: "Baik" },
        { tes_id: "T2", nama: "Tes Samapta II", tanggal: "2026-11-15", akhir: 78.5, klas: "Baik" },
        { tes_id: "T3", nama: "Tes Samapta III", tanggal: "2026-11-29", akhir: 83.25, klas: "Baik Sekali" },
      ],
      BATAS,
    );
    assert.deepEqual(g.titik.map((t) => t.x), [60, 175, 290]);
    assert.ok(Math.abs(g.titik[0]!.y - 106.6) < 0.5);
    assert.ok(Math.abs(g.titik[2]!.y - 38.6) < 0.5);
    assert.ok(Math.abs(g.baik - 120) < 0.5);
    assert.ok(Math.abs(g.baikSekali - 47) < 0.5);
    assert.deepEqual(g.ticks.map((t) => t.nilai), [50, 70, 90]);
    assert.match(g.garis, /^M60 [\d.]+ L175 [\d.]+ L290 [\d.]+$/);
    assert.match(g.bidang, /L290 160 L60 160 Z$/);
  });

  it("satu titik di tengah; banyak tes hanya sebagian label sumbu", () => {
    const satu = grafikAkhir([{ tes_id: "T1", nama: "Tes I", tanggal: "2026-10-18", akhir: 70, klas: "Baik" }], BATAS);
    assert.equal(satu.titik[0]!.x, 175);
    const banyak = grafikAkhir(
      Array.from({ length: 9 }, (_, i) => ({ tes_id: `T${i}`, nama: `Tes ${i}`, tanggal: "2026-10-18", akhir: 60 + i, klas: null })),
      BATAS,
    );
    const label = banyak.titik.filter((t) => t.label).length;
    assert.ok(label < 9 && banyak.titik[0]!.label && banyak.titik[8]!.label);
  });

  it("sparkline: posisi x mengikuti urutan tes, nilai kosong dilewati", () => {
    const sp = titikSparkline([57, null, 88]);
    assert.equal(sp.points, "4,20 60,4");
    assert.deepEqual(sp.akhir, { x: 60, y: 4 });
    assert.equal(titikSparkline([null, null]).points, "");
    assert.equal(titikSparkline([70, 70]).points, "4,12 60,12");
  });
});

function baris(id: string, nama: string, rank: number | null, akhir: number | null, extra: Partial<BarisHasil["student"]> = {}): BarisHasil {
  return {
    student: { siswa_id: id, kode_siswa: `GAN-${id}`, nama, jenis_kelamin: "L", no_wa: "", no_wa_wali: "", nama_wali: "", ...extra },
    result: hasil(id, akhir === null ? { lari_jarak: 2100 } : { lari_jarak: 2620, lari_nilai: 88, pull_jumlah: 13, pull_nilai: 90, situp_jumlah: 38, situp_nilai: 67, pushup_jumlah: 37, pushup_nilai: 79, shuttle_waktu: 16.8, shuttle_nilai: 78 }),
    score: { garjasA: akhir === null ? null : 88, garjasB: akhir === null ? null : 78.5, akhir, klas: akhir === null ? null : "Baik Sekali", pullLabel: "Pull Up" },
    rank,
  };
}

describe("unduhan CSV hasil tes", () => {
  it("BOM, baris sep=;, kolom lengkap, urut peringkat, dan koma desimal", () => {
    const csv = csvHasilTes([baris("0003", "CITRA LESTARI", null, null), baris("0002", "BAYU SANTOSO", 2, 80), baris("0001", "ADIT PRAKOSO", 1, 83.25)]);
    assert.ok(csv.startsWith("﻿sep=;\r\n"));
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    assert.equal(lines[1], KOLOM_CSV_SAMAPTA.map((k) => `"${k}"`).join(";"));
    assert.equal(lines[1]!.split(";").length, 19);
    assert.match(lines[1]!, /^"No";"Kode";"Nama";"L\/P";/);
    assert.match(lines[1]!, /"Garjas A";"Garjas B";"Hasil akhir";"Klasifikasi";"Peringkat"$/);
    assert.equal(lines[2], '1;"GAN-0001";"ADIT PRAKOSO";"L";2620;88;13;90;38;67;37;79;16,8;78;88;78,5;83,25;"Baik Sekali";1');
    assert.match(lines[3]!, /^2;"GAN-0002";"BAYU SANTOSO"/);
    assert.match(lines[4]!, /^3;"GAN-0003";"CITRA LESTARI";"L";2100;;;;;;;;;;;;;"Belum lengkap";$/);
  });

  it("sel teks aman dari rumus dan tanda kutip; angka kosong menjadi sel kosong", () => {
    assert.equal(teksCsv('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
    assert.equal(angkaCsv(null), "");
    assert.equal(angkaCsv(17.456), "17,46");
    assert.deepEqual(namaBerkasHasil("Tes Samapta III"), { ascii: "Hasil-Tes-Samapta-III.csv", utf8: "Hasil Tes Samapta III.csv" });
  });
});

describe("WA Kirim hasil", () => {
  const data = { lembaga: "Bimbel Contoh", tes: "Tes Samapta III", peserta: 24 };
  it("ke nomor wali dengan isian template samapta", () => {
    const wa = waHasilSamapta(WA_TEMPLATE_DEFAULT.samapta, data, baris("0001", "ADIT PRAKOSO", 2, 83.25, { no_wa: "0812-0000-1111", no_wa_wali: "0813-2222-3333", nama_wali: "Ibu Sri" }))!;
    assert.equal(wa.nomor, "6281322223333");
    assert.match(wa.pesan, /ADIT PRAKOSO/);
    assert.match(wa.pesan, /Tes Samapta III/);
    assert.match(wa.pesan, /83,25 \(Baik Sekali\)/);
    assert.match(wa.pesan, /peringkat 2 dari 24 peserta/);
    assert.match(wa.pesan, /Garjas A 88, Garjas B 78,5/);
    assert.match(wa.pesan, /Bimbel Contoh/);
    assert.doesNotMatch(wa.pesan, /\{[a-z_]+\}/);
    assert.match(wa.untuk, /^Wali ADIT PRAKOSO \(Ibu Sri\)/);
  });

  it("tanpa nomor wali memakai nomor siswa; hasil belum lengkap tidak dikirim", () => {
    const wa = waHasilSamapta(WA_TEMPLATE_DEFAULT.samapta, data, baris("0002", "BAYU SANTOSO", 1, 80, { no_wa: "081200004444" }))!;
    assert.equal(wa.nomor, "6281200004444");
    assert.match(wa.untuk, /nomor wali kosong/);
    assert.equal(waHasilSamapta(WA_TEMPLATE_DEFAULT.samapta, data, baris("0003", "CITRA LESTARI", null, null)), null);
    assert.equal(waHasilSamapta(WA_TEMPLATE_DEFAULT.samapta, data, baris("0004", "DIMAS ARYA", 3, 70))!.nomor, null);
  });
});
