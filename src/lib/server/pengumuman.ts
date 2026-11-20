import "server-only";
import { notFound } from "next/navigation";
import { canManagePengumuman, daftarPengumuman, hariIniLembaga, pengumumanLewat, pengumumanTampil, type Pengumuman } from "../core/pengumuman";
import type { Actor } from "../core/types";
import { str } from "../data/rows";
import { AppError, type Tables } from "../data/types";
import { dataDeps } from "./data";

/** Pengumuman beserta nama penulisnya (untuk keterangan "Pelatih Garda · Kamis, 19 Nov 2026"). */
export interface PengumumanView extends Pengumuman {
  penulis: string;
}

/** Membaca tab Pengumuman. Null bila tab belum dibuat di spreadsheet (beranda tetap tampil). */
async function bacaTab(): Promise<Tables | null> {
  try {
    return await (await dataDeps()).store.read("inti", ["Pengaturan", "Pengguna", "Pengumuman"]);
  } catch (error) {
    if (error instanceof AppError && error.code === "SCHEMA_INCOMPLETE") return null;
    throw error;
  }
}

function denganPenulis(t: Tables, list: Pengumuman[]): PengumumanView[] {
  const nama = new Map((t.Pengguna ?? []).map((row) => [str(row.user_id), str(row.nama)]));
  return list.map((p) => ({ ...p, penulis: nama.get(p.created_by) || "Pelatih" }));
}

export interface PengumumanOwner {
  today: string;
  tampil: PengumumanView[];
  lewat: PengumumanView[];
  /** false = tab Pengumuman belum ada di spreadsheet. */
  siap: boolean;
}

/** Halaman Pengumuman (owner/admin): yang sedang tampil dan yang sudah lewat. */
export async function loadPengumumanOwner(actor: Actor): Promise<PengumumanOwner> {
  if (!canManagePengumuman(actor)) notFound();
  const t = await bacaTab();
  const today = hariIniLembaga(t ?? {}, new Date().toISOString());
  if (!t) return { today, tampil: [], lewat: [], siap: false };
  const list = daftarPengumuman(t);
  return { today, tampil: denganPenulis(t, pengumumanTampil(list, today)), lewat: denganPenulis(t, pengumumanLewat(list, today)), siap: true };
}

/** Kartu "Info dari pelatih" di beranda siswa/wali: hanya yang belum lewat, disematkan dulu. */
export async function loadInfoPelatih(): Promise<PengumumanView[]> {
  const t = await bacaTab();
  if (!t) return [];
  const today = hariIniLembaga(t, new Date().toISOString());
  return denganPenulis(t, pengumumanTampil(daftarPengumuman(t), today));
}
