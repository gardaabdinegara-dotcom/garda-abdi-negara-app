// Menyimpan hasil latihan psikotes. Skor tidak dipercaya dari HP: server menghitung ulang dari data per bagian.
import type { OperationContext, OperationOutcome } from "../data/coordinator";
import { AppError, type Row, type Tables } from "../data/types";
import { localClock } from "./akademik";
import { DEFAULT_SETTINGS } from "../data/schema";
import { hitungHasil, isDurasi, isJenis, PRESET, type Bagian, type DurasiLatihan, type HasilLatihan, type JenisLatihan } from "./latihan";
import { created, find, forbidden } from "./table-ops";
import { linkedStudentIds, toStudent, type Actor } from "./types";
import { num, str } from "../data/rows";

/**
 * Tab yang dibaca saat menyimpan. Latihan_Psikotes sengaja tidak dibaca: tab itu diperlakukan seperti log
 * (hanya ditambah satu baris lewat appendCells), jadi menyimpan tetap ringan walau riwayat latihan sudah ribuan baris
 * dan banyak siswa menyimpan bersamaan.
 */
export const LATIHAN_TABLES = ["Pengaturan", "Siswa"] as const;

export interface LatihanInput {
  jenis: string;
  durasi: string;
  /** Waktu mulai (ISO). */
  mulai: string;
  /** Lama mengerjakan dalam detik. */
  detik: number;
  /** Jumlah benar & dijawab per kolom/interval. */
  seri: Bagian[];
}

export interface Latihan extends HasilLatihan {
  latihan_id: string;
  siswa_id: string;
  jenis: JenisLatihan;
  durasi: DurasiLatihan;
  tanggal: string;
  mulai: string;
  detik: number;
  seri: Bagian[];
}

/** Membaca seri dari teks JSON [[benar, jawab], ...]; data rusak menjadi kosong. */
export function parseSeri(text: unknown): Bagian[] {
  try {
    const raw = JSON.parse(String(text || "[]")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.map((x) => (Array.isArray(x) ? { benar: Number(x[0]) || 0, jawab: Number(x[1]) || 0 } : { benar: 0, jawab: 0 }));
  } catch {
    return [];
  }
}

export function toLatihan(row: Row): Latihan {
  const jenis = isJenis(row.jenis) ? row.jenis : "kraepelin";
  const seri = parseSeri(row.seri_json);
  const detik = num(row.detik, 0);
  return {
    ...hitungHasil(jenis, seri, detik),
    latihan_id: str(row.latihan_id),
    siswa_id: str(row.siswa_id),
    jenis,
    durasi: isDurasi(row.durasi) ? row.durasi : "standar",
    tanggal: str(row.tanggal),
    mulai: str(row.mulai),
    detik,
    seri,
  };
}

/** Siswa menyimpan satu latihan. Batas kewajaran mencegah data aneh masuk ke spreadsheet. */
export function saveLatihan(t: Tables, input: LatihanInput, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (actor.user.peran !== "SISWA") throw forbidden("Hasil latihan hanya disimpan untuk akun siswa.");
  const siswaId = linkedStudentIds(actor, "SISWA")[0];
  if (!siswaId) throw new AppError("Akun ini belum ditautkan ke data siswa. Hubungi admin.");
  const student = find(t, "Siswa", "siswa_id", siswaId);
  if (!student || !toStudent(student.row).aktif) throw new AppError("Data siswa tidak aktif.");
  if (!isJenis(input.jenis)) throw new AppError("Jenis latihan tidak dikenal.");
  if (!isDurasi(input.durasi)) throw new AppError("Durasi latihan tidak dikenal.");
  const preset = PRESET[input.jenis][input.durasi];
  const seri = (input.seri ?? []).slice(0, preset.bagian);
  if (seri.length === 0) throw new AppError("Belum ada jawaban untuk disimpan.");
  for (const s of seri) {
    if (!Number.isInteger(s.benar) || !Number.isInteger(s.jawab) || s.benar < 0 || s.jawab < s.benar || s.jawab > 400) {
      throw new AppError("Data latihan tidak wajar.");
    }
  }
  const batasDetik = preset.bagian * preset.detik + 30;
  const detik = Math.round(Number(input.detik));
  if (!Number.isFinite(detik) || detik < 5 || detik > batasDetik) throw new AppError("Lama latihan tidak wajar.");
  const hasil = hitungHasil(input.jenis, seri, detik);
  const zona = str((t.Pengaturan ?? []).find((r) => r.key === "zona_waktu")?.value ?? DEFAULT_SETTINGS.zona_waktu) || "Asia/Jakarta";
  const mulai = Number.isFinite(Date.parse(input.mulai)) ? new Date(input.mulai).toISOString() : ctx.now;
  const row = {
    latihan_id: ctx.newId("LAT"),
    siswa_id: siswaId,
    jenis: input.jenis,
    durasi: input.durasi,
    tanggal: localClock(zona, ctx.now).date,
    mulai,
    detik,
    dijawab: hasil.dijawab,
    benar: hasil.benar,
    salah: hasil.salah,
    kecepatan: hasil.kecepatan,
    ketelitian: hasil.ketelitian,
    stabilitas: hasil.stabilitas,
    performa: hasil.performa,
    skor: hasil.skor,
    seri_json: JSON.stringify(seri.map((s) => [s.benar, s.jawab])),
    ...created(ctx),
  };
  (t.Latihan_Psikotes ??= []).push(row);
  return { entityType: "Latihan_Psikotes", entityId: row.latihan_id, message: `Hasil latihan disimpan. Skor ${hasil.skor}.`, after: row };
}
