// Progres siswa dan rekap latihan owner: ringkasan per jenis, tanda perhatian, dan urutan rekap.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hitungHasil, type Bagian, type DurasiLatihan, type JenisLatihan } from "../src/lib/core/latihan";
import { daysBetween, kelompokkanPerSiswa, progresOf, rekapDari, ringkasJenis, tandaRekap } from "../src/lib/core/latihan-rekap";
import type { Latihan } from "../src/lib/core/latihan-simpan";
import type { Student } from "../src/lib/core/types";
import { bacaPilihanRekap, rekapHref } from "../src/lib/latihan-rekap-route";

const HARI_INI = "2026-11-17";

function siswa(id: string, nama: string, aktif = true): Student {
  return {
    siswa_id: id,
    kode_siswa: `GAN-${id}`,
    nama,
    jenis_kelamin: "L",
    tanggal_lahir: "",
    jalur_target: "TNI",
    no_wa: "",
    nama_wali: "",
    no_wa_wali: "",
    tanggal_daftar: "2026-09-01",
    aktif,
    catatan: "",
    tempat_lahir: "",
    asal_sekolah: "",
    dihapus_pada: "",
  };
}

let n = 0;
/** Latihan dengan skor tertentu (skor ditimpa agar tes tidak bergantung pada rumus). */
function latihan(siswaId: string, jenis: JenisLatihan, tanggal: string, skor: number, durasi: DurasiLatihan = "singkat", jam = "08:00"): Latihan {
  const seri: Bagian[] = [{ benar: 10, jawab: 10 }];
  return {
    ...hitungHasil(jenis, seri, 60),
    skor,
    latihan_id: `LAT_${String(++n).padStart(4, "0")}`,
    siswa_id: siswaId,
    jenis,
    durasi,
    tanggal,
    mulai: `${tanggal}T${jam}:00.000Z`,
    detik: 60,
    seri,
  };
}

describe("ringkasan progres latihan", () => {
  it("selisih hari antartanggal", () => {
    assert.equal(daysBetween("2026-11-10", HARI_INI), 7);
    assert.equal(daysBetween("2026-10-31", "2026-11-01"), 1);
    assert.equal(daysBetween(HARI_INI, HARI_INI), 0);
  });

  it("per jenis: urut lama ke baru, pertama, terakhir, terbaik, dan tren", () => {
    const riwayat = [
      latihan("S1", "kraepelin", "2026-11-03", 60),
      latihan("S1", "pauli", "2026-11-05", 55),
      latihan("S1", "kraepelin", "2026-11-08", 72),
      latihan("S1", "kraepelin", "2026-11-12", 68),
    ];
    const terbaru = kelompokkanPerSiswa(riwayat).get("S1")!;
    assert.deepEqual(terbaru.map((l) => l.skor), [68, 72, 55, 60], "terbaru dulu");
    const r = ringkasJenis("kraepelin", terbaru);
    assert.equal(r.jumlah, 3);
    assert.deepEqual(r.urut.map((l) => l.skor), [60, 72, 68]);
    assert.equal(r.pertama?.skor, 60);
    assert.equal(r.terakhir?.skor, 68);
    assert.equal(r.terbaik, 72);
    assert.equal(r.tren, -4);
    const kosong = ringkasJenis("simbol", terbaru);
    assert.equal(kosong.jumlah, 0);
    assert.equal(kosong.terbaik, null);
    assert.equal(kosong.tren, null);
  });

  it("minggu ini = 7 hari terakhir termasuk hari ini", () => {
    const riwayat = kelompokkanPerSiswa([
      latihan("S1", "angka", "2026-11-17", 70),
      latihan("S1", "angka", "2026-11-11", 70),
      latihan("S1", "angka", "2026-11-10", 70),
    ]).get("S1")!;
    const p = progresOf(siswa("S1", "ARIF"), riwayat, HARI_INI);
    assert.equal(p.mingguIni, 2);
    assert.equal(p.perJenis.angka.jumlah, 3);
    assert.equal(p.perJenis.kraepelin.jumlah, 0);
  });
});

describe("rekap latihan owner", () => {
  it("tanda: belum, turun (didahulukan), lama, atau tidak ada", () => {
    assert.equal(tandaRekap(null, null, null), "belum");
    const l = latihan("S1", "pauli", "2026-11-01", 60);
    assert.equal(tandaRekap(l, -5, 3), "turun");
    assert.equal(tandaRekap(l, -6, 12), "turun", "skor turun lebih penting daripada lama tidak latihan");
    assert.equal(tandaRekap(l, -4, 7), "lama");
    assert.equal(tandaRekap(l, -4, 6), null);
    assert.equal(tandaRekap(l, null, 2), null);
  });

  it("tren memakai jenis dan durasi yang sama, termasuk sesi pembanding sebelum periode", () => {
    const riwayat = kelompokkanPerSiswa([
      latihan("S1", "kraepelin", "2026-11-10", 75),
      latihan("S1", "pauli", "2026-11-14", 50),
      latihan("S1", "kraepelin", "2026-11-15", 22, "asli"),
      latihan("S1", "kraepelin", "2026-11-16", 69),
      latihan("S1", "pauli", "2026-11-17", 58),
    ]);
    const rekap = rekapDari([siswa("S1", "ARIF")], riwayat, HARI_INI, { periode: 7, jenis: "kraepelin", durasi: "singkat" }, "S1");
    const b = rekap.baris[0]!;
    assert.equal(b.terakhir?.jenis, "kraepelin");
    assert.equal(b.tren, -6);
    assert.equal(b.tanda, "turun");
    assert.equal(b.hariSejak, 0, "tetap menghitung aktivitas terbaru dari jenis lain");
    assert.equal(b.sesi, 1, "10 Nov di luar periode dan durasi asli tidak ikut");
    assert.deepEqual(rekap.fokus?.sesi.map((l) => l.skor), [69]);
    assert.equal(rekap.fokus?.sebelumnya?.skor, 75);

    const tidakCocok = rekapDari([siswa("S1", "ARIF")], riwayat, HARI_INI, { periode: 7, jenis: "simbol", durasi: null });
    assert.equal(tidakCocok.baris[0]?.terakhir, null);
    assert.equal(tidakCocok.baris[0]?.tanda, null, "latihan di luar filter tetap tercatat sebagai aktivitas");
  });

  it("siswa perlu perhatian di atas, siswa nonaktif dan terhapus tidak ikut", () => {
    const students = [
      siswa("S1", "ARIF"), siswa("S2", "BAGUS"), siswa("S3", "DIMAS"), siswa("S4", "FAJAR"),
      siswa("S5", "GALIH", false), { ...siswa("S6", "HASAN"), dihapus_pada: HARI_INI },
    ];
    const bySiswa = kelompokkanPerSiswa([
      latihan("S1", "angka", "2026-11-15", 70),
      latihan("S1", "angka", "2026-11-16", 74),
      latihan("S3", "simbol", "2026-11-01", 66),
      latihan("S4", "pauli", "2026-11-12", 70),
      latihan("S4", "pauli", "2026-11-16", 61),
      latihan("S5", "pauli", "2026-11-16", 61),
      latihan("S6", "pauli", "2026-11-16", 61),
    ]);
    const rekap = rekapDari(students, bySiswa, HARI_INI, { periode: 7, jenis: null, durasi: null }, "S6");
    assert.deepEqual(
      rekap.baris.map((b) => [b.student.nama, b.tanda]),
      [
        ["FAJAR", "turun"],
        ["DIMAS", "lama"],
        ["BAGUS", "belum"],
        ["ARIF", null],
      ],
    );
    assert.equal(rekap.siswaAktif, 4);
    assert.equal(rekap.siswaBerlatih, 2);
    assert.equal(rekap.sesiSelesai, 4);
    assert.deepEqual(rekap.perhatian, { turun: 1, lama: 1, belum: 1 });
    assert.equal(rekap.fokus, null);
  });

  it("interval menampilkan jumlah sesi dan median dari skor terbaru tiap siswa", () => {
    const students = [siswa("S1", "ARIF"), siswa("S2", "BAGUS")];
    const bySiswa = kelompokkanPerSiswa([
      latihan("S1", "pauli", "2026-11-17", 10),
      latihan("S1", "pauli", "2026-11-17", 70, "singkat", "09:00"),
      latihan("S2", "pauli", "2026-11-17", 40),
      latihan("S1", "pauli", "2026-11-15", 0),
      latihan("S2", "pauli", "2026-11-11", 80),
      latihan("S1", "kraepelin", "2026-11-17", 55),
      latihan("S2", "pauli", "2026-11-17", 90, "standar"),
      latihan("S2", "pauli", "2026-11-18", 100),
    ]);
    const filter = { periode: 7, jenis: "pauli", durasi: "singkat" } as const;
    const rekap = rekapDari(students, bySiswa, HARI_INI, filter, "S1");
    assert.equal(rekap.mulaiPeriode, "2026-11-11");
    assert.equal(rekap.sesiSelesai, 5);
    assert.equal(rekap.siswaBerlatih, 2);
    assert.equal(rekap.interval[0]?.medianSkor, 80);
    assert.equal(rekap.interval.at(-3)?.medianSkor, 0);
    assert.equal(rekap.interval.at(-2)?.medianSkor, null);
    assert.deepEqual(rekap.interval.at(-1), { dari: HARI_INI, sampai: HARI_INI, sesi: 3, siswa: 2, medianSkor: 55 });
    assert.deepEqual(rekap.fokus?.sesi.map((l) => l.skor), [0, 10, 70]);
    assert.deepEqual(rekap.contohSkor, { jenis: "pauli", durasi: "singkat" });

    const campuran = rekapDari(students, bySiswa, HARI_INI, { ...filter, durasi: null });
    assert.equal(campuran.interval.at(-1)?.sesi, 4);
    assert.equal(campuran.interval.at(-1)?.medianSkor, null);
  });

  it("periode 30 dan 90 hari mencakup hari ini, dengan interval lima dan sepuluh hari", () => {
    const students = [siswa("S1", "ARIF"), siswa("S2", "BAGUS")];
    const bySiswa = kelompokkanPerSiswa([
      latihan("S1", "pauli", "2026-08-19", 30),
      latihan("S1", "pauli", "2026-08-20", 40),
      latihan("S1", "pauli", "2026-10-18", 60),
      latihan("S1", "pauli", "2026-10-19", 65),
      latihan("S1", "pauli", HARI_INI, 70),
      latihan("S2", "pauli", "2026-10-32", 80),
    ]);
    const awal = rekapDari(students, bySiswa, HARI_INI);
    assert.equal(awal.sesiSelesai, 2);
    assert.equal(awal.perhatian.belum, 1, "tanggal kalender yang rusak tidak dihitung");
    assert.equal(awal.interval.length, 6);
    assert.equal(awal.interval[0]?.dari, "2026-10-19");
    assert.equal(awal.interval[0]?.sampai, "2026-10-23");
    const panjang = rekapDari(students, bySiswa, HARI_INI, { periode: 90, jenis: null, durasi: null });
    assert.equal(panjang.sesiSelesai, 4);
    assert.equal(panjang.interval.length, 9);
    assert.equal(panjang.interval[0]?.dari, "2026-08-20");
    assert.equal(panjang.interval.at(-1)?.sampai, HARI_INI);
  });

  it("perubahan siswa yang sama membandingkan skor terbaru tiap periode pada jenis dan durasi yang sama", () => {
    const students = [siswa("1", "ARIF"), siswa("2", "BAGUS"), siswa("3", "CITRA"), siswa("4", "DANI"), siswa("5", "ELSA"), siswa("6", "FAJAR", false)];
    const rows = kelompokkanPerSiswa([
      latihan("1", "pauli", "2026-11-04", 80),
      latihan("1", "pauli", "2026-11-10", 0),
      latihan("1", "pauli", "2026-11-10", 98, "standar", "09:00"),
      latihan("1", "pauli", "2026-11-11", 32),
      latihan("1", "pauli", "2026-11-16", 40),
      latihan("2", "pauli", "2026-11-09", 80),
      latihan("2", "pauli", HARI_INI, 60),
      latihan("3", "pauli", "2026-11-10", 100),
      latihan("3", "pauli", HARI_INI, 95),
      latihan("4", "pauli", "2026-11-03", 10),
      latihan("4", "kraepelin", "2026-11-10", 20),
      latihan("4", "pauli", HARI_INI, 90),
      latihan("5", "pauli", "2026-11-10", 50),
      latihan("5", "pauli", HARI_INI, 70, "standar"),
      latihan("6", "pauli", "2026-11-10", 20),
      latihan("6", "pauli", HARI_INI, 100),
    ]);
    const filter = { periode: 7, jenis: "pauli", durasi: "singkat" } as const;
    const paired = rekapDari(students, rows, HARI_INI, filter).perbandingan;
    assert.deepEqual(paired, {
      sebelumnya: { dari: "2026-11-04", sampai: "2026-11-10" },
      median: -5,
      siswa: 3,
      naik: 1,
      tetap: 0,
      turun: 2,
    });
    const berbedaDurasi = rekapDari(students, rows, HARI_INI, { ...filter, durasi: "standar" }).perbandingan;
    assert.equal(berbedaDurasi?.siswa, 0);
    assert.equal(berbedaDurasi?.median, null);
    assert.equal(rekapDari(students, rows, HARI_INI, { ...filter, durasi: null }).perbandingan, null);
  });

  it("parameter URL hanya memakai pilihan yang valid dan mempertahankan filter saat membuka siswa", () => {
    const awal = bacaPilihanRekap({ periode: "14", jenis: ["pauli"], durasi: "salah", grafik: "x", tanda: "x", siswa: ["S1"] });
    assert.deepEqual(awal, { periode: 30, jenis: null, durasi: null, grafik: "aktivitas", tanda: null, siswa: null });
    const pilihan = bacaPilihanRekap({ periode: "90", jenis: "angka", durasi: "standar", grafik: "skor", tanda: "lama" });
    assert.equal(rekapHref(pilihan, { siswa: "S/1 & 2" }, "grafik-latihan"), "/latihan?periode=90&jenis=angka&durasi=standar&grafik=skor&tanda=lama&siswa=S%2F1+%26+2#grafik-latihan");
  });
});
