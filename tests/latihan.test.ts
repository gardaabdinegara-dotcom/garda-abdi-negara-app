import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hitungHasil, jawabanPenjumlahan, PRESET } from "../src/lib/core/latihan";
import { latihanInput } from "../src/lib/core/latihan-input";
import { LATIHAN_TABLES, parseSeri, saveLatihan, toLatihan } from "../src/lib/core/latihan-simpan";
import type { Tables } from "../src/lib/data/types";
import { actor, ctx, emptyTables, link } from "./helpers";

const seri = (pairs: [number, number][]) => pairs.map(([benar, jawab]) => ({ benar, jawab }));

describe("penilaian latihan psikotes", () => {
  it("kunci penjumlahan memakai angka terakhir", () => {
    assert.equal(jawabanPenjumlahan(7, 8), 5);
    assert.equal(jawabanPenjumlahan(3, 4), 7);
    assert.equal(jawabanPenjumlahan(5, 5), 0);
  });

  it("pengerjaan rata tanpa salah: stabil, mendatar, ketelitian penuh", () => {
    const h = hitungHasil("kraepelin", seri(Array.from({ length: 10 }, () => [20, 20] as [number, number])), 300);
    assert.equal(h.dijawab, 200);
    assert.equal(h.benar, 200);
    assert.equal(h.salah, 0);
    assert.equal(h.kecepatan, 40);
    assert.equal(h.ketelitian, 100);
    assert.equal(h.stabilitas, 0);
    assert.equal(h.performa, 0);
    assert.equal(h.kategori?.ketelitian.nama, "Tinggi");
    assert.equal(h.kategori?.stabilitas.nama, "Tinggi");
    assert.equal(h.kategori?.performa.nama, "Mendatar");
    assert.equal(h.kategori?.kecepatan.nama, "Cukup tinggi");
    // .35*100 + .30*(40/65.33*100) + .20*100 + .15*85
    assert.equal(h.skor, Math.round(35 + 0.3 * ((40 / 65.33) * 100) + 20 + 0.15 * 85));
    assert.deepEqual(h.kurva, Array(10).fill(20));
  });

  it("kurva menurun terbaca sebagai performa turun", () => {
    const h = hitungHasil("pauli", seri([[30, 30], [27, 28], [24, 25], [21, 22], [18, 19], [15, 16]]), 180);
    assert.ok(h.performa < -20, `performa ${h.performa}`);
    assert.equal(h.kategori?.performa.nama, "Turun drastis");
    assert.ok(h.stabilitas > 12.5);
    assert.ok(h.skorAspek.performa >= 25);
  });

  it("ketelitian memakai batas kurang-dari seperti prototipe", () => {
    // 939 benar dari 1000 = 93.9% → bukan "Rendah" (batas Rendah < 93.9)
    const h = hitungHasil("kraepelin", seri([[939, 1000]]), 600);
    assert.equal(h.ketelitian, 93.9);
    assert.equal(h.kategori?.ketelitian.nama, "Cukup rendah");
  });

  it("kecermatan tanpa tabel kategori dan memakai kecepatan penuh 50/menit", () => {
    const h = hitungHasil("simbol", seri([[50, 50], [50, 50]]), 120);
    assert.equal(h.kategori, null);
    assert.equal(h.skorAspek.kecepatan, 100);
  });

  it("tanpa jawaban tidak menghasilkan NaN", () => {
    const h = hitungHasil("angka", seri([[0, 0]]), 60);
    for (const v of [h.kecepatan, h.ketelitian, h.stabilitas, h.performa, h.skor]) assert.ok(Number.isFinite(v));
    assert.equal(h.ketelitian, 0);
    assert.equal(h.skor, 0);
  });

  it("semua jawaban salah tidak dianggap stabil", () => {
    const h = hitungHasil("kraepelin", seri([[0, 12], [0, 14]]), 60);
    assert.equal(h.skor, 0);
    assert.equal(h.skorAspek.stabilitas, 0);
    assert.equal(h.kategori?.stabilitas.nama, "Rendah");
  });
});

describe("validasi kiriman latihan", () => {
  it("membaca seri JSON", () => {
    const input = latihanInput.parse({ jenis: "pauli", durasi: "singkat", mulai: "2026-11-13T02:00:00.000Z", detik: "180", seri: "[[10,11],[12,12]]" });
    assert.deepEqual(input.seri, seri([[10, 11], [12, 12]]));
    assert.equal(input.detik, 180);
  });

  it("menolak seri rusak, jenis asing, dan angka pecahan", () => {
    const base = { jenis: "pauli", durasi: "singkat", mulai: "", detik: "180" };
    assert.throws(() => latihanInput.parse({ ...base, seri: "bukan json" }));
    assert.throws(() => latihanInput.parse({ ...base, seri: "[]" }));
    assert.throws(() => latihanInput.parse({ ...base, seri: "[[1.5,2]]" }));
    assert.throws(() => latihanInput.parse({ ...base, jenis: "catur", seri: "[[1,2]]" }));
  });

  it("parseSeri tahan data rusak", () => {
    assert.deepEqual(parseSeri("rusak"), []);
    assert.deepEqual(parseSeri(""), []);
    assert.deepEqual(parseSeri("[[3,4]]"), seri([[3, 4]]));
  });
});

describe("menyimpan latihan", () => {
  async function setup() {
    const t = await emptyTables();
    t.Siswa!.push({ siswa_id: "S1", kode_siswa: "GAN-0001", nama: "SISWA SATU", jenis_kelamin: "L", aktif: true, tanggal_daftar: "2026-10-01" });
    t.Siswa!.push({ siswa_id: "S2", kode_siswa: "GAN-0002", nama: "SISWA DUA", jenis_kelamin: "P", aktif: false, tanggal_daftar: "2026-10-01" });
    // Seperti saat aksi berjalan: tab latihan tidak dibaca (diperlakukan sebagai log).
    const loaded: Tables = Object.fromEntries(LATIHAN_TABLES.map((name) => [name, t[name]!]));
    return loaded;
  }
  const siswa = actor("SISWA", { links: [link("SISWA", { siswa_id: "S1" })] });
  const input = { jenis: "pauli", durasi: "singkat", mulai: "2026-11-13T02:55:00.000Z", detik: 180, seri: seri([[20, 21], [22, 22], [21, 22], [23, 23], [22, 23], [24, 24]]) };

  it("siswa menyimpan satu baris dan skor dihitung di server", async () => {
    const t = await setup();
    const out = saveLatihan(t, input, ctx(), siswa);
    assert.equal(t.Latihan_Psikotes!.length, 1);
    const row = t.Latihan_Psikotes![0]!;
    assert.equal(row.siswa_id, "S1");
    assert.equal(row.tanggal, "2026-11-13");
    assert.equal(row.seri_json, "[[20,21],[22,22],[21,22],[23,23],[22,23],[24,24]]");
    const back = toLatihan(row);
    assert.equal(back.skor, hitungHasil("pauli", input.seri, 180).skor);
    assert.equal(Number(row.skor), back.skor);
    assert.equal(out.entityId, row.latihan_id);
  });

  it("owner tidak menyimpan (mencoba saja)", async () => {
    const t = await setup();
    assert.throws(() => saveLatihan(t, input, ctx(), actor("OWNER")), /akun siswa/);
  });

  it("siswa nonaktif ditolak", async () => {
    const t = await setup();
    const nonaktif = actor("SISWA", { links: [link("SISWA", { siswa_id: "S2" })] });
    assert.throws(() => saveLatihan(t, input, ctx(), nonaktif), /tidak aktif/);
  });

  it("menolak data tidak wajar", async () => {
    const t = await setup();
    const batas = PRESET.pauli.singkat.bagian * PRESET.pauli.singkat.detik;
    assert.throws(() => saveLatihan(t, { ...input, detik: batas + 120 }, ctx(), siswa), /Lama latihan/);
    assert.throws(() => saveLatihan(t, { ...input, seri: seri([[5, 4]]) }, ctx(), siswa), /tidak wajar/);
    assert.throws(() => saveLatihan(t, { ...input, seri: [] }, ctx(), siswa), /Belum ada jawaban/);
  });

  it("kolom berlebih dipotong sesuai durasi", async () => {
    const t = await setup();
    saveLatihan(t, { ...input, seri: seri(Array.from({ length: 12 }, () => [10, 10] as [number, number])) }, ctx(), siswa);
    assert.equal(JSON.parse(String(t.Latihan_Psikotes![0]!.seri_json)).length, PRESET.pauli.singkat.bagian);
  });
});
