// Pengumuman dari pelatih: tampil di beranda siswa sampai tanggal yang dipilih, lalu hilang sendiri.
// Hanya OWNER/ADMIN yang menulis, mengubah, dan menghapus. Hapus = status DIHAPUS (baris tetap di spreadsheet).
import { z } from "zod";
import type { OperationContext, OperationOutcome } from "../data/coordinator";
import { bool, str } from "../data/rows";
import { AppError, type Row, type Tables } from "../data/types";
import { todayISO } from "../format";
import { PENGUMUMAN_HARI_MAX, PENGUMUMAN_ISI_MAX, PENGUMUMAN_JUDUL_MAX, tambahHari } from "./pengumuman-teks";
import { find, forbidden, notFound, replace, rows, upsert } from "./table-ops";
import type { Actor } from "./types";

export { PENGUMUMAN_HARI_MAX, PENGUMUMAN_ISI_MAX, PENGUMUMAN_JUDUL_MAX, teksWaPengumuman } from "./pengumuman-teks";

export type StatusPengumuman = "AKTIF" | "DIHAPUS";

export interface Pengumuman {
  pengumuman_id: string;
  judul: string;
  isi: string;
  /** YYYY-MM-DD: hari terakhir info tampil di beranda siswa. */
  tampil_sampai: string;
  disematkan: boolean;
  status: StatusPengumuman;
  created_at: string;
  created_by: string;
  updated_at: string;
}

export function toPengumuman(row: Row): Pengumuman {
  return {
    pengumuman_id: str(row.pengumuman_id),
    judul: str(row.judul),
    isi: str(row.isi),
    tampil_sampai: str(row.tampil_sampai),
    disematkan: bool(row.disematkan),
    status: str(row.status) === "DIHAPUS" ? "DIHAPUS" : "AKTIF",
    created_at: str(row.created_at),
    created_by: str(row.created_by),
    updated_at: str(row.updated_at),
  };
}

export const canManagePengumuman = (actor: Actor) => actor.user.peran === "OWNER" || actor.user.peran === "ADMIN";

export const pengumumanInput = z.object({
  pengumuman_id: z.string().trim().max(60).default(""),
  judul: z.string().trim().min(1, "Judul wajib diisi.").max(PENGUMUMAN_JUDUL_MAX, `Judul maksimal ${PENGUMUMAN_JUDUL_MAX} karakter.`),
  // Browser mengirim baris baru textarea sebagai CRLF; dihitung satu karakter seperti penghitung di form.
  isi: z.preprocess(
    (value) => (typeof value === "string" ? value.replace(/\r\n?/g, "\n") : value),
    z.string().trim().min(1, "Isi wajib diisi.").max(PENGUMUMAN_ISI_MAX, `Isi maksimal ${PENGUMUMAN_ISI_MAX} karakter.`),
  ),
  tampil_sampai: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pilih tanggal tampil sampai."),
  disematkan: z.boolean().default(false),
});

export type PengumumanInput = z.infer<typeof pengumumanInput>;

/** Tanggal hari ini menurut zona waktu lembaga (tab Pengaturan) pada saat `nowIso`. */
export function hariIniLembaga(t: Tables, nowIso: string): string {
  const zona = str((t.Pengaturan ?? []).find((row) => row.key === "zona_waktu")?.value) || "Asia/Jakarta";
  try {
    return todayISO(zona, new Date(nowIso));
  } catch {
    return todayISO("Asia/Jakarta", new Date(nowIso));
  }
}

function cekTanggal(tampilSampai: string, today: string) {
  if (tampilSampai < today) throw new AppError("Tanggal tampil sampai tidak boleh sebelum hari ini.", "VALIDATION", 400);
  if (tampilSampai > tambahHari(today, PENGUMUMAN_HARI_MAX)) throw new AppError("Tanggal tampil sampai paling lama satu tahun dari hari ini.", "VALIDATION", 400);
}

/** Pengumuman baru (tanpa `pengumuman_id`) atau ubah pengumuman yang masih ada. */
export function simpanPengumuman(t: Tables, input: PengumumanInput, today: string, ctx: OperationContext, actor: Actor): OperationOutcome<{ pengumuman_id: string }> {
  if (!canManagePengumuman(actor)) throw forbidden("Hanya owner yang dapat menulis pengumuman.");
  cekTanggal(input.tampil_sampai, today);
  const isi = { judul: input.judul, isi: input.isi, tampil_sampai: input.tampil_sampai, disematkan: input.disematkan };
  if (input.pengumuman_id) {
    const found = find(t, "Pengumuman", "pengumuman_id", input.pengumuman_id);
    if (!found || toPengumuman(found.row).status === "DIHAPUS") throw notFound("Pengumuman");
    const { before, after } = upsert(t, "Pengumuman", "pengumuman_id", { ...found.row, ...isi }, ctx);
    return { entityType: "Pengumuman", entityId: input.pengumuman_id, message: "Pengumuman diperbarui.", before, after, data: { pengumuman_id: input.pengumuman_id } };
  }
  const id = ctx.newId("PNG");
  const { after } = upsert(t, "Pengumuman", "pengumuman_id", { pengumuman_id: id, ...isi, status: "AKTIF" }, ctx);
  return { entityType: "Pengumuman", entityId: id, message: "Pengumuman terbit di beranda siswa.", before: null, after, data: { pengumuman_id: id } };
}

/** Menghapus = menandai DIHAPUS; baris tetap ada di spreadsheet. */
export function hapusPengumuman(t: Tables, pengumumanId: string, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!canManagePengumuman(actor)) throw forbidden("Hanya owner yang dapat menghapus pengumuman.");
  const found = find(t, "Pengumuman", "pengumuman_id", pengumumanId);
  if (!found) throw notFound("Pengumuman");
  if (toPengumuman(found.row).status === "DIHAPUS") {
    return { entityType: "Pengumuman", entityId: pengumumanId, message: "Pengumuman sudah dihapus." };
  }
  const after = { ...found.row, status: "DIHAPUS", updated_at: ctx.now, updated_by: ctx.actorId };
  replace(t, "Pengumuman", found.index, after);
  return { entityType: "Pengumuman", entityId: pengumumanId, message: "Pengumuman dihapus dari beranda siswa.", before: found.row, after };
}

const terbaru = (a: Pengumuman, b: Pengumuman) => b.created_at.localeCompare(a.created_at) || b.pengumuman_id.localeCompare(a.pengumuman_id);

/** Yang masih tampil hari ini: disematkan paling atas, lalu yang terbaru. */
export function pengumumanTampil(list: readonly Pengumuman[], today: string): Pengumuman[] {
  return list
    .filter((p) => p.status === "AKTIF" && p.tampil_sampai >= today)
    .sort((a, b) => Number(b.disematkan) - Number(a.disematkan) || terbaru(a, b));
}

/** Yang sudah lewat tanggal tampilnya (tidak termasuk yang dihapus), terbaru di atas. */
export function pengumumanLewat(list: readonly Pengumuman[], today: string): Pengumuman[] {
  return list.filter((p) => p.status === "AKTIF" && p.tampil_sampai < today).sort(terbaru);
}

export function daftarPengumuman(t: Tables): Pengumuman[] {
  return rows(t, "Pengumuman").map(toPengumuman);
}
