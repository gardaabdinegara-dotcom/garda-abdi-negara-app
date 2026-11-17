import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultPos,
  durationInput,
  fmt,
  isPosComplete,
  klasRanges,
  missingPos,
  normalizeDuration,
  normalizeTensi,
  overallProgress,
  posInputValues,
  progressSentence,
  roman,
} from "../src/app/(ruang)/samapta/samapta-ui";
import { POS, scoreOf, toSamaptaResult, type Pos } from "../src/lib/core/samapta";

const settings = { baik_sekali: 81, baik: 61, cukup: 41 };
const full = {
  hasil_id: "T:S",
  tes_id: "T",
  siswa_id: "S",
  tensi_1: "120/80",
  tensi_2: "118/78",
  tensi_3: "121/79",
  tinggi_cm: 170,
  berat_kg: 64.5,
  lari_jarak: 2400,
  lari_nilai: 70,
  pull_jumlah: 10,
  pull_nilai: 70,
  situp_jumlah: 35,
  situp_nilai: 70,
  pushup_jumlah: 30,
  pushup_nilai: 70,
  shuttle_waktu: 17.4,
  shuttle_nilai: 70,
  renang_gaya: "Dada",
  renang_waktu: 65,
};
const scored = (row: Record<string, unknown>) => {
  const result = toSamaptaResult(row as never);
  return { result, score: scoreOf(result, "L", settings) };
};

describe("tampilan samapta", () => {
  it("angka Romawi untuk nama sesi berikutnya", () => {
    assert.deepEqual([1, 2, 3, 4, 9, 12, 40].map(roman), ["I", "II", "III", "IV", "IX", "XII", "XL"]);
  });

  it("angka gaya Indonesia, kosong jadi tanda strip", () => {
    assert.equal(fmt(75.904), "75,9");
    assert.equal(fmt(2400, 0), "2.400");
    assert.equal(fmt(null), "-");
  });

  it("rentang klasifikasi dari pengaturan", () => {
    assert.deepEqual(
      klasRanges(settings).map((r) => r.teks),
      ["≥ 81", "61–80", "41–60", "≤ 40"],
    );
  });

  it("tensi dari papan angka dirapikan jadi 120/80", () => {
    assert.equal(normalizeTensi("120.80"), "120/80");
    assert.equal(normalizeTensi("120 80"), "120/80");
    assert.equal(normalizeTensi("12080"), "120/80");
    assert.equal(normalizeTensi("9060"), "90/60");
    assert.equal(normalizeTensi("120/80"), "120/80");
    assert.equal(normalizeTensi("abc"), "abc");
    assert.equal(normalizeTensi(" "), "");
  });

  it("waktu renang: menit.detik dibaca sebagai menit:detik", () => {
    assert.equal(normalizeDuration("1.05"), "1:05");
    assert.equal(normalizeDuration("1,30"), "1:30");
    assert.equal(normalizeDuration("65"), "65");
    assert.equal(normalizeDuration("45,5"), "45,5");
    assert.equal(durationInput(65), "1:05");
    assert.equal(durationInput(94.5), "1:34,5");
    assert.equal(durationInput(49.5), "49,5");
    assert.equal(durationInput(null), "");
  });

  it("nilai awal isian per pos memakai koma desimal", () => {
    const { result } = scored(full);
    assert.deepEqual(posInputValues(result, "badan"), { tinggi_cm: "170", berat_kg: "64,5" });
    assert.deepEqual(posInputValues(result, "shuttle"), { shuttle_waktu: "17,4", shuttle_nilai: "70" });
    assert.deepEqual(posInputValues(result, "renang"), { renang_gaya: "Dada", renang_waktu: "1:05" });
    for (const pos of POS) assert.equal(isPosComplete(pos, posInputValues(result, pos)), true, pos);
  });

  it("kelengkapan: riwayat tidak wajib, kolom kosong belum lengkap", () => {
    assert.equal(isPosComplete("tensi", { tensi_1: "120/80", tensi_2: "120/80", tensi_3: "120/80", riwayat_1: "" }), true);
    assert.equal(isPosComplete("lari", { lari_jarak: "2400", lari_nilai: "" }), false);
    assert.deepEqual(missingPos(scored({ ...full, renang_gaya: "", shuttle_nilai: "" }).result), ["shuttle", "renang"]);
  });

  it("kemajuan isian dan pos bawaan", () => {
    const progress = Object.fromEntries(POS.map((p) => [p, 11])) as Record<Pos, number>;
    progress.shuttle = 10;
    progress.renang = 9;
    assert.deepEqual(overallProgress(progress, 11), { filled: 85, total: 88, persen: (85 / 88) * 100 });
    assert.equal(defaultPos(progress, 11), "shuttle");
    assert.equal(defaultPos({ ...progress, shuttle: 11, renang: 11 }, 11), "tensi");
  });

  it("kalimat perkembangan menyebut kenaikan dan materi yang turun", () => {
    const prev = scored({ ...full, lari_nilai: 60, pushup_nilai: 80 });
    const cur = scored({ ...full, lari_nilai: 80, pushup_nilai: 70 });
    const text = progressSentence(prev, cur);
    assert.match(text, /^Hasil akhir naik 8,75 poin, dari 66,25 menjadi 75\./);
    assert.match(text, /paling banyak di Lari 12 menit \(\+20\)/);
    assert.match(text, /Push up turun 10/);
    assert.equal(progressSentence(scored({ ...full, lari_nilai: null }), scored(full)), "Semua materi tetap, tidak ada yang turun.");
  });
});
