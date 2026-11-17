import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classify,
  formatDuration,
  imtLabel,
  imtOf,
  parseDuration,
  posFilled,
  rankOf,
  samaptaSettings,
  saveSamaptaPos,
  saveSamaptaTest,
  scoreOf,
  setSamaptaStatus,
  addSamaptaParticipant,
  toSamaptaResult,
  toSamaptaTest,
} from "../src/lib/core/samapta";
import { samaptaPosInput } from "../src/lib/core/samapta-input";
import type { Tables } from "../src/lib/data/types";
import { actor, ctx, emptyTables, link } from "./helpers";

const owner = actor("OWNER");
const settings = { baik_sekali: 81, baik: 61, cukup: 41 };

function addStudent(t: Tables, id: string, kode: string, extra: Record<string, string | boolean> = {}) {
  t.Siswa!.push({ siswa_id: id, kode_siswa: kode, nama: `SISWA ${kode}`, jenis_kelamin: "L", aktif: true, tanggal_daftar: "2026-10-01", ...extra });
}

async function setup() {
  const t = await emptyTables();
  addStudent(t, "S1", "GAN-0001");
  addStudent(t, "S2", "GAN-0002", { jenis_kelamin: "P" });
  addStudent(t, "S3", "GAN-0003", { aktif: false });
  const out = saveSamaptaTest(t, { tes_id: "", nama: "Tes Samapta I", tanggal: "2026-11-15", jam_mulai: "07:00", tempat: "", catatan: "" }, ctx(), owner);
  return { t, tesId: out.entityId };
}

const pos = (input: Record<string, string>) => samaptaPosInput.parse(input);

describe("perhitungan samapta", () => {
  it("klasifikasi mengikuti batas lembaga", () => {
    assert.equal(classify(81, settings), "Baik Sekali");
    assert.equal(classify(80.99, settings), "Baik");
    assert.equal(classify(61, settings), "Baik");
    assert.equal(classify(60, settings), "Cukup");
    assert.equal(classify(41, settings), "Cukup");
    assert.equal(classify(40, settings), "Kurang");
    assert.equal(classify(null, settings), null);
    assert.equal(classify(75, { baik_sekali: 90, baik: 75, cukup: 50 }), "Baik");
  });

  it("IMT satu desimal dan labelnya", () => {
    assert.equal(imtOf(179, 69), 21.5);
    assert.equal(imtOf(null, 69), null);
    assert.equal(imtLabel(18.4), "Kurus");
    assert.equal(imtLabel(24.9), "Normal");
    assert.equal(imtLabel(25), "Gemuk");
    assert.equal(imtLabel(30), "Obesitas");
  });

  it("Garjas B rata-rata empat nilai; hasil akhir (A + B) / 2", () => {
    const r = toSamaptaResult({ lari_nilai: 87, pull_nilai: 86, situp_nilai: 93, pushup_nilai: 92, shuttle_nilai: 81 });
    const s = scoreOf(r, "L", settings);
    assert.equal(s.garjasA, 87);
    assert.equal(s.garjasB, 88);
    assert.equal(s.akhir, 87.5);
    assert.equal(s.klas, "Baik Sekali");
    assert.equal(s.pullLabel, "Pull Up");
    assert.equal(scoreOf(r, "P", settings).pullLabel, "Chinning");
  });

  it("hasil akhir kosong bila salah satu nilai B belum ada", () => {
    const s = scoreOf(toSamaptaResult({ lari_nilai: 87, pull_nilai: 86, situp_nilai: 93, pushup_nilai: 92 }), "L", settings);
    assert.equal(s.garjasB, null);
    assert.equal(s.akhir, null);
    assert.equal(s.klas, null);
  });

  it("durasi renang: detik atau menit:detik", () => {
    assert.equal(parseDuration("65", "Waktu"), 65);
    assert.equal(parseDuration("1:05", "Waktu"), 65);
    assert.equal(parseDuration("49,5", "Waktu"), 49.5);
    assert.equal(parseDuration("", "Waktu"), null);
    assert.throws(() => parseDuration("abc", "Waktu"), /tidak valid/);
    assert.equal(formatDuration(49), "49 dtk");
    assert.equal(formatDuration(17.4), "17,4 dtk");
    assert.equal(formatDuration(65), "1:05");
  });

  it("peringkat: hasil tertinggi pertama, yang kosong di belakang", () => {
    const ranks = rankOf([
      { siswa_id: "a", akhir: 70 },
      { siswa_id: "b", akhir: null },
      { siswa_id: "c", akhir: 88 },
    ]);
    assert.deepEqual([ranks.get("c"), ranks.get("a"), ranks.get("b")], [1, 2, 3]);
  });

  it("pengaturan bawaan blangko", async () => {
    const s = samaptaSettings(await emptyTables());
    assert.equal(s.kop, "BIMBEL GARDA ABDI NEGARA");
    assert.equal(s.tempat, "Lap. Syekh Yusuf");
    assert.equal(s.ttd_nama, "PELTU. ADAM HIDI");
    assert.equal(s.ttd_jabatan, "Koordinator Materi");
    assert.deepEqual([s.baik_sekali, s.baik, s.cukup], [81, 61, 41]);
  });
});

describe("perintah samapta", () => {
  it("tes baru berisi semua siswa aktif, tempat bawaan dari pengaturan", async () => {
    const { t, tesId } = await setup();
    const test = toSamaptaTest(t.Tes_Samapta!.find((r) => r.tes_id === tesId)!);
    assert.deepEqual(test.peserta_ids, ["S1", "S2"]);
    assert.equal(test.tempat, "Lap. Syekh Yusuf");
    assert.equal(test.status, "BERJALAN");
  });

  it("menyimpan satu pos tanpa menyentuh pos lain", async () => {
    const { t, tesId } = await setup();
    saveSamaptaPos(t, pos({ tes_id: tesId, siswa_id: "S1", pos: "lari", lari_jarak: "2470", lari_nilai: "87" }), ctx(), owner);
    saveSamaptaPos(t, pos({ tes_id: tesId, siswa_id: "S1", pos: "badan", tinggi_cm: "179", berat_kg: "69,5" }), ctx(), owner);
    const r = toSamaptaResult(t.Hasil_Samapta!.find((row) => row.hasil_id === `${tesId}:S1`)!);
    assert.equal(r.lari_jarak, 2470);
    assert.equal(r.lari_nilai, 87);
    assert.equal(r.berat_kg, 69.5);
    assert.equal(t.Hasil_Samapta!.length, 2, "satu baris per peserta, disiapkan saat tes dibuat");
    assert.ok(posFilled(r, "lari") && posFilled(r, "badan") && !posFilled(r, "tensi"));
  });

  it("isian kosong menghapus nilai yang salah ketik", async () => {
    const { t, tesId } = await setup();
    saveSamaptaPos(t, pos({ tes_id: tesId, siswa_id: "S1", pos: "situp", situp_jumlah: "40", situp_nilai: "82" }), ctx(), owner);
    saveSamaptaPos(t, pos({ tes_id: tesId, siswa_id: "S1", pos: "situp", situp_jumlah: "40", situp_nilai: "" }), ctx(), owner);
    const r = toSamaptaResult(t.Hasil_Samapta!.find((row) => row.hasil_id === `${tesId}:S1`)!);
    assert.equal(r.situp_nilai, null);
    assert.equal(r.situp_jumlah, 40);
  });

  it("menolak tensi, nilai, dan gaya renang yang tidak valid", async () => {
    const { t, tesId } = await setup();
    assert.throws(() => saveSamaptaPos(t, pos({ tes_id: tesId, siswa_id: "S1", pos: "tensi", tensi_1: "120-80" }), ctx(), owner), /120\/80/);
    assert.throws(() => saveSamaptaPos(t, pos({ tes_id: tesId, siswa_id: "S1", pos: "lari", lari_jarak: "2400", lari_nilai: "101" }), ctx(), owner), /antara 0 dan 100/);
    assert.throws(() => saveSamaptaPos(t, pos({ tes_id: tesId, siswa_id: "S1", pos: "renang", renang_gaya: "Gaya katak", renang_waktu: "60" }), ctx(), owner), /gaya renang/);
    saveSamaptaPos(t, pos({ tes_id: tesId, siswa_id: "S1", pos: "tensi", tensi_1: "120 / 80", tensi_2: "118/78", tensi_3: "" }), ctx(), owner);
    assert.equal(t.Hasil_Samapta!.find((row) => row.hasil_id === `${tesId}:S1`)!.tensi_1, "120/80");
  });

  it("siswa bukan peserta ditolak; bisa ditambahkan sebagai peserta", async () => {
    const { t, tesId } = await setup();
    addStudent(t, "S4", "GAN-0004");
    assert.throws(() => saveSamaptaPos(t, pos({ tes_id: tesId, siswa_id: "S4", pos: "situp", situp_jumlah: "30" }), ctx(), owner), /bukan peserta/);
    addSamaptaParticipant(t, { tes_id: tesId, siswa_id: "S4" }, ctx(), owner);
    saveSamaptaPos(t, pos({ tes_id: tesId, siswa_id: "S4", pos: "situp", situp_jumlah: "30" }), ctx(), owner);
    assert.throws(() => addSamaptaParticipant(t, { tes_id: tesId, siswa_id: "S4" }, ctx(), owner), /sudah menjadi peserta/);
  });

  it("tes selesai mengunci isian sampai dibuka lagi", async () => {
    const { t, tesId } = await setup();
    setSamaptaStatus(t, { tes_id: tesId, status: "SELESAI" }, ctx(), owner);
    assert.throws(() => saveSamaptaPos(t, pos({ tes_id: tesId, siswa_id: "S1", pos: "situp", situp_jumlah: "30" }), ctx(), owner), /selesai/);
    setSamaptaStatus(t, { tes_id: tesId, status: "BERJALAN" }, ctx(), owner);
    saveSamaptaPos(t, pos({ tes_id: tesId, siswa_id: "S1", pos: "situp", situp_jumlah: "30" }), ctx(), owner);
  });

  it("siswa tidak boleh membuat tes atau mengisi hasil", async () => {
    const { t, tesId } = await setup();
    const siswa = actor("SISWA", { links: [link("SISWA", { siswa_id: "S1" })] });
    assert.throws(() => saveSamaptaPos(t, pos({ tes_id: tesId, siswa_id: "S1", pos: "situp", situp_jumlah: "99" }), ctx(), siswa), /akses/);
    assert.throws(() => saveSamaptaTest(t, { tes_id: "", nama: "", tanggal: "2026-11-20", jam_mulai: "07:00", tempat: "", catatan: "" }, ctx(), siswa), /akses/);
  });
});
