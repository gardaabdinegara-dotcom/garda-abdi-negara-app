// Ringkasan progres dan rekap latihan psikotes. Murni hitungan (tanpa akses data), jadi bisa diuji langsung;
// server membaca tab Latihan_Psikotes lalu memanggil fungsi di sini.
import { JENIS_INFO, JENIS_LATIHAN, type DurasiLatihan, type JenisLatihan } from "./latihan";
import type { Latihan } from "./latihan-simpan";
import { namaTarget, type ProgresTarget } from "./latihan-target";
import { median, ringkasPerubahanSiswa, type PerbandinganSiswa } from "./perubahan-siswa";
import type { Student } from "./types";

const HARI_MS = 86_400_000;

/** Selisih hari antara dua tanggal YYYY-MM-DD (b − a). */
export function daysBetween(a: string, b: string): number {
  const ms = (d: string) => {
    const [y, m, day] = d.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((ms(b) - ms(a)) / HARI_MS);
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

export const PERIODE_REKAP = [7, 30, 90] as const;
export type PeriodeRekap = (typeof PERIODE_REKAP)[number];

export interface FilterRekapLatihan {
  periode: PeriodeRekap;
  jenis: JenisLatihan | null;
  durasi: DurasiLatihan | null;
}

export const FILTER_REKAP_AWAL: FilterRekapLatihan = { periode: 30, jenis: null, durasi: null };

export interface RekapBaris {
  student: Student;
  sesi: number;
  /** Skor terbaru dalam periode, sesuai jenis dan durasi yang dipilih. */
  terakhir: Latihan | null;
  /** Dibandingkan dengan sesi sebelumnya pada jenis dan durasi yang sama. */
  tren: number | null;
  /** Hari sejak aktivitas terakhir dari seluruh latihan. */
  hariSejak: number | null;
  tanda: TandaRekap;
}

export interface IntervalRekap {
  dari: string;
  sampai: string;
  sesi: number;
  siswa: number;
  medianSkor: number | null;
}

export interface FokusRekap {
  student: Student;
  jenis: JenisLatihan | null;
  durasi: DurasiLatihan | null;
  /** Sesi yang sebanding dalam periode, dari lama ke baru. */
  sesi: Latihan[];
  sebelumnya: Latihan | null;
}

export interface RekapLatihan {
  baris: RekapBaris[];
  siswaBerlatih: number;
  sesiSelesai: number;
  perhatian: Record<NonNullable<TandaRekap>, number>;
  siswaAktif: number;
  mulaiPeriode: string;
  hariIni: string;
  interval: IntervalRekap[];
  perbandingan: PerbandinganSiswa | null;
  contohSkor: Pick<Latihan, "jenis" | "durasi"> | null;
  fokus: FokusRekap | null;
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

/**
 * Alasan singkat untuk pesan WA "Perlu didorong", mis. "sudah 9 hari belum latihan" atau
 * "skor Kraepelin turun 12 poin". Null bila siswa tidak perlu didorong.
 */
export function catatanDorong(baris: Pick<RekapBaris, "tanda" | "terakhir" | "tren" | "hariSejak">, target?: ProgresTarget | null): string | null {
  if (baris.tanda === "turun" && baris.terakhir && baris.tren !== null) {
    return `skor ${JENIS_INFO[baris.terakhir.jenis].nama} turun ${Math.abs(baris.tren)} poin`;
  }
  if (baris.tanda === "lama" && baris.hariSejak !== null) return `sudah ${baris.hariSejak} hari belum latihan`;
  if (baris.tanda === "belum") return "belum pernah mencoba latihan psikotes";
  if (target && !target.terpenuhi) {
    return `latihan ${namaTarget(target.target)} minggu ini baru ${target.selesai} dari ${target.target.kali} hari`;
  }
  return null;
}

function geserHari(tanggal: string, hari: number): string {
  return new Date(Date.parse(`${tanggal}T00:00:00Z`) + hari * HARI_MS).toISOString().slice(0, 10);
}

function tanggalValid(tanggal: string): boolean {
  const ms = Date.parse(`${tanggal}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === tanggal;
}

function latihanSebelumnya(riwayat: readonly Latihan[], terakhir: Latihan): Latihan | null {
  const pos = riwayat.indexOf(terakhir);
  return riwayat.find((l, i) => i > pos && l.jenis === terakhir.jenis && l.durasi === terakhir.durasi) ?? null;
}

const URUT_TANDA = { turun: 0, lama: 1, belum: 2, "": 3 };
const LEBAR_INTERVAL: Record<PeriodeRekap, number> = { 7: 1, 30: 5, 90: 10 };

/** Rekap siswa aktif dari riwayat yang sudah diurutkan terbaru dulu. */
export function rekapDari(
  students: readonly Student[],
  bySiswa: ReadonlyMap<string, readonly Latihan[]>,
  hariIni: string,
  filter = FILTER_REKAP_AWAL,
  siswaId?: string,
): RekapLatihan {
  const mulaiPeriode = geserHari(hariIni, 1 - filter.periode);
  const pembanding = filter.jenis && filter.durasi
    ? { dari: geserHari(mulaiPeriode, -filter.periode), sampai: geserHari(mulaiPeriode, -1) }
    : null;
  const selisihSkor: number[] = [];
  const lebar = LEBAR_INTERVAL[filter.periode];
  const kelompok = Array.from({ length: filter.periode / lebar }, (_, i) => ({
    dari: geserHari(mulaiPeriode, i * lebar),
    sampai: geserHari(mulaiPeriode, (i + 1) * lebar - 1),
    sesi: 0,
    skorTerbaru: new Map<string, number>(),
  }));
  const cocok = (l: Latihan) => (!filter.jenis || l.jenis === filter.jenis) && (!filter.durasi || l.durasi === filter.durasi);
  const baris: RekapBaris[] = [];
  const perhatian = { turun: 0, lama: 0, belum: 0 };
  let siswaBerlatih = 0;
  let sesiSelesai = 0;
  let contohSkor: Latihan | null = null;
  let fokus: FokusRekap | null = null;

  for (const student of students) {
    if (!student.aktif || student.dihapus_pada) continue;
    const id = student.siswa_id;
    const riwayat = (bySiswa.get(id) ?? []).filter((l) => l.tanggal <= hariIni && tanggalValid(l.tanggal));
    const sesi = riwayat.filter((l) => l.tanggal >= mulaiPeriode && cocok(l));
    const terakhir = sesi[0] ?? null;
    const sebelumnya = terakhir ? latihanSebelumnya(riwayat, terakhir) : null;
    const tren = terakhir && sebelumnya ? terakhir.skor - sebelumnya.skor : null;
    const aktivitasTerakhir = riwayat.reduce((tgl, l) => l.tanggal > tgl ? l.tanggal : tgl, "");
    const hariSejak = aktivitasTerakhir ? daysBetween(aktivitasTerakhir, hariIni) : null;
    const tanda = tandaRekap(riwayat[0] ?? null, tren, hariSejak);

    if (tanda) perhatian[tanda]++;
    if (terakhir) {
      siswaBerlatih++;
      if (!contohSkor || urutTerbaru(terakhir, contohSkor) < 0) contohSkor = terakhir;
      if (pembanding) {
        const skorSebelumnya = riwayat.find((l) => l.tanggal >= pembanding.dari && l.tanggal <= pembanding.sampai && cocok(l));
        if (skorSebelumnya) selisihSkor.push(terakhir.skor - skorSebelumnya.skor);
      }
    }
    sesiSelesai += sesi.length;
    baris.push({ student, sesi: sesi.length, terakhir, tren, hariSejak, tanda });

    for (const l of sesi) {
      const interval = kelompok[Math.floor(daysBetween(mulaiPeriode, l.tanggal) / lebar)]!;
      interval.sesi++;
      if (!interval.skorTerbaru.has(id)) interval.skorTerbaru.set(id, l.skor);
    }

    if (siswaId === id) {
      const acuan = terakhir ?? riwayat.find(cocok);
      const jenis = acuan?.jenis ?? filter.jenis;
      const durasi = acuan?.durasi ?? filter.durasi;
      fokus = { student, jenis, durasi, sesi: sesi.filter((l) => l.jenis === jenis && l.durasi === durasi).reverse(), sebelumnya };
    }
  }

  baris.sort((a, b) => URUT_TANDA[a.tanda ?? ""] - URUT_TANDA[b.tanda ?? ""] || a.student.nama.localeCompare(b.student.nama, "id"));
  return {
    baris,
    siswaBerlatih,
    sesiSelesai,
    perhatian,
    siswaAktif: baris.length,
    mulaiPeriode,
    hariIni,
    interval: kelompok.map(({ dari, sampai, sesi, skorTerbaru }) => ({
      dari, sampai, sesi,
      siswa: skorTerbaru.size,
      medianSkor: pembanding ? median(skorTerbaru.values()) : null,
    })),
    perbandingan: pembanding ? ringkasPerubahanSiswa(pembanding, selisihSkor) : null,
    contohSkor: contohSkor ? { jenis: contohSkor.jenis, durasi: contohSkor.durasi } : null,
    fokus,
  };
}
