// Progres siswa dan rekap latihan owner: ringkasan per jenis, tanda perhatian, dan urutan rekap.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hitungHasil, type Bagian, type JenisLatihan } from "../src/lib/core/latihan";
import { barisRekap, daysBetween, kelompokkanPerSiswa, progresOf, rekapDari, ringkasJenis, tandaRekap } from "../src/lib/core/latihan-rekap";
import type { Latihan } from "../src/lib/core/latihan-simpan";
import type { Student } from "../src/lib/core/types";

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
function latihan(siswaId: string, jenis: JenisLatihan, tanggal: string, skor: number, jam = "08:00"): Latihan {
  const seri: Bagian[] = [{ benar: 10, jawab: 10 }];
  return {
    ...hitungHasil(jenis, seri, 60),
    skor,
    latihan_id: `LAT_${String(++n).padStart(4, "0")}`,
    siswa_id: siswaId,
    jenis,
    durasi: "singkat",
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

  it("tren dibanding latihan sebelumnya dengan jenis yang sama", () => {
    const riwayat = kelompokkanPerSiswa([
      latihan("S1", "kraepelin", "2026-11-10", 75),
      latihan("S1", "pauli", "2026-11-14", 50),
      latihan("S1", "kraepelin", "2026-11-16", 69),
    ]).get("S1")!;
    const b = barisRekap(siswa("S1", "ARIF"), riwayat, HARI_INI);
    assert.equal(b.terakhir?.jenis, "kraepelin");
    assert.equal(b.tren, -6);
    assert.equal(b.tanda, "turun");
    assert.equal(b.hariSejak, 1);
    assert.equal(b.total, 3);
    assert.equal(b.mingguIni, 2, "10 Nov sudah 7 hari lalu");
  });

  it("siswa perlu perhatian di atas, siswa nonaktif tidak ikut", () => {
    const students = [siswa("S1", "ARIF"), siswa("S2", "BAGUS"), siswa("S3", "DIMAS"), siswa("S4", "FAJAR"), siswa("S5", "GALIH", false)];
    const bySiswa = kelompokkanPerSiswa([
      latihan("S1", "angka", "2026-11-15", 70),
      latihan("S1", "angka", "2026-11-16", 74),
      latihan("S3", "simbol", "2026-11-01", 66),
      latihan("S4", "pauli", "2026-11-12", 70),
      latihan("S4", "pauli", "2026-11-16", 61),
      latihan("S5", "pauli", "2026-11-16", 61),
    ]);
    const rekap = rekapDari(students, bySiswa, HARI_INI);
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
    assert.equal(rekap.aktifMingguIni, 2);
    assert.equal(rekap.latihanMingguIni, 4);
    assert.equal(rekap.perluPerhatian, 3);
  });
});
