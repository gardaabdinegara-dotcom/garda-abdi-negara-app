import "server-only";
import { notFound } from "next/navigation";
import { academicSettings, localClock } from "../core/akademik";
import { kelompokkanPerSiswa, progresOf, rekapDari, dalamMingguIni, type FilterRekapLatihan, type ProgresLatihan, type RekapLatihan } from "../core/latihan-rekap";
import { toLatihan, type Latihan } from "../core/latihan-simpan";
import { linkedStudentIds, toStudent, type Actor, type Student } from "../core/types";
import { AppError, type Tables } from "../data/types";
import { dataDeps } from "./data";

// Logika ringkasan murni ada di core/latihan-rekap (bisa diuji); diekspor ulang di sini untuk halaman.
export { BATAS_LAMA_HARI, BATAS_TURUN, daysBetween, ringkasJenis } from "../core/latihan-rekap";
export type { ProgresLatihan, RekapBaris, RekapLatihan, RingkasJenis, TandaRekap } from "../core/latihan-rekap";

const TABLES = ["Pengaturan", "Siswa", "Latihan_Psikotes"] as const;
const read = async () => (await dataDeps()).store.read("inti", TABLES);

/** Owner/admin melihat latihan semua siswa; siswa hanya latihannya sendiri. */
export const canSeeAllLatihan = (actor: Actor) => actor.user.peran === "OWNER" || actor.user.peran === "ADMIN";

function today(t: Tables): string {
  return localClock(academicSettings(t).zona_waktu, new Date().toISOString()).date;
}

function model(t: Tables) {
  const students = (t.Siswa ?? []).map(toStudent).filter((s) => !s.dihapus_pada);
  const bySiswa = kelompokkanPerSiswa((t.Latihan_Psikotes ?? []).map(toLatihan));
  return { students, bySiswa, hariIni: today(t) };
}

/** Progres milik siswa yang masuk. Null untuk owner/admin (mereka boleh mencoba latihan tanpa menyimpan). */
export async function loadLatihanSaya(actor: Actor): Promise<ProgresLatihan | null> {
  if (actor.user.peran !== "SISWA") return null;
  const siswaId = linkedStudentIds(actor, "SISWA")[0];
  if (!siswaId) return null;
  const m = model(await read());
  const student = m.students.find((s) => s.siswa_id === siswaId);
  return student ? progresOf(student, m.bySiswa.get(siswaId) ?? [], m.hariIni) : null;
}

/** Progres satu siswa untuk owner/admin (atau siswa itu sendiri). */
export async function loadProgresSiswa(actor: Actor, siswaId: string): Promise<ProgresLatihan> {
  const own = actor.user.peran === "SISWA" && linkedStudentIds(actor, "SISWA").includes(siswaId);
  if (!canSeeAllLatihan(actor) && !own) notFound();
  const m = model(await read());
  const student = m.students.find((s) => s.siswa_id === siswaId);
  if (!student) notFound();
  return progresOf(student, m.bySiswa.get(siswaId) ?? [], m.hariIni);
}

export interface RingkasLatihanSiswa {
  total: number;
  mingguIni: number;
  terakhir: Latihan | null;
  /** Halaman progres yang boleh dibuka pengguna ini. */
  href: string;
}

/**
 * Ringkasan kecil untuk profil siswa: jumlah latihan dan tautan progres. Null bila pengguna tidak boleh melihat
 * latihan siswa ini, atau tab Latihan_Psikotes belum dibuat di spreadsheet (profil tetap tampil).
 */
export async function loadRingkasLatihanSiswa(actor: Actor, siswaId: string): Promise<RingkasLatihanSiswa | null> {
  const own = actor.user.peran === "SISWA" && linkedStudentIds(actor, "SISWA").includes(siswaId);
  if (!canSeeAllLatihan(actor) && !own) return null;
  let t: Tables;
  try {
    t = await read();
  } catch (error) {
    if (error instanceof AppError && error.code === "SCHEMA_INCOMPLETE") return null;
    throw error;
  }
  const hariIni = today(t);
  const riwayat = (t.Latihan_Psikotes ?? []).filter((r) => r.siswa_id === siswaId).map(toLatihan);
  const terakhir = riwayat.reduce<Latihan | null>((a, l) => (!a || l.mulai > a.mulai ? l : a), null);
  return {
    total: riwayat.length,
    mingguIni: riwayat.filter((l) => dalamMingguIni(l, hariIni)).length,
    terakhir,
    href: canSeeAllLatihan(actor) ? `/latihan/siswa/${encodeURIComponent(siswaId)}` : "/latihan/progres",
  };
}

export interface HasilLatihanView {
  latihan: Latihan;
  student: Student;
  /** Latihan jenis yang sama tepat sebelum ini (untuk perbandingan). */
  sebelumnya: Latihan | null;
  /** Latihan jenis yang sama sampai yang ini, lama ke baru. */
  riwayatJenis: Latihan[];
  milikSaya: boolean;
}

export async function loadHasilLatihan(actor: Actor, latihanId: string): Promise<HasilLatihanView> {
  const m = model(await read());
  let found: Latihan | undefined;
  for (const list of m.bySiswa.values()) {
    found = list.find((l) => l.latihan_id === latihanId);
    if (found) break;
  }
  if (!found) notFound();
  const milikSaya = actor.user.peran === "SISWA" && linkedStudentIds(actor, "SISWA").includes(found.siswa_id);
  if (!milikSaya && !canSeeAllLatihan(actor)) notFound();
  const student = m.students.find((s) => s.siswa_id === found.siswa_id);
  if (!student) notFound();
  const sama = (m.bySiswa.get(found.siswa_id) ?? []).filter((l) => l.jenis === found.jenis).slice().reverse();
  const pos = sama.findIndex((l) => l.latihan_id === latihanId);
  return { latihan: found, student, sebelumnya: pos > 0 ? sama[pos - 1]! : null, riwayatJenis: sama.slice(0, pos + 1), milikSaya };
}

/** Rekap semua siswa aktif untuk owner/admin. Siswa yang perlu didorong ditaruh paling atas. */
export async function loadRekapLatihan(actor: Actor, filter: FilterRekapLatihan, siswaId?: string): Promise<RekapLatihan> {
  if (!canSeeAllLatihan(actor)) notFound();
  const m = model(await read());
  return rekapDari(m.students, m.bySiswa, m.hariIni, filter, siswaId);
}
