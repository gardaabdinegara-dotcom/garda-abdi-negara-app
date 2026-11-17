// Ringkasan progres dan rekap latihan psikotes. Murni hitungan (tanpa akses data), jadi bisa diuji langsung;
// server membaca tab Latihan_Psikotes lalu memanggil fungsi di sini.
import { JENIS_LATIHAN, type JenisLatihan } from "./latihan";
import type { Latihan } from "./latihan-simpan";
import type { Student } from "./types";

/** Selisih hari antara dua tanggal YYYY-MM-DD (b − a). */
export function daysBetween(a: string, b: string): number {
  const ms = (d: string) => {
    const [y, m, day] = d.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

/** Latihan dalam 7 hari terakhir (termasuk hari ini). */
export const dalamMingguIni = (l: Pick<Latihan, "tanggal">, hariIni: string) => Boolean(l.tanggal) && daysBetween(l.tanggal, hariIni) < 7;

export interface RingkasJenis {
  jenis: JenisLatihan;
  jumlah: number;
  /** Latihan pertama dan terakhir (untuk bar progres per aspek: pertama vs terakhir). */
  pertama: Latihan | null;
  terakhir: Latihan | null;
  sebelumnya: Latihan | null;
  terbaik: number | null;
  /** Skor terakhir dikurangi skor latihan sebelumnya pada jenis yang sama. */
  tren: number | null;
  /** Semua latihan jenis ini, lama ke baru (untuk grafik skor). */
  urut: Latihan[];
}

export interface ProgresLatihan {
  student: Student;
  /** Semua latihan siswa, terbaru dulu. */
  riwayat: Latihan[];
  perJenis: Record<JenisLatihan, RingkasJenis>;
  /** Jumlah latihan 7 hari terakhir (termasuk hari ini). */
  mingguIni: number;
  hariIni: string;
}

/** Urutan terbaru dulu (waktu mulai, lalu ID agar stabil). */
export const urutTerbaru = (a: Latihan, b: Latihan) => b.mulai.localeCompare(a.mulai) || b.latihan_id.localeCompare(a.latihan_id);

/** Mengelompokkan latihan per siswa, masing-masing terbaru dulu. */
export function kelompokkanPerSiswa(list: readonly Latihan[]): Map<string, Latihan[]> {
  const bySiswa = new Map<string, Latihan[]>();
  for (const l of list) {
    if (!bySiswa.has(l.siswa_id)) bySiswa.set(l.siswa_id, []);
    bySiswa.get(l.siswa_id)!.push(l);
  }
  for (const items of bySiswa.values()) items.sort(urutTerbaru);
  return bySiswa;
}

/** Ringkasan satu jenis dari riwayat siswa (riwayat terbaru dulu). */
export function ringkasJenis(jenis: JenisLatihan, riwayat: readonly Latihan[]): RingkasJenis {
  const urut = riwayat.filter((l) => l.jenis === jenis).slice().reverse();
  const terakhir = urut.at(-1) ?? null;
  const sebelumnya = urut.at(-2) ?? null;
  return {
    jenis,
    jumlah: urut.length,
    pertama: urut[0] ?? null,
    terakhir,
    sebelumnya,
    terbaik: urut.length ? Math.max(...urut.map((l) => l.skor)) : null,
    tren: terakhir && sebelumnya ? terakhir.skor - sebelumnya.skor : null,
    urut,
  };
}

export function progresOf(student: Student, riwayat: Latihan[], hariIni: string): ProgresLatihan {
  const perJenis = Object.fromEntries(JENIS_LATIHAN.map((j) => [j, ringkasJenis(j, riwayat)])) as Record<JenisLatihan, RingkasJenis>;
  const mingguIni = riwayat.filter((l) => dalamMingguIni(l, hariIni)).length;
  return { student, riwayat, perJenis, mingguIni, hariIni };
}

export type TandaRekap = "belum" | "lama" | "turun" | null;

export interface RekapBaris {
  student: Student;
  total: number;
  mingguIni: number;
  terakhir: Latihan | null;
  /** Selisih skor latihan terakhir dengan latihan sebelumnya pada jenis yang sama. */
  tren: number | null;
  /** Hari sejak latihan terakhir. */
  hariSejak: number | null;
  /** "belum" = belum pernah latihan, "lama" = 7 hari atau lebih tidak latihan, "turun" = skor turun 5 poin atau lebih. */
  tanda: TandaRekap;
}

export interface RekapLatihan {
  baris: RekapBaris[];
  /** Siswa aktif yang latihan dalam 7 hari terakhir. */
  aktifMingguIni: number;
  latihanMingguIni: number;
  perluPerhatian: number;
  siswaAktif: number;
  hariIni: string;
}

export const BATAS_LAMA_HARI = 7;
export const BATAS_TURUN = -5;

/** Tanda perhatian satu siswa. Skor turun didahulukan, lalu lama tidak latihan. */
export function tandaRekap(terakhir: Latihan | null, tren: number | null, hariSejak: number | null): TandaRekap {
  if (!terakhir) return "belum";
  if (tren !== null && tren <= BATAS_TURUN) return "turun";
  if (hariSejak !== null && hariSejak >= BATAS_LAMA_HARI) return "lama";
  return null;
}

export function barisRekap(student: Student, riwayat: readonly Latihan[], hariIni: string): RekapBaris {
  const terakhir = riwayat[0] ?? null;
  const sebelumnya = terakhir ? riwayat.find((l, i) => i > 0 && l.jenis === terakhir.jenis) ?? null : null;
  const tren = terakhir && sebelumnya ? terakhir.skor - sebelumnya.skor : null;
  const hariSejak = terakhir?.tanggal ? daysBetween(terakhir.tanggal, hariIni) : null;
  return {
    student,
    total: riwayat.length,
    mingguIni: riwayat.filter((l) => dalamMingguIni(l, hariIni)).length,
    terakhir,
    tren,
    hariSejak,
    tanda: tandaRekap(terakhir, tren, hariSejak),
  };
}

const URUT_TANDA: Record<string, number> = { turun: 0, lama: 1, belum: 2, "": 3 };

/** Rekap semua siswa aktif. Siswa yang perlu didorong ditaruh paling atas, lalu urut nama. */
export function rekapDari(students: readonly Student[], bySiswa: ReadonlyMap<string, readonly Latihan[]>, hariIni: string): RekapLatihan {
  const baris = students
    .filter((s) => s.aktif && !s.dihapus_pada)
    .map((student) => barisRekap(student, bySiswa.get(student.siswa_id) ?? [], hariIni))
    .sort((a, b) => URUT_TANDA[a.tanda ?? ""]! - URUT_TANDA[b.tanda ?? ""]! || a.student.nama.localeCompare(b.student.nama, "id"));
  return {
    baris,
    aktifMingguIni: baris.filter((b) => b.mingguIni > 0).length,
    latihanMingguIni: baris.reduce((a, b) => a + b.mingguIni, 0),
    perluPerhatian: baris.filter((b) => b.tanda).length,
    siswaAktif: baris.length,
    hariIni,
  };
}
