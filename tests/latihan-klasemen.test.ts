// Klasemen latihan: nilai mingguan per jenis, poin klasemen umum, tingkat, nama tampil, dan lencana.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hitungHasil, type Bagian, type DurasiLatihan, type JenisLatihan } from "../src/lib/core/latihan";
import {
  gerakUmum,
  klasemenMinggu,
  lencanaSiswa,
  namaKlasemen,
  rentangMinggu,
  riwayatMinggu,
  ringkasKlasemen,
  tanggalSingkat,
  tingkatSiswa,
} from "../src/lib/core/latihan-klasemen";
import type { Latihan } from "../src/lib/core/latihan-simpan";

const SENIN = "2026-11-16";
const MINGGU = "2026-11-22";

let n = 0;
/** Latihan dengan skor tertentu (skor ditimpa agar tes tidak bergantung pada rumus). */
function lat(siswaId: string, jenis: JenisLatihan, tanggal: string, skor: number, durasi: DurasiLatihan = "standar", stabilitas = 50): Latihan {
  const seri: Bagian[] = [{ benar: 10, jawab: 10 }];
  const hasil = hitungHasil(jenis, seri, 60);
  const urut = String(++n).padStart(4, "0");
  return {
    ...hasil,
    skorAspek: { ...hasil.skorAspek, stabilitas },
    skor,
    latihan_id: `LAT_${urut}`,
    siswa_id: siswaId,
    jenis,
    durasi,
    tanggal,
    mulai: `${tanggal}T01:00:${urut.slice(-2)}.000Z`,
    detik: 60,
    seri,
  };
}

/** Tiga latihan Standar satu jenis dalam minggu uji. */
const tiga = (id: string, jenis: JenisLatihan, a: number, b: number, c: number, hari = ["2026-11-16", "2026-11-17", "2026-11-18"]) => [
  lat(id, jenis, hari[0]!, a),
  lat(id, jenis, hari[1]!, b),
  lat(id, jenis, hari[2]!, c),
];

describe("klasemen satu minggu", () => {
  it("nilai jenis = rata-rata 3 skor Standar terbaik dalam minggu itu, minimal 3 latihan", () => {
    const data = [
      ...tiga("A", "kraepelin", 80, 90, 70),
      lat("A", "kraepelin", "2026-11-19", 85),
      lat("A", "kraepelin", "2026-11-19", 99, "singkat"), // bukan Standar
      lat("A", "kraepelin", "2026-11-15", 100), // minggu lalu
      lat("B", "kraepelin", "2026-11-16", 95),
      lat("B", "kraepelin", "2026-11-17", 95), // baru dua kali
    ];
    const k = klasemenMinggu(data, ["A", "B"], SENIN, MINGGU).jenis.kraepelin;
    assert.equal(k.baris.length, 1);
    assert.deepEqual(k.baris[0], { siswa_id: "A", peringkat: 1, nilai: 85, terbaik: [90, 85, 80], jumlah: 4, poin: 10 });
    assert.deepEqual(k.peserta.B, { jumlah: 2, skor: [95, 95] });
    assert.equal(k.belumCukup, 1);
  });

  it("poin 10, 8, 6, 5, 4, 3, 2, 1 untuk peringkat 1 sampai 8, lalu 0", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `S${i}`);
    const data = ids.flatMap((id, i) => tiga(id, "pauli", 90 - i, 90 - i, 90 - i));
    const k = klasemenMinggu(data, ids, SENIN, MINGGU);
    assert.deepEqual(k.jenis.pauli.baris.map((b) => b.poin), [10, 8, 6, 5, 4, 3, 2, 1, 0, 0]);
    // Peringkat 9 dan 10 belum dapat poin, jadi tidak tampil di klasemen umum.
    assert.equal(k.umum.length, 8);
    assert.equal(k.tanpaPoin, 2);
  });

  it("nilai sama: skor tunggal terbaik lebih tinggi di atas, lalu yang lebih dulu mencapai", () => {
    const data = [...tiga("A", "angka", 80, 80, 80), ...tiga("B", "angka", 90, 75, 75), ...tiga("C", "angka", 80, 80, 80, ["2026-11-16", "2026-11-16", "2026-11-16"])];
    const k = klasemenMinggu(data, ["A", "B", "C"], SENIN, MINGGU).jenis.angka;
    assert.deepEqual(k.baris.map((b) => b.siswa_id), ["B", "C", "A"]);
  });

  it("klasemen umum menjumlah poin keempat jenis; poin sama, rata-rata nilai lebih tinggi di atas", () => {
    const data = [
      ...tiga("A", "kraepelin", 90, 90, 90), // A #1 kraepelin (10)
      ...tiga("B", "kraepelin", 80, 80, 80), // B #2 kraepelin (8)
      ...tiga("B", "pauli", 70, 70, 70), // B #2 pauli (8)
      ...tiga("C", "pauli", 75, 75, 75), // C #1 pauli (10)
      ...tiga("C", "simbol", 60, 60, 60), // C #1 simbol (10)
      lat("D", "angka", "2026-11-18", 99), // latihan, tapi belum 3 kali
    ];
    const k = klasemenMinggu(data, ["A", "B", "C", "D", "E"], SENIN, MINGGU);
    assert.deepEqual(k.umum.map((r) => [r.siswa_id, r.poin]), [["C", 20], ["B", 16], ["A", 10]]);
    assert.deepEqual(k.umum[1]!.jenis, { kraepelin: { peringkat: 2, poin: 8 }, pauli: { peringkat: 2, poin: 8 }, angka: null, simbol: null });
    assert.equal(k.tanpaPoin, 1); // D
    assert.equal(k.belumLatihan, 1); // E

    const seri = klasemenMinggu([...tiga("X", "kraepelin", 90, 90, 90), ...tiga("Y", "pauli", 95, 95, 95)], ["X", "Y"], SENIN, MINGGU);
    assert.deepEqual(seri.umum.map((r) => r.siswa_id), ["Y", "X"]);
  });

  it("siswa di luar peserta (tidak aktif) tidak ikut dihitung", () => {
    const data = [...tiga("A", "kraepelin", 70, 70, 70), ...tiga("Z", "kraepelin", 99, 99, 99)];
    const k = klasemenMinggu(data, ["A"], SENIN, MINGGU);
    assert.deepEqual(k.jenis.kraepelin.baris.map((b) => [b.siswa_id, b.poin]), [["A", 10]]);
  });

  it("gerak peringkat dibanding akhir kemarin", () => {
    const data = [...tiga("A", "kraepelin", 80, 80, 80), ...tiga("B", "kraepelin", 70, 70, 70), lat("B", "pauli", "2026-11-16", 60), lat("B", "pauli", "2026-11-17", 60), lat("B", "pauli", "2026-11-19", 60)];
    const kemarin = klasemenMinggu(data, ["A", "B"], SENIN, "2026-11-18");
    const kini = klasemenMinggu(data, ["A", "B"], SENIN, "2026-11-19");
    assert.deepEqual(kini.umum.map((r) => [r.siswa_id, r.poin]), [["B", 18], ["A", 10]]);
    assert.deepEqual(gerakUmum(kini, kemarin, "B"), { arah: "naik", selisih: 1 });
    assert.deepEqual(gerakUmum(kini, kemarin, "A"), { arah: "turun", selisih: 1 });
    assert.equal(gerakUmum(kini, null, "A"), null, "Senin: belum ada pembanding");
    const baru = klasemenMinggu([...tiga("C", "angka", 70, 70, 70, ["2026-11-19", "2026-11-19", "2026-11-19"])], ["C"], SENIN, "2026-11-19");
    assert.deepEqual(gerakUmum(baru, klasemenMinggu([], ["C"], SENIN, "2026-11-18"), "C"), { arah: "baru", selisih: 0 });
    assert.deepEqual(ringkasKlasemen(kini, kemarin, "B"), { peringkat: 1, dari: 2, poin: 18, gerak: { arah: "naik", selisih: 1 } });
    assert.deepEqual(ringkasKlasemen(kini, kemarin, "X"), { peringkat: null, dari: 2, poin: 0, gerak: null });
  });

  it("riwayat minggu dari minggu latihan Standar pertama sampai minggu lalu", () => {
    const data = [lat("A", "kraepelin", "2026-11-03", 70), lat("A", "kraepelin", "2026-10-30", 70, "singkat")];
    const r = riwayatMinggu(data, ["A"], SENIN);
    assert.deepEqual(r.map((m) => [m.dari, m.sampai]), [["2026-11-02", "2026-11-08"], ["2026-11-09", "2026-11-15"]]);
    assert.deepEqual(riwayatMinggu([], ["A"], SENIN), []);
  });
});

describe("tingkat", () => {
  it("rata-rata 3 skor Standar terbaik 30 hari terakhir dengan batas 60, 75, 85", () => {
    const data = [
      ...tiga("A", "kraepelin", 86, 85, 88),
      ...tiga("A", "pauli", 80, 79, 79),
      lat("A", "angka", "2026-11-18", 90),
      ...tiga("A", "simbol", 99, 99, 99, ["2026-10-01", "2026-10-02", "2026-10-03"]), // lebih dari 30 hari
      lat("A", "simbol", "2026-11-18", 50),
      lat("A", "simbol", "2026-11-18", 55),
      lat("A", "simbol", "2026-11-18", 52),
    ];
    const t = tingkatSiswa(data, "2026-11-19");
    assert.deepEqual(t.kraepelin, { jenis: "kraepelin", nilai: 86.3, jumlah: 3, tingkat: 3, berikut: null });
    assert.deepEqual(t.pauli.berikut, { nama: "Emas", batas: 85, kurang: 5.7 });
    assert.equal(t.pauli.tingkat, 2);
    assert.deepEqual([t.angka.nilai, t.angka.tingkat, t.angka.jumlah], [null, null, 1]);
    assert.deepEqual([t.simbol.nilai, t.simbol.tingkat, t.simbol.berikut?.nama], [52.3, 0, "Perunggu"]);
  });
});

describe("tampilan", () => {
  it("nama depan dan inisial; nama kembar memakai dua kata pertama; huruf besar dirapikan", () => {
    const nama = namaKlasemen([
      { siswa_id: "1", nama: "Arif Pratama" },
      { siswa_id: "2", nama: "Muhammad Rizky Ananda" },
      { siswa_id: "3", nama: "Muhammad Rahmat" },
      { siswa_id: "4", nama: "SINTA MAHARANI" },
      { siswa_id: "5", nama: "Yusuf" },
    ]);
    assert.deepEqual(nama, { "1": "Arif P.", "2": "Muhammad Rizky A.", "3": "Muhammad Rahmat", "4": "Sinta M.", "5": "Yusuf" });
  });

  it("tanggal singkat dan rentang minggu", () => {
    assert.equal(tanggalSingkat("2026-11-19"), "19 Nov");
    assert.equal(rentangMinggu("2026-11-16", "2026-11-22"), "16 sampai 22 Nov");
    assert.equal(rentangMinggu("2026-11-30", "2026-12-06"), "30 Nov sampai 6 Des");
  });
});

describe("lencana", () => {
  const ambil = (daftar: ReturnType<typeof lencanaSiswa>, kode: string) => daftar.find((l) => l.kode === kode)!;

  it("juara dan podium hanya dari minggu yang sudah ditutup", () => {
    const lalu = [...tiga("A", "kraepelin", 90, 90, 90, ["2026-11-09", "2026-11-10", "2026-11-11"]), ...tiga("B", "kraepelin", 80, 80, 80, ["2026-11-09", "2026-11-10", "2026-11-11"])];
    const kini = [...tiga("B", "pauli", 90, 90, 90), ...tiga("A", "pauli", 80, 80, 80)];
    const data = [...lalu, ...kini];
    const mingguSelesai = riwayatMinggu(data, ["A", "B"], SENIN);
    const sekarang = klasemenMinggu(data, ["A", "B"], SENIN, "2026-11-19");
    const a = lencanaSiswa({ siswaId: "A", latihanSiswa: data.filter((l) => l.siswa_id === "A"), mingguSelesai, sekarang, hariIni: "2026-11-19" });
    const b = lencanaSiswa({ siswaId: "B", latihanSiswa: data.filter((l) => l.siswa_id === "B"), mingguSelesai, sekarang, hariIni: "2026-11-19" });
    assert.deepEqual([ambil(a, "juara_jenis").dapat, ambil(a, "juara_jenis").catatan], [true, "Kraepelin, 9 sampai 15 Nov"]);
    assert.deepEqual([ambil(a, "juara_umum").dapat, ambil(a, "podium_umum").dapat], [true, true]);
    // B memimpin minggu ini, tetapi lencana baru diberikan setelah minggu ditutup.
    assert.equal(ambil(b, "juara_umum").dapat, false);
    assert.equal(ambil(b, "juara_umum").catatan, "Minggu ini peringkat 1");
    assert.equal(ambil(b, "podium_umum").dapat, true, "B peringkat 2 minggu lalu");
    // Yang sudah didapat tampil lebih dulu.
    const urut = a.map((l) => l.dapat);
    assert.deepEqual(urut, [...urut].sort((x, y) => Number(y) - Number(x)));
  });

  it("rekor pribadi, naik tingkat, stabil, dan tahan uji", () => {
    const data = [
      lat("A", "kraepelin", "2026-11-02", 70, "standar", 95),
      lat("A", "kraepelin", "2026-11-03", 72, "standar", 92),
      lat("A", "kraepelin", "2026-11-04", 74),
      lat("A", "kraepelin", "2026-11-10", 80, "standar", 91), // rekor baru, rata-rata 75,3 → Perak
      lat("A", "kraepelin", "2026-11-11", 90, "singkat"), // bukan Standar, bukan rekor
      lat("A", "kraepelin", "2026-11-12", 70, "asli"),
    ];
    const l = lencanaSiswa({ siswaId: "A", latihanSiswa: data, mingguSelesai: [], sekarang: klasemenMinggu(data, ["A"], SENIN, MINGGU), hariIni: "2026-11-19" });
    assert.deepEqual([ambil(l, "rekor_pribadi").dapat, ambil(l, "rekor_pribadi").catatan], [true, "Kraepelin 80 · 10 Nov"]);
    assert.deepEqual([ambil(l, "naik_tingkat").dapat, ambil(l, "naik_tingkat").catatan], [true, "Kraepelin naik ke Perak · 10 Nov"]);
    assert.deepEqual([ambil(l, "stabil").dapat, ambil(l, "stabil").catatan], [true, "10 Nov"]);
    assert.deepEqual([ambil(l, "tahan_uji").dapat, ambil(l, "tahan_uji").catatan, ambil(l, "tahan_uji").progres], [false, "Terbaik 70", { nilai: 70, target: 75 }]);
  });

  it("lengkap 4 jenis (durasi apa saja), 7 hari beruntun, dan emas semua", () => {
    const hari = ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16"];
    const emas = (["kraepelin", "pauli", "angka", "simbol"] as const).flatMap((j, i) => tiga("A", j, 90, 90, 90, [hari[i]!, hari[i + 1]!, hari[i + 2]!]));
    const singkat = lat("A", "simbol", "2026-11-09", 50, "singkat");
    const data = [...emas, singkat];
    const l = lencanaSiswa({ siswaId: "A", latihanSiswa: data, mingguSelesai: [], sekarang: klasemenMinggu(data, ["A"], SENIN, MINGGU), hariIni: "2026-11-19" });
    assert.deepEqual([ambil(l, "lengkap_4").dapat, ambil(l, "lengkap_4").catatan], [true, "9 sampai 15 Nov"]);
    assert.deepEqual([ambil(l, "beruntun_7").dapat, ambil(l, "beruntun_7").catatan], [true, "Rekor 7 hari"]);
    assert.deepEqual([ambil(l, "emas_semua").dapat, ambil(l, "emas_semua").catatan], [true, "15 Nov"]);
    // Naik tingkat tidak didapat: tiap jenis langsung Emas sejak tingkat pertamanya.
    assert.equal(ambil(l, "naik_tingkat").dapat, false);

    const sedikit = [lat("A", "kraepelin", "2026-11-18", 60)];
    const k = lencanaSiswa({ siswaId: "A", latihanSiswa: sedikit, mingguSelesai: [], sekarang: klasemenMinggu(sedikit, ["A"], SENIN, MINGGU), hariIni: "2026-11-19" });
    assert.deepEqual(ambil(k, "lengkap_4").progres, { nilai: 1, target: 4 });
    assert.deepEqual(ambil(k, "beruntun_7").progres, { nilai: 1, target: 7 });
    assert.deepEqual(ambil(k, "emas_semua").progres, { nilai: 0, target: 4 });
    assert.equal(ambil(k, "tahan_uji").catatan, "Belum dicoba");
    assert.equal(ambil(k, "juara_umum").catatan, "Belum dapat poin minggu ini");
  });
});
