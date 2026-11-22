import "server-only";
import { notFound } from "next/navigation";
import { academicSettings, localClock } from "../core/akademik";
import { kelompokkanPerSiswa, progresOf, rekapDari, dalamMingguIni, type FilterRekapLatihan, type ProgresLatihan, type RekapLatihan } from "../core/latihan-rekap";
import { toLatihan, type Latihan } from "../core/latihan-simpan";
import { bacaTarget, geserTanggal, hariBeruntun, progresTarget, rekorBeruntun, ringkasTargetKelompok, type ProgresTarget, type RingkasTargetKelompok, type TargetLatihan } from "../core/latihan-target";
import {
  klasemenMinggu,
  lencanaSiswa,
  namaKlasemen,
  riwayatMinggu,
  ringkasKlasemen,
  seninDari,
  tingkatSiswa,
  type KlasemenMinggu,
  type Lencana,
  type RingkasKlasemen,
  type TingkatJenis,
} from "../core/latihan-klasemen";
import type { JenisLatihan } from "../core/latihan";
import { waTemplates } from "../core/wa";
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
  return { students, bySiswa, hariIni: today(t), target: bacaTarget(t) };
}

/** Target minggu ini milik satu siswa, ditambah hari beruntun dan rekornya. */
export interface TargetSiswa extends ProgresTarget {
  beruntun: number;
  rekor: number;
}

function targetSiswa(target: TargetLatihan, riwayat: readonly Latihan[], hariIni: string): TargetSiswa {
  const tanggal = riwayat.map((l) => l.tanggal);
  return { ...progresTarget(target, riwayat, hariIni), beruntun: hariBeruntun(tanggal, hariIni), rekor: rekorBeruntun(tanggal, hariIni) };
}

/** Bahan klasemen: siswa aktif, semua latihan, minggu berjalan (Senin sampai hari ini), dan posisi akhir kemarin. */
function dasarKlasemen(m: ReturnType<typeof model>) {
  const aktif = m.students.filter((s) => s.aktif);
  const peserta = aktif.map((s) => s.siswa_id);
  const latihan = [...m.bySiswa.values()].flat();
  const dari = seninDari(m.hariIni);
  const sekarang = klasemenMinggu(latihan, peserta, dari, m.hariIni);
  const kemarin = m.hariIni > dari ? klasemenMinggu(latihan, peserta, dari, geserTanggal(m.hariIni, -1)) : null;
  return { aktif, peserta, latihan, dari, sekarang, kemarin };
}

/**
 * Menu latihan siswa: progres, target minggu ini (null bila owner belum memasang target), dan posisi klasemen.
 * Owner/admin (mode coba) mendapat semuanya null.
 */
export async function loadMenuLatihan(
  actor: Actor,
): Promise<{ progres: ProgresLatihan | null; target: TargetSiswa | null; klasemen: RingkasKlasemen | null }> {
  const kosong = { progres: null, target: null, klasemen: null };
  if (actor.user.peran !== "SISWA") return kosong;
  const siswaId = linkedStudentIds(actor, "SISWA")[0];
  if (!siswaId) return kosong;
  const m = model(await read());
  const student = m.students.find((s) => s.siswa_id === siswaId);
  if (!student) return kosong;
  const riwayat = m.bySiswa.get(siswaId) ?? [];
  const k = student.aktif ? dasarKlasemen(m) : null;
  return {
    progres: progresOf(student, riwayat, m.hariIni),
    target: m.target && student.aktif ? targetSiswa(m.target, riwayat, m.hariIni) : null,
    klasemen: k ? ringkasKlasemen(k.sekarang, k.kemarin, siswaId) : null,
  };
}

export interface DataKlasemen {
  hariIni: string;
  zona: string;
  /** Senin dan Minggu minggu berjalan. */
  dari: string;
  sampai: string;
  sekarang: KlasemenMinggu;
  kemarin: KlasemenMinggu | null;
  mingguLalu: KlasemenMinggu;
  /** Nama tampil per siswa_id: nama lengkap untuk owner/admin, nama depan dan inisial untuk siswa. */
  nama: Record<string, string>;
  peserta: number;
  lihatSemua: boolean;
  /** Tingkat dan lencana siswa yang masuk (null untuk owner/admin atau akun yang belum tertaut). */
  saya: { siswa_id: string; tingkat: Record<JenisLatihan, TingkatJenis>; lencana: Lencana[] } | null;
}

/** Klasemen latihan minggu berjalan untuk siswa (dengan tingkat dan lencana sendiri) dan owner/admin. */
export async function loadKlasemen(actor: Actor): Promise<DataKlasemen> {
  const lihatSemua = canSeeAllLatihan(actor);
  if (!lihatSemua && actor.user.peran !== "SISWA") notFound();
  const t = await read();
  const m = model(t);
  const d = dasarKlasemen(m);
  const mingguLalu = klasemenMinggu(d.latihan, d.peserta, geserTanggal(d.dari, -7), geserTanggal(d.dari, -1));
  const nama = lihatSemua ? Object.fromEntries(d.aktif.map((s) => [s.siswa_id, s.nama])) : namaKlasemen(d.aktif);
  let saya: DataKlasemen["saya"] = null;
  const siswaId = actor.user.peran === "SISWA" ? linkedStudentIds(actor, "SISWA")[0] : undefined;
  if (siswaId && d.peserta.includes(siswaId)) {
    const riwayat = m.bySiswa.get(siswaId) ?? [];
    saya = {
      siswa_id: siswaId,
      tingkat: tingkatSiswa(riwayat, m.hariIni),
      lencana: lencanaSiswa({ siswaId, latihanSiswa: riwayat, mingguSelesai: riwayatMinggu(d.latihan, d.peserta, d.dari), sekarang: d.sekarang, hariIni: m.hariIni }),
    };
  }
  return {
    hariIni: m.hariIni,
    zona: academicSettings(t).zona_waktu,
    dari: d.dari,
    sampai: geserTanggal(d.dari, 6),
    sekarang: d.sekarang,
    kemarin: d.kemarin,
    mingguLalu,
    nama,
    peserta: d.peserta.length,
    lihatSemua,
    saya,
  };
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

export interface RekapPemilik extends RekapLatihan {
  /** Target minggu ini untuk semua siswa aktif; null bila belum dipasang. */
  target: RingkasTargetKelompok | null;
  /** Template pesan WA "latihan" dan nama lembaga untuk tombol WA per siswa. */
  wa: { template: string; lembaga: string };
}

/** Rekap semua siswa aktif untuk owner/admin. Siswa yang perlu didorong ditaruh paling atas. */
export async function loadRekapLatihan(actor: Actor, filter: FilterRekapLatihan, siswaId?: string): Promise<RekapPemilik> {
  if (!canSeeAllLatihan(actor)) notFound();
  const t = await read();
  const m = model(t);
  const rekap = rekapDari(m.students, m.bySiswa, m.hariIni, filter, siswaId);
  const target = m.target ? ringkasTargetKelompok(m.target, rekap.baris.map((b) => b.student.siswa_id), m.bySiswa, m.hariIni) : null;
  return { ...rekap, target, wa: { template: waTemplates({ Pengaturan: t.Pengaturan ?? [] }).latihan, lembaga: academicSettings(t).nama_lembaga } };
}
