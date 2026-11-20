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
import { ageAt, garjasAgeBand, garjasScore, nilaiRenang } from "../src/lib/core/samapta-garjas";
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
  it("memilih kelompok umur dari usia pada tanggal tes", () => {
    assert.equal(ageAt("2000-11-16", "2026-11-15"), 25);
    assert.equal(ageAt("2000-11-16", "2026-11-16"), 26);
    assert.equal(ageAt("2000-02-30", "2026-11-15"), null);
    assert.equal(garjasAgeBand(null), "18–25");
    assert.equal(garjasAgeBand(17), "18–25");
    assert.equal(garjasAgeBand(59), "56–58");
    assert.equal(garjasScore("lari", 2500, "L", 25), 47);
    assert.equal(garjasScore("lari", 2500, "L", 26), 52);
    assert.equal(garjasScore("lari", 2500, "P", 25), 88);
  });

  it("membaca setiap materi dari tabel putra dan putri dan memakai ambang yang tercapai", () => {
    assert.equal(garjasScore("lari", 3507, "L", 18), 100);
    assert.equal(garjasScore("lari", 3506, "L", 18), 99);
    assert.equal(garjasScore("lari", 1768, "P", 18), 25);
    assert.equal(garjasScore("lari", 1775, "P", 18), 27, "ambang 1769 m bernilai 27 pada tabel yang urutannya terbalik");
    assert.equal(garjasScore("pull", 17, "L", 18), 95);
    assert.equal(garjasScore("pull", 62, "P", 18), 98);
    assert.equal(garjasScore("situp", 35, "L", 18), 70);
    assert.equal(garjasScore("situp", 35, "P", 18), 65);
    assert.equal(garjasScore("pushup", 28, "L", 18), 37);
    assert.equal(garjasScore("pushup", 28, "P", 18), 100);
    assert.equal(garjasScore("shuttle", 17.4, "L", 18), 85);
    assert.equal(garjasScore("shuttle", 17.41, "L", 18), 84);
    assert.equal(garjasScore("shuttle", 17.4, "P", 18), 98);
    assert.equal(garjasScore("shuttle", 29.1, "L", 58), 13, "waktu berulang memakai ambang dengan nilai tertinggi");
    assert.equal(garjasScore("pull", 0, "L", 58), 0);
    assert.equal(garjasScore("pushup", 1, "L", 58), 14);
    assert.equal(garjasScore("lari", null, "L", 18), null);
    assert.equal(garjasScore("lari", 2400, "", 18), null);
  });

  it("menilai renang gaya dada menurut kelompok umur dan memisahkannya dari hasil akhir", () => {
    assert.equal(nilaiRenang("Dada", 45, 18), 100);
    assert.equal(nilaiRenang("Dada", 65.01, 18), 79);
    assert.equal(nilaiRenang("Dada", 65, 36), 89);
    assert.equal(nilaiRenang("Dada", 160, 58), 12);
    assert.equal(nilaiRenang("Bebas", 65, 18), null);
    const r = toSamaptaResult({ lari_nilai: 87, pull_nilai: 86, situp_nilai: 93, pushup_nilai: 92, shuttle_nilai: 81, renang_gaya: "Dada", renang_waktu: 65 });
    const s = scoreOf(r, "P", settings, 26);
    assert.equal(s.renang, 83);
    assert.equal(s.akhir, 87.5);
  });

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
    assert.equal(parseDuration("1,05", "Waktu"), 65);
    assert.equal(parseDuration("1:05,01", "Waktu"), 65.01);
    assert.equal(parseDuration("49,5", "Waktu"), 49.5);
    assert.equal(parseDuration("", "Waktu"), null);
    assert.throws(() => parseDuration("abc", "Waktu"), /tidak valid/);
    assert.equal(formatDuration(49), "49 dtk");
    assert.equal(formatDuration(17.4), "17,4 dtk");
    assert.equal(formatDuration(65), "1:05");
    assert.equal(formatDuration(65.01), "1:05,01");
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
    assert.equal(s.tempat, "");
    assert.equal(s.ttd_nama, "ADAM HIDI");
    assert.equal(s.ttd_jabatan, "Koordinator Materi");
    assert.deepEqual([s.baik_sekali, s.baik, s.cukup], [81, 61, 41]);
  });
});

describe("perintah samapta", () => {
  it("tes baru berisi semua siswa aktif, tempat kosong bila pengaturan belum diisi", async () => {
    const { t, tesId } = await setup();
    const test = toSamaptaTest(t.Tes_Samapta!.find((r) => r.tes_id === tesId)!);
    assert.deepEqual(test.peserta_ids, ["S1", "S2"]);
    assert.equal(test.tempat, "");
    assert.equal(test.status, "BERJALAN");
  });

  it("tempat tes baru memakai tempat bawaan bila diisi di pengaturan", async () => {
    const t = await emptyTables();
    addStudent(t, "S1", "GAN-0001");
    const row = t.Pengaturan!.find((r) => r.key === "samapta_tempat");
    if (row) row.value = "Lapangan Contoh";
    else t.Pengaturan!.push({ key: "samapta_tempat", value: "Lapangan Contoh" });
    assert.equal(samaptaSettings(t).tempat, "Lapangan Contoh");
    const out = saveSamaptaTest(t, { tes_id: "", nama: "", tanggal: "2026-11-15", jam_mulai: "07:00", tempat: "", catatan: "" }, ctx(), owner);
    assert.equal(toSamaptaTest(t.Tes_Samapta!.find((r) => r.tes_id === out.entityId)!).tempat, "Lapangan Contoh");
  });

  it("server menghitung nilai dari hasil ukur dan menyimpan satu pos tanpa menyentuh pos lain", async () => {
    const { t, tesId } = await setup();
    saveSamaptaPos(t, { tes_id: tesId, siswa_id: "S1", pos: "lari", lari_jarak: "2470", lari_nilai: "87" }, ctx(), owner);
    saveSamaptaPos(t, pos({ tes_id: tesId, siswa_id: "S1", pos: "badan", tinggi_cm: "179", berat_kg: "69,5" }), ctx(), owner);
    const r = toSamaptaResult(t.Hasil_Samapta!.find((row) => row.hasil_id === `${tesId}:S1`)!);
    assert.equal(r.lari_jarak, 2470);
    assert.equal(r.lari_nilai, 45);
    assert.equal(r.berat_kg, 69.5);
    assert.equal(t.Hasil_Samapta!.length, 2, "satu baris per peserta, disiapkan saat tes dibuat");
    assert.ok(posFilled(r, "lari") && posFilled(r, "badan") && !posFilled(r, "tensi"));
  });

  it("isian kosong menghapus nilai yang salah ketik", async () => {
    const { t, tesId } = await setup();
    saveSamaptaPos(t, pos({ tes_id: tesId, siswa_id: "S1", pos: "situp", situp_jumlah: "40" }), ctx(), owner);
    saveSamaptaPos(t, pos({ tes_id: tesId, siswa_id: "S1", pos: "situp", situp_jumlah: "" }), ctx(), owner);
    const r = toSamaptaResult(t.Hasil_Samapta!.find((row) => row.hasil_id === `${tesId}:S1`)!);
    assert.equal(r.situp_nilai, null);
    assert.equal(r.situp_jumlah, null);
  });

  it("membaca jenis kelamin dan umur siswa saat menyimpan, sementara nilai lama dibaca apa adanya", async () => {
    const { t, tesId } = await setup();
    t.Siswa!.find((r) => r.siswa_id === "S2")!.tanggal_lahir = "2000-11-15";
    const old = t.Hasil_Samapta!.find((r) => r.hasil_id === `${tesId}:S1`)!;
    Object.assign(old, { lari_jarak: 2500, lari_nilai: 70 });
    saveSamaptaPos(t, pos({ tes_id: tesId, siswa_id: "S2", pos: "lari", lari_jarak: "2500" }), ctx(), owner);
    saveSamaptaPos(t, pos({ tes_id: tesId, siswa_id: "S1", pos: "pull", pull_jumlah: "0" }), ctx(), owner);
    const a = toSamaptaResult(t.Hasil_Samapta!.find((r) => r.hasil_id === `${tesId}:S1`)!);
    const b = toSamaptaResult(t.Hasil_Samapta!.find((r) => r.hasil_id === `${tesId}:S2`)!);
    assert.equal(a.lari_nilai, 70);
    assert.equal(a.pull_nilai, 0);
    assert.ok(posFilled(a, "pull"));
    assert.equal(b.lari_nilai, 93);
  });

  it("menolak tensi, jarak, dan gaya renang yang tidak valid", async () => {
    const { t, tesId } = await setup();
    assert.throws(() => saveSamaptaPos(t, pos({ tes_id: tesId, siswa_id: "S1", pos: "tensi", tensi_1: "120-80" }), ctx(), owner), /120\/80/);
    assert.throws(() => saveSamaptaPos(t, pos({ tes_id: tesId, siswa_id: "S1", pos: "lari", lari_jarak: "2400,5" }), ctx(), owner), /bilangan bulat/);
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
