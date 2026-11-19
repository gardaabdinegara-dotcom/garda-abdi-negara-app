import {
  countCompletedAttendance,
  DISCIPLINE,
  emptyAttendanceCounts,
  summarizeAttendance,
  type Attendance,
  type AttendanceCounts,
  type AttendanceSummary,
  type Session,
} from "./akademik";
import { ringkasPerubahanSiswa, type PerbandinganSiswa, type RentangTanggal } from "./perubahan-siswa";
import type { Student } from "./types";

export const PERIODE_PRESENSI = {
  hari: "Hari ini",
  minggu: "Minggu ini",
  bulan: "Bulan ini",
  kustom: "Rentang tanggal",
} as const;

export type PeriodePresensi = keyof typeof PERIODE_PRESENSI;

export interface FilterPresensi extends RentangTanggal {
  periode: PeriodePresensi;
  error?: string;
}

const HARI_MS = 86_400_000;
const BATAS_TITIK = 14;
const stempel = (tanggal: string) => Date.parse(`${tanggal}T00:00:00Z`);
const tanggalIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function isTanggal(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const ms = stempel(value);
  return Number.isFinite(ms) && tanggalIso(ms) === value;
}

/** Preset mengikuti tanggal lokal lembaga. Rentang kustom mencakup kedua tanggal. */
export function filterPresensi(today: string, query: { periode?: unknown; dari?: unknown; sampai?: unknown }): FilterPresensi {
  const periode = typeof query.periode === "string" && Object.hasOwn(PERIODE_PRESENSI, query.periode)
    ? query.periode as PeriodePresensi : "bulan";
  const awalBulan = `${today.slice(0, 7)}-01`;
  if (periode === "kustom" && (query.dari !== undefined || query.sampai !== undefined)) {
    const dari = isTanggal(query.dari) ? query.dari : "";
    const sampai = isTanggal(query.sampai) ? query.sampai : "";
    const error = !dari || !sampai ? "Isi tanggal awal dan akhir yang valid."
      : dari > sampai ? "Tanggal akhir harus sama dengan atau setelah tanggal awal." : undefined;
    return { periode, dari, sampai, error };
  }
  if (periode === "hari") return { periode, dari: today, sampai: today };
  if (periode === "minggu") {
    const hariIni = stempel(today);
    const sejakSenin = (new Date(hariIni).getUTCDay() + 6) % 7;
    return { periode, dari: tanggalIso(hariIni - sejakSenin * HARI_MS), sampai: today };
  }
  return { periode, dari: awalBulan, sampai: today };
}

export interface RekapPresensiSiswa {
  student: Student;
  summary: AttendanceSummary;
}

interface IntervalPresensi extends RentangTanggal {
  counts: AttendanceSummary;
}

export interface RingkasanPresensi {
  counts: AttendanceSummary;
  sesiSelesai: number;
  sesiTerbuka: number;
  pengajuanMenunggu: number;
  perluPerhatian: number;
  rows: RekapPresensiSiswa[];
  intervalHari: number;
  interval: IntervalPresensi[];
}

/** Bandingkan hari yang sepadan pada preset kalender, atau rentang berurutan untuk filter kustom. */
export function rentangPembandingPresensi(filter: FilterPresensi): RentangTanggal | null {
  if (filter.error) return null;
  const awal = stempel(filter.dari);
  const akhir = stempel(filter.sampai);
  const tanggalMinimum = stempel("0001-01-01");
  if (filter.periode === "bulan") {
    const akhirBulanLalu = awal - HARI_MS;
    if (akhirBulanLalu < tanggalMinimum) return null;
    const hariTerakhir = new Date(akhirBulanLalu).getUTCDate();
    const hariSejajar = Math.min(hariTerakhir, new Date(akhir).getUTCDate());
    return {
      dari: tanggalIso(akhirBulanLalu - (hariTerakhir - 1) * HARI_MS),
      sampai: tanggalIso(akhirBulanLalu - (hariTerakhir - hariSejajar) * HARI_MS),
    };
  }
  const jarak = filter.periode === "minggu" ? 7 * HARI_MS : akhir - awal + HARI_MS;
  return awal - jarak >= tanggalMinimum ? { dari: tanggalIso(awal - jarak), sampai: tanggalIso(akhir - jarak) } : null;
}

/** Menghitung kehadiran dari sesi yang boleh dilihat staf. Peserta sesi selesai mengikuti daftar beku. */
export function hitungRingkasanPresensi(
  range: RentangTanggal,
  visible: readonly Session[],
  attendance: ReadonlyMap<string, Attendance>,
  students: readonly Student[],
): RingkasanPresensi {
  const awal = stempel(range.dari);
  const akhir = stempel(range.sampai);
  const hari = (akhir - awal) / HARI_MS + 1;
  // Per hari untuk rentang pendek; gunakan kelipatan minggu agar grafik panjang tetap terbaca di HP.
  const intervalHari = hari <= BATAS_TITIK ? 1 : 7 * Math.ceil(hari / (7 * BATAS_TITIK));
  const interval = Array.from({ length: Math.ceil(hari / intervalHari) }, (_, index) => ({
    dari: tanggalIso(awal + index * intervalHari * HARI_MS),
    sampai: tanggalIso(Math.min(akhir, awal + ((index + 1) * intervalHari - 1) * HARI_MS)),
    counts: emptyAttendanceCounts(),
  }));
  const counts = emptyAttendanceCounts();
  const byStudent = new Map(students.filter((s) => !s.dihapus_pada).map((student) => [student.siswa_id, student]));
  const studentCounts = new Map<string, AttendanceCounts>();
  let sesiSelesai = 0;
  let sesiTerbuka = 0;
  let pengajuanMenunggu = 0;

  for (const session of visible) {
    if (session.tanggal < range.dari || session.tanggal > range.sampai || !isTanggal(session.tanggal)) continue;
    if (session.status !== "SELESAI" && session.status !== "AKTIF") continue;
    const peserta = new Set(session.peserta_ids.filter((id) => byStudent.has(id)));
    if (session.status === "AKTIF") {
      sesiTerbuka++;
      for (const id of peserta) {
        if (attendance.get(`${session.sesi_id}:${id}`)?.status === "MENUNGGU") pengajuanMenunggu++;
      }
      continue;
    }

    sesiSelesai++;
    const posisi = Math.floor((stempel(session.tanggal) - awal) / (intervalHari * HARI_MS));
    const hitungInterval = interval[posisi]!.counts;
    for (const id of peserta) {
      const record = attendance.get(`${session.sesi_id}:${id}`);
      const milikSiswa = studentCounts.get(id) ?? emptyAttendanceCounts();
      countCompletedAttendance(milikSiswa, record);
      countCompletedAttendance(hitungInterval, record);
      countCompletedAttendance(counts, record);
      studentCounts.set(id, milikSiswa);
    }
  }

  const rows = [...studentCounts].map(([id, counts]) => ({ student: byStudent.get(id)!, summary: summarizeAttendance(counts) }));
  rows.sort((a, b) => (a.summary.persen ?? 101) - (b.summary.persen ?? 101) || a.student.nama.localeCompare(b.student.nama, "id"));
  return {
    counts: summarizeAttendance(counts),
    sesiSelesai,
    sesiTerbuka,
    pengajuanMenunggu,
    perluPerhatian: rows.filter(({ summary }) => (summary.persen ?? 101) < DISCIPLINE.cukup).length,
    rows,
    intervalHari,
    interval: interval.map((i) => ({ ...i, counts: summarizeAttendance(i.counts) })),
  };
}

export type DashboardPresensi = RingkasanPresensi & { perbandingan: PerbandinganSiswa | null };

export function susunDashboardPresensi(
  filter: FilterPresensi,
  visible: readonly Session[],
  attendance: ReadonlyMap<string, Attendance>,
  students: readonly Student[],
): DashboardPresensi | null {
  if (filter.error) return null;
  const sekarang = hitungRingkasanPresensi(filter, visible, attendance, students);
  const pembanding = rentangPembandingPresensi(filter);
  if (!pembanding) return { ...sekarang, perbandingan: null };

  const sebelumnya = hitungRingkasanPresensi(pembanding, visible, attendance, students);
  const persenSebelumnya = new Map(sebelumnya.rows.map(({ student, summary }) => [student.siswa_id, summary.persen]));
  const selisih: number[] = [];
  for (const { student, summary } of sekarang.rows) {
    const lalu = persenSebelumnya.get(student.siswa_id);
    if (lalu != null && summary.persen !== null) selisih.push(summary.persen - lalu);
  }
  return { ...sekarang, perbandingan: ringkasPerubahanSiswa(pembanding, selisih) };
}
