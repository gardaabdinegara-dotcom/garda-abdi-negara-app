import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hitungHasil, PRESET, SIMBOL } from "../src/lib/core/latihan";
import { latihanInput } from "../src/lib/core/latihan-input";
import { saveLatihan, toLatihan } from "../src/lib/core/latihan-simpan";
import { actor, ctx, emptyTables, link } from "./helpers";
import {
  acakBerbenih,
  acakUrutan,
  bacaTertunda,
  BATAS_TERTUNDA,
  buatKiriman,
  DEPAN,
  deretBaru,
  hapusTertunda,
  idOperasi,
  isiForm,
  jamMundur,
  jawabDeret,
  jawabSesi,
  jendelaDeret,
  keteranganDurasi,
  kunciBaru,
  kunciDeret,
  majuWaktu,
  ringkasSesi,
  seriDariKiriman,
  sesiBaru,
  sisaWaktu,
  soalBaru,
  tambahTertunda,
  type KirimanLatihan,
  type Sesi,
} from "../src/lib/core/latihan-soal";

const detik = (s: number) => s * 1000;

/** Menjawab benar (atau salah) pada soal yang sedang tampil. */
function jawabBenar(s: Sesi, acak: () => number, benar = true): Sesi {
  if (s.deret) {
    const k = kunciDeret(s.deret);
    return jawabSesi(s, benar ? k : (k + 1) % 10, acak);
  }
  const h = s.soal!.hilang;
  return jawabSesi(s, benar ? h : (h + 1) % 5, acak);
}

describe("sumber acak", () => {
  it("benih sama memberi urutan sama, benih beda memberi urutan beda", () => {
    const a = acakBerbenih(42);
    const b = acakBerbenih(42);
    const c = acakBerbenih(43);
    const xa = Array.from({ length: 5 }, a);
    assert.deepEqual(xa, Array.from({ length: 5 }, b));
    assert.notDeepEqual(xa, Array.from({ length: 5 }, c));
    assert.ok(xa.every((x) => x >= 0 && x < 1));
  });

  it("mengacak urutan tanpa kehilangan butir", () => {
    const asal = [1, 2, 3, 4, 5, 6];
    const hasil = acakUrutan(asal, acakBerbenih(7));
    assert.deepEqual([...hasil].sort(), asal);
    assert.deepEqual(asal, [1, 2, 3, 4, 5, 6]);
  });
});

describe("deret Kraepelin/Pauli", () => {
  it("deret baru berisi angka 1 sampai 9 dan cukup untuk pasangan pertama", () => {
    const d = deretBaru(acakBerbenih(1));
    assert.equal(d.angka.length, 2 + DEPAN);
    assert.ok(d.angka.every((n) => Number.isInteger(n) && n >= 1 && n <= 9));
    assert.deepEqual(d.jawab, []);
  });

  it("kunci adalah angka terakhir dari jumlah pasangan aktif, dan angka terus dibuat", () => {
    const acak = acakBerbenih(2);
    let d = deretBaru(acak);
    for (let i = 0; i < 500; i++) {
      const kunci = (d.angka[i]! + d.angka[i + 1]!) % 10;
      assert.equal(kunciDeret(d), kunci);
      const r = jawabDeret(d, i % 3 === 0 ? (kunci + 1) % 10 : kunci, acak);
      assert.equal(r.benar, i % 3 !== 0);
      d = r.deret;
      assert.ok(d.angka.length >= d.jawab.length + 2 + DEPAN, "angka tidak pernah habis");
    }
    assert.equal(d.jawab.length, 500);
  });

  it("jendela tampilan selalu sama panjang dan pasangan aktif di tengah", () => {
    const acak = acakBerbenih(3);
    let d = deretBaru(acak);
    const panjang = jendelaDeret(d, "turun").length;
    for (let i = 0; i < 6; i++) {
      for (const arah of ["naik", "turun"] as const) {
        const rows = jendelaDeret(d, arah);
        assert.equal(rows.length, panjang);
        const tengah = Math.floor(rows.length / 2);
        assert.deepEqual(rows[tengah], { tipe: "sela", isi: "slot" });
        // Baris angka dan sela berselang-seling.
        rows.forEach((r, k) => assert.equal(r.tipe, k % 2 === 0 ? "angka" : "sela"));
      }
      d = jawabDeret(d, kunciDeret(d), acak).deret;
    }
  });

  it("Pauli dibaca dari atas, Kraepelin dari bawah", () => {
    const d = { angka: [1, 2, 3, 4, 5, 6, 7], jawab: [3, 5] };
    const turun = jendelaDeret(d, "turun");
    const aktifTurun = turun.filter((r) => r.tipe === "angka" && r.posisi === "aktif").map((r) => (r.tipe === "angka" ? r.nilai : null));
    assert.deepEqual(aktifTurun, [3, 4]);
    const aktifNaik = jendelaDeret(d, "naik")
      .filter((r) => r.tipe === "angka" && r.posisi === "aktif")
      .map((r) => (r.tipe === "angka" ? r.nilai : null));
    assert.deepEqual(aktifNaik, [4, 3]);
  });

  it("garis Pauli muncul di bawah jawaban terakhir sebelum interval berganti", () => {
    const d = { angka: [1, 2, 3, 4, 5, 6, 7], jawab: [3, 5] };
    const rows = jendelaDeret(d, "turun", [2]);
    const jawab = rows.filter((r) => r.tipe === "sela" && r.isi === "jawab");
    assert.deepEqual(
      jawab.map((r) => (r.tipe === "sela" && r.isi === "jawab" ? [r.nilai, r.garis] : null)),
      [
        [3, false],
        [5, true],
      ],
    );
  });

  it("awal kolom diisi baris kosong, bukan angka palsu", () => {
    const rows = jendelaDeret({ angka: [4, 9, 6, 1, 2], jawab: [] }, "turun");
    assert.deepEqual(rows[0], { tipe: "angka", nilai: null, posisi: "lalu", dekat: false });
    assert.deepEqual(rows[1], { tipe: "sela", isi: "kosong" });
  });
});

describe("kecermatan: angka hilang dan simbol hilang", () => {
  it("kunci berisi lima butir berbeda dari kumpulan yang benar", () => {
    const acak = acakBerbenih(4);
    for (let i = 0; i < 50; i++) {
      const angka = kunciBaru("angka", acak);
      assert.equal(new Set(angka).size, 5);
      assert.ok(angka.every((x) => /^[0-9]$/.test(x)));
      const simbol = kunciBaru("simbol", acak);
      assert.equal(new Set(simbol).size, 5);
      assert.ok(simbol.every((x) => (SIMBOL as readonly string[]).includes(x)));
    }
  });

  it("kunci kolom baru berbeda dari kunci sebelumnya", () => {
    const acak = acakBerbenih(5);
    let kunci = kunciBaru("angka", acak);
    for (let i = 0; i < 50; i++) {
      const baru = kunciBaru("angka", acak, kunci);
      assert.notDeepEqual(baru, kunci);
      kunci = baru;
    }
  });

  it("soal menampilkan empat butir; yang hilang tidak tampil", () => {
    const acak = acakBerbenih(6);
    const kunci = ["3", "8", "1", "6", "9"];
    let soal = soalBaru(kunci, acak);
    for (let i = 0; i < 200; i++) {
      assert.equal(soal.tampil.length, 4);
      assert.ok(soal.hilang >= 0 && soal.hilang <= 4);
      assert.ok(!soal.tampil.includes(kunci[soal.hilang]!));
      assert.deepEqual([...soal.tampil, kunci[soal.hilang]!].sort(), [...kunci].sort());
      const baru = soalBaru(kunci, acak, soal);
      assert.notDeepEqual(baru.tampil, soal.tampil, "soal berikutnya selalu tampak berbeda");
      soal = baru;
    }
  });

  it("jawaban yang hilang tersebar ke kelima huruf", () => {
    const acak = acakBerbenih(8);
    const kunci = kunciBaru("simbol", acak);
    const n = [0, 0, 0, 0, 0];
    for (let i = 0; i < 1000; i++) n[soalBaru(kunci, acak).hilang]! += 1;
    assert.ok(n.every((x) => x > 120), `sebaran ${n.join(",")}`);
  });
});

describe("sesi latihan", () => {
  it("Kraepelin: jawaban tercatat per kolom dan kolom baru memakai deret baru", () => {
    const acak = acakBerbenih(10);
    let s = sesiBaru("kraepelin", "singkat", acak);
    assert.equal(s.bagianTotal, PRESET.kraepelin.singkat.bagian);
    assert.equal(s.detikBagian, 15);
    s = jawabBenar(s, acak);
    s = jawabBenar(s, acak);
    s = jawabBenar(s, acak, false);
    assert.deepEqual(s.seri, [{ benar: 2, jawab: 3 }]);
    const deretLama = s.deret;
    let r = majuWaktu(s, detik(14.9), acak);
    assert.equal(r.pindah, false);
    assert.equal(r.sesi, s, "tanpa perubahan bila bagian belum berganti");
    r = majuWaktu(s, detik(15), acak);
    assert.equal(r.pindah, true);
    s = r.sesi;
    assert.equal(s.bagian, 1);
    assert.notEqual(s.deret, deretLama);
    assert.deepEqual(s.deret!.jawab, []);
    s = jawabBenar(s, acak);
    assert.deepEqual(s.seri, [
      { benar: 2, jawab: 3 },
      { benar: 1, jawab: 1 },
    ]);
    assert.equal(s.dijawab, 4);
  });

  it("Pauli: deret berlanjut dan garis ditarik setiap interval", () => {
    const acak = acakBerbenih(11);
    let s = sesiBaru("pauli", "singkat", acak);
    for (let i = 0; i < 4; i++) s = jawabBenar(s, acak);
    const deret = s.deret!;
    s = majuWaktu(s, detik(30), acak).sesi;
    assert.equal(s.bagian, 1);
    assert.equal(s.deret, deret, "Pauli tidak pindah kolom");
    assert.deepEqual(s.garis, [4]);
    s = jawabBenar(s, acak);
    s = majuWaktu(s, detik(61), acak).sesi;
    assert.deepEqual(s.garis, [4, 5]);
    assert.deepEqual(
      s.seri.map((b) => b.jawab),
      [4, 1, 0],
    );
  });

  it("kecermatan: kunci baru dan nomor soal kembali ke 1 setiap kolom", () => {
    const acak = acakBerbenih(12);
    let s = sesiBaru("angka", "singkat", acak);
    assert.equal(s.nomor, 1);
    s = jawabBenar(s, acak);
    s = jawabBenar(s, acak, false);
    assert.equal(s.nomor, 3);
    const kunci = s.kunci;
    s = majuWaktu(s, detik(60), acak).sesi;
    assert.notDeepEqual(s.kunci, kunci);
    assert.equal(s.nomor, 1);
    assert.deepEqual(s.seri[0], { benar: 1, jawab: 2 });
  });

  it("waktu habis: semua bagian tercatat, termasuk yang terlewat saat layar tersembunyi", () => {
    const acak = acakBerbenih(13);
    let s = sesiBaru("simbol", "singkat", acak);
    s = jawabBenar(s, acak);
    const r = majuWaktu(s, detik(500), acak);
    assert.equal(r.sesi.selesai, true);
    assert.equal(r.pindah, false);
    assert.equal(r.sesi.seri.length, 3);
    assert.deepEqual(r.sesi.seri, [{ benar: 1, jawab: 1 }, { benar: 0, jawab: 0 }, { benar: 0, jawab: 0 }]);
    assert.equal(jawabSesi(r.sesi, 0, acak), r.sesi, "jawaban setelah selesai diabaikan");
    assert.deepEqual(ringkasSesi(r.sesi, detik(500)), { seri: r.sesi.seri, detik: 180 });
  });

  it("lompat beberapa bagian sekaligus hanya memberi satu aba-aba", () => {
    const acak = acakBerbenih(14);
    const s = sesiBaru("kraepelin", "standar", acak);
    const r = majuWaktu(s, detik(95), acak);
    assert.equal(r.pindah, true);
    assert.equal(r.sesi.bagian, 3);
    assert.equal(r.sesi.seri.length, 4);
  });

  it("jawaban tidak sah diabaikan", () => {
    const acak = acakBerbenih(15);
    const k = sesiBaru("kraepelin", "singkat", acak);
    assert.equal(jawabSesi(k, 10, acak), k);
    assert.equal(jawabSesi(k, -1, acak), k);
    assert.equal(jawabSesi(k, 1.5, acak), k);
    const a = sesiBaru("angka", "singkat", acak);
    assert.equal(jawabSesi(a, 5, acak), a);
  });

  it("sisa waktu bagian dan total", () => {
    const s = sesiBaru("pauli", "singkat", acakBerbenih(16));
    assert.deepEqual(sisaWaktu(s, detik(10)), { bagianMs: detik(20), totalMs: detik(170) });
    assert.deepEqual(sisaWaktu(s, detik(400)), { bagianMs: 0, totalMs: 0 });
  });
});

describe("ringkasan yang disimpan", () => {
  it("diakhiri lebih awal: hanya bagian yang selesai dihitung", () => {
    const acak = acakBerbenih(20);
    let s = sesiBaru("kraepelin", "singkat", acak);
    s = jawabBenar(s, acak);
    s = majuWaktu(s, detik(15), acak).sesi;
    s = jawabBenar(s, acak);
    s = majuWaktu(s, detik(31), acak).sesi;
    s = jawabBenar(s, acak);
    assert.deepEqual(ringkasSesi(s, detik(40)), { seri: [{ benar: 1, jawab: 1 }, { benar: 1, jawab: 1 }], detik: 30 });
  });

  it("diakhiri di bagian pertama: bagian itu dipakai dengan waktu sebenarnya", () => {
    const acak = acakBerbenih(21);
    let s = sesiBaru("angka", "standar", acak);
    s = jawabBenar(s, acak);
    s = jawabBenar(s, acak, false);
    assert.deepEqual(ringkasSesi(s, detik(12.4)), { seri: [{ benar: 1, jawab: 2 }], detik: 12 });
    assert.equal(ringkasSesi(s, detik(3)), null, "kurang dari 5 detik tidak disimpan");
  });

  it("tanpa jawaban tidak ada yang disimpan", () => {
    const acak = acakBerbenih(22);
    const s = sesiBaru("pauli", "singkat", acak);
    assert.equal(ringkasSesi(s, detik(20)), null);
    const habis = majuWaktu(s, detik(999), acak).sesi;
    assert.equal(ringkasSesi(habis, detik(999)), null);
  });

  it("kiriman lolos validasi server untuk setiap jenis dan durasi", () => {
    for (const jenis of ["kraepelin", "pauli", "angka", "simbol"] as const) {
      for (const durasi of ["singkat", "standar", "asli"] as const) {
        const acak = acakBerbenih(jenis.length * 7 + durasi.length);
        let s = sesiBaru(jenis, durasi, acak);
        for (let i = 0; i < 25; i++) s = jawabBenar(s, acak, i % 5 !== 0);
        s = majuWaktu(s, Number.MAX_SAFE_INTEGER, acak).sesi;
        const ringkas = ringkasSesi(s, Number.MAX_SAFE_INTEGER)!;
        const k = buatKiriman({ operationId: idOperasi(), jenis, durasi, mulai: "2026-11-17T03:00:00.000Z", pemilik: "USR_1", dibuat: "2026-11-17T03:05:00.000Z", ringkas });
        const form = Object.fromEntries(isiForm(k));
        const parsed = latihanInput.parse(form);
        const preset = PRESET[jenis][durasi];
        assert.equal(parsed.seri.length, preset.bagian);
        assert.equal(parsed.detik, preset.bagian * preset.detik);
        assert.ok(parsed.detik <= preset.bagian * preset.detik + 30);
        assert.deepEqual(seriDariKiriman(k), ringkas.seri);
        assert.equal(hitungHasil(jenis, parsed.seri, parsed.detik).dijawab, 25);
      }
    }
  });
});

describe("kiriman sampai ke penyimpanan", () => {
  it("server menyimpan dan menilai sama dengan hitungan di HP", async () => {
    const t = await emptyTables();
    t.Siswa!.push({ siswa_id: "S1", kode_siswa: "GAN-0001", nama: "SISWA SATU", jenis_kelamin: "L", aktif: true, tanggal_daftar: "2026-10-01" });
    const siswa = actor("SISWA", { links: [link("SISWA", { siswa_id: "S1" })] });
    const acak = acakBerbenih(30);
    let s = sesiBaru("pauli", "singkat", acak);
    for (let i = 0; i < 6; i++) {
      for (let n = 0; n < 20 + i; n++) s = jawabBenar(s, acak, n % 9 !== 0);
      s = majuWaktu(s, detik(30 * (i + 1)), acak).sesi;
    }
    assert.equal(s.selesai, true);
    const ringkas = ringkasSesi(s, detik(180))!;
    const lokal = hitungHasil("pauli", ringkas.seri, ringkas.detik);
    const k = buatKiriman({ operationId: idOperasi(), jenis: "pauli", durasi: "singkat", mulai: "2026-11-17T03:00:00.000Z", pemilik: siswa.user.user_id, dibuat: "2026-11-17T03:03:00.000Z", ringkas });
    const input = latihanInput.parse(Object.fromEntries(isiForm(k)));
    const out = saveLatihan(t, input, ctx(), siswa);
    const disimpan = toLatihan(t.Latihan_Psikotes!.find((r) => r.latihan_id === out.entityId)!);
    assert.equal(disimpan.skor, lokal.skor);
    assert.deepEqual(disimpan.kurva, lokal.kurva);
    assert.equal(disimpan.detik, 180);
  });
});

describe("simpanan tertunda di HP", () => {
  const contoh = (over: Partial<KirimanLatihan> = {}): KirimanLatihan => ({
    operation_id: idOperasi(),
    jenis: "kraepelin",
    durasi: "singkat",
    mulai: "2026-11-17T03:00:00.000Z",
    detik: 300,
    seri: [
      [10, 12],
      [11, 11],
    ],
    pemilik: "USR_1",
    dibuat: "2026-11-17T03:05:00.000Z",
    ...over,
  });

  it("ID operasi berbentuk UUID v4", () => {
    for (let i = 0; i < 20; i++) assert.match(idOperasi(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("isi rusak diabaikan", () => {
    assert.deepEqual(bacaTertunda(null), []);
    assert.deepEqual(bacaTertunda("bukan json"), []);
    assert.deepEqual(bacaTertunda("{}"), []);
    const sah = contoh();
    const list = bacaTertunda(JSON.stringify([sah, { ...sah, operation_id: "x" }, { ...sah, jenis: "lain" }, { ...sah, seri: [] }, { ...sah, seri: [[1, -1]] }, 5]));
    assert.deepEqual(list, [sah]);
  });

  it("kiriman yang sama diganti, bukan digandakan; jumlahnya dibatasi", () => {
    const a = contoh();
    let list = tambahTertunda([], a);
    list = tambahTertunda(list, { ...a, detik: 299 });
    assert.equal(list.length, 1);
    assert.equal(list[0]!.detik, 299);
    for (let i = 0; i < BATAS_TERTUNDA + 3; i++) list = tambahTertunda(list, contoh());
    assert.equal(list.length, BATAS_TERTUNDA);
    assert.ok(!list.some((x) => x.operation_id === a.operation_id), "yang tertua dibuang");
    const b = list[0]!;
    assert.equal(hapusTertunda(list, b.operation_id).length, BATAS_TERTUNDA - 1);
  });
});

describe("teks bantu", () => {
  it("jam mundur dan keterangan durasi", () => {
    assert.equal(jamMundur(75_000), "01:15");
    assert.equal(jamMundur(74_001), "01:15");
    assert.equal(jamMundur(0), "00:00");
    assert.equal(jamMundur(-5), "00:00");
    assert.equal(keteranganDurasi("kraepelin", "singkat"), "20 kolom × 15 detik · total 5 menit");
    assert.equal(keteranganDurasi("kraepelin", "asli"), "45 kolom × 30 detik · total 22,5 menit");
    assert.equal(keteranganDurasi("pauli", "asli"), "20 interval × 3 menit · total 60 menit");
  });
});
