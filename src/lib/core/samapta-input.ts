// Validasi isian form Tes Samapta. Angka dibiarkan berupa teks; rentangnya diperiksa di domain (samapta.ts).
import { z } from "zod";
import { POS, TEST_STATUS } from "./samapta";

const id = (label: string) => z.string().trim().min(1, `${label} wajib diisi.`).max(120);
const cell = z.string().trim().max(120).default("");

export const samaptaTestInput = z.object({
  tes_id: z.string().default(""),
  nama: z.string().trim().max(80, "Nama tes maksimal 80 karakter.").default(""),
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tes tidak valid."),
  jam_mulai: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Jam mulai tidak valid (JJ:MM)."),
  tempat: z.string().trim().max(80, "Tempat maksimal 80 karakter.").default(""),
  catatan: z.string().trim().max(300, "Catatan maksimal 300 karakter.").default(""),
});

export const samaptaStatusInput = z.object({ tes_id: id("Tes"), status: z.enum(TEST_STATUS) });

export const samaptaParticipantInput = z.object({ tes_id: id("Tes"), siswa_id: id("Siswa") });

export const samaptaPosInput = z.object({
  tes_id: id("Tes"),
  siswa_id: id("Siswa"),
  pos: z.enum([...POS, "keterangan"], { message: "Pos tidak dikenal." }),
  tensi_1: cell,
  tensi_2: cell,
  tensi_3: cell,
  riwayat_1: cell,
  riwayat_2: cell,
  riwayat_3: cell,
  tinggi_cm: cell,
  berat_kg: cell,
  lari_jarak: cell,
  pull_jumlah: cell,
  situp_jumlah: cell,
  pushup_jumlah: cell,
  shuttle_waktu: cell,
  renang_gaya: cell,
  renang_waktu: cell,
  keterangan: z.string().trim().max(200, "Keterangan maksimal 200 karakter.").default(""),
});
