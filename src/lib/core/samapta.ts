// Tes Samapta (kesamaptaan jasmani): sesi tes, isian blangko per pos, dan perhitungan hasil akhir.
// Mengikuti blangko lembaga: Garjas A = nilai lari 12 menit; Garjas B = rata-rata nilai pull up/chinning,
// sit up, push up, dan shuttle run; hasil akhir = (A + B) / 2. Nilai renang gaya dada ditampilkan terpisah.
import type { OperationContext, OperationOutcome } from "../data/coordinator";
import { num, str } from "../data/rows";
import { DEFAULT_SETTINGS } from "../data/schema";
import { AppError, type Row, type Tables } from "../data/types";
import { ageAt, GARJAS_FIELDS, garjasScore, nilaiRenang } from "./samapta-garjas";
import { find, forbidden, notFound, replace, rows, updated, upsert, created } from "./table-ops";
import { toStudent, type Actor, type Gender, type Student } from "./types";

// ---------------------------------------------------------------- Konstanta

export const POS = ["tensi", "badan", "lari", "pull", "situp", "pushup", "shuttle", "renang"] as const;
export type Pos = (typeof POS)[number];

export interface PosInfo {
  label: string;
  /** Label pendek untuk chip pos di ponsel. */
  short: string;
  satuan: string;
  tip: string;
  /** Kolom Hasil_Samapta yang diisi di pos ini. */
  fields: readonly string[];
}

export const POS_INFO: Record<Pos, PosInfo> = {
  tensi: {
    label: "Tensi & riwayat kesehatan",
    short: "Tensi",
    satuan: "mmHg",
    tip: "Ukur tensi tiga kali (contoh 120/80). Tulis riwayat kesehatan 6 bulan terakhir bila ada.",
    fields: ["tensi_1", "tensi_2", "tensi_3", "riwayat_1", "riwayat_2", "riwayat_3"],
  },
  badan: {
    label: "Tinggi & berat badan",
    short: "Badan",
    satuan: "cm · kg",
    tip: "Tinggi dalam cm dan berat dalam kg. IMT dan klasifikasinya dihitung otomatis.",
    fields: ["tinggi_cm", "berat_kg"],
  },
  lari: {
    label: "Lari 12 menit (Garjas A)",
    short: "Lari",
    satuan: "meter",
    tip: "Catat jarak yang ditempuh dalam 12 menit. Nilai Garjas A dihitung dari tabel.",
    fields: ["lari_jarak", "lari_nilai"],
  },
  pull: {
    label: "Pull up / Chinning",
    short: "Pull up",
    satuan: "kali",
    tip: "Catat jumlah pull up (putra) atau chinning (putri) yang sah dalam 1 menit.",
    fields: ["pull_jumlah", "pull_nilai"],
  },
  situp: { label: "Sit up", short: "Sit up", satuan: "kali", tip: "Catat jumlah sit up dalam 1 menit.", fields: ["situp_jumlah", "situp_nilai"] },
  pushup: { label: "Push up", short: "Push up", satuan: "kali", tip: "Catat jumlah push up dalam 1 menit.", fields: ["pushup_jumlah", "pushup_nilai"] },
  shuttle: {
    label: "Shuttle run 6 × 10 m",
    short: "Shuttle",
    satuan: "detik",
    tip: "Catat waktu tempuh dalam detik, mis. 17,4.",
    fields: ["shuttle_waktu", "shuttle_nilai"],
  },
  renang: {
    label: "Renang dasar 50 m",
    short: "Renang",
    satuan: "detik",
    tip: "Pilih gaya dan catat waktunya, mis. 1:05. Nilai tersedia untuk gaya dada 50 m.",
    fields: ["renang_gaya", "renang_waktu"],
  },
};

export const GAYA_RENANG = ["Bebas", "Dada", "Punggung", "Kupu-kupu"] as const;

export const TEST_STATUS = ["BERJALAN", "SELESAI", "DIBATALKAN", "DIHAPUS"] as const;
export type SamaptaStatus = (typeof TEST_STATUS)[number];
export const TEST_STATUS_LABEL: Record<SamaptaStatus, string> = { BERJALAN: "Berjalan", SELESAI: "Selesai", DIBATALKAN: "Dibatalkan", DIHAPUS: "Dihapus" };

export const KLASIFIKASI = ["Baik Sekali", "Baik", "Cukup", "Kurang"] as const;
export type Klasifikasi = (typeof KLASIFIKASI)[number];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------------------------------------------------------------- Bentuk data

export interface SamaptaTest {
  tes_id: string;
  nama: string;
  tanggal: string;
  jam_mulai: string;
  tempat: string;
  status: SamaptaStatus;
  peserta_ids: string[];
  catatan: string;
}

export interface SamaptaResult {
  hasil_id: string;
  tes_id: string;
  siswa_id: string;
  tensi: [string, string, string];
  riwayat: [string, string, string];
  tinggi_cm: number | null;
  berat_kg: number | null;
  lari_jarak: number | null;
  lari_nilai: number | null;
  pull_jumlah: number | null;
  pull_nilai: number | null;
  situp_jumlah: number | null;
  situp_nilai: number | null;
  pushup_jumlah: number | null;
  pushup_nilai: number | null;
  shuttle_waktu: number | null;
  shuttle_nilai: number | null;
  renang_gaya: string;
  renang_waktu: number | null;
  keterangan: string;
}

export interface SamaptaSettings {
  kop: string;
  tempat: string;
  kota: string;
  ttd_jabatan: string;
  ttd_nama: string;
  baik_sekali: number;
  baik: number;
  cukup: number;
}

const opt = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

export const toSamaptaTest = (row: Row): SamaptaTest => ({
  tes_id: str(row.tes_id),
  nama: str(row.nama),
  tanggal: str(row.tanggal),
  jam_mulai: str(row.jam_mulai),
  tempat: str(row.tempat),
  status: row.status === "SELESAI" || row.status === "DIBATALKAN" || row.status === "DIHAPUS" ? row.status : "BERJALAN",
  peserta_ids: str(row.peserta_ids).split(",").map((s) => s.trim()).filter(Boolean),
  catatan: str(row.catatan),
});

export const toSamaptaResult = (row: Row): SamaptaResult => ({
  hasil_id: str(row.hasil_id),
  tes_id: str(row.tes_id),
  siswa_id: str(row.siswa_id),
  tensi: [str(row.tensi_1), str(row.tensi_2), str(row.tensi_3)],
  riwayat: [str(row.riwayat_1), str(row.riwayat_2), str(row.riwayat_3)],
  tinggi_cm: opt(row.tinggi_cm),
  berat_kg: opt(row.berat_kg),
  lari_jarak: opt(row.lari_jarak),
  lari_nilai: opt(row.lari_nilai),
  pull_jumlah: opt(row.pull_jumlah),
  pull_nilai: opt(row.pull_nilai),
  situp_jumlah: opt(row.situp_jumlah),
  situp_nilai: opt(row.situp_nilai),
  pushup_jumlah: opt(row.pushup_jumlah),
  pushup_nilai: opt(row.pushup_nilai),
  shuttle_waktu: opt(row.shuttle_waktu),
  shuttle_nilai: opt(row.shuttle_nilai),
  renang_gaya: str(row.renang_gaya),
  renang_waktu: opt(row.renang_waktu),
  keterangan: str(row.keterangan),
});

/** Hasil kosong (siswa belum dites sama sekali). */
export const emptyResult = (tesId: string, siswaId: string): SamaptaResult =>
  toSamaptaResult({ hasil_id: `${tesId}:${siswaId}`, tes_id: tesId, siswa_id: siswaId });

export function samaptaSettings(t: Tables): SamaptaSettings {
  const value = (key: string) => (t.Pengaturan ?? []).find((row) => row.key === key)?.value ?? DEFAULT_SETTINGS[key] ?? "";
  return {
    kop: str(value("samapta_kop")) || "BIMBEL GARDA ABDI NEGARA",
    tempat: str(value("samapta_tempat")),
    kota: str(value("samapta_kota")),
    ttd_jabatan: str(value("samapta_ttd_jabatan")),
    ttd_nama: str(value("samapta_ttd_nama")),
    baik_sekali: num(value("samapta_baik_sekali"), 81),
    baik: num(value("samapta_baik"), 61),
    cukup: num(value("samapta_cukup"), 41),
  };
}

// ---------------------------------------------------------------- Perhitungan

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Klasifikasi hasil akhir menurut batas lembaga (bawaan: ≥81 Baik Sekali, 61–80 Baik, 41–60 Cukup, ≤40 Kurang). */
export function classify(value: number | null, s: Pick<SamaptaSettings, "baik_sekali" | "baik" | "cukup">): Klasifikasi | null {
  if (value === null) return null;
  if (value >= s.baik_sekali) return "Baik Sekali";
  if (value >= s.baik) return "Baik";
  if (value >= s.cukup) return "Cukup";
  return "Kurang";
}

/** Indeks massa tubuh, satu desimal. */
export function imtOf(tinggiCm: number | null, beratKg: number | null): number | null {
  if (!tinggiCm || !beratKg) return null;
  return round(beratKg / (tinggiCm / 100) ** 2, 1);
}

export function imtLabel(imt: number | null): string {
  if (imt === null) return "";
  if (imt < 18.5) return "Kurus";
  if (imt < 25) return "Normal";
  if (imt < 30) return "Gemuk";
  return "Obesitas";
}

export const pullLabel = (gender: Gender | "") => (gender === "P" ? "Chinning" : "Pull Up");

export interface SamaptaScore {
  imt: number | null;
  imtKlas: string;
  garjasA: number | null;
  garjasB: number | null;
  renang: number | null;
  akhir: number | null;
  klas: Klasifikasi | null;
  pullLabel: string;
}

/** Garjas B hanya dihitung bila keempat nilai sudah ada; hasil akhir bila A dan B ada. */
export function scoreOf(
  result: SamaptaResult,
  gender: Gender | "",
  s: Pick<SamaptaSettings, "baik_sekali" | "baik" | "cukup">,
  usia: number | null = null,
): SamaptaScore {
  const imt = imtOf(result.tinggi_cm, result.berat_kg);
  const garjasA = result.lari_nilai;
  const bParts = [result.pull_nilai, result.situp_nilai, result.pushup_nilai, result.shuttle_nilai];
  const garjasB = bParts.every((v) => v !== null) ? round((bParts as number[]).reduce((a, b) => a + b, 0) / 4, 2) : null;
  const akhir = garjasA !== null && garjasB !== null ? round((garjasA + garjasB) / 2, 2) : null;
  const renang = nilaiRenang(result.renang_gaya, result.renang_waktu, usia);
  return { imt, imtKlas: imtLabel(imt), garjasA, garjasB, renang, akhir, klas: classify(akhir, s), pullLabel: pullLabel(gender) };
}

/** Apakah isian satu pos sudah lengkap untuk siswa ini. */
export function posFilled(result: SamaptaResult, pos: Pos): boolean {
  switch (pos) {
    case "tensi":
      return result.tensi.every((v) => v !== "");
    case "badan":
      return result.tinggi_cm !== null && result.berat_kg !== null;
    case "lari":
      return result.lari_jarak !== null && result.lari_nilai !== null;
    case "pull":
      return result.pull_jumlah !== null && result.pull_nilai !== null;
    case "situp":
      return result.situp_jumlah !== null && result.situp_nilai !== null;
    case "pushup":
      return result.pushup_jumlah !== null && result.pushup_nilai !== null;
    case "shuttle":
      return result.shuttle_waktu !== null && result.shuttle_nilai !== null;
    case "renang":
      return result.renang_gaya !== "" && result.renang_waktu !== null;
  }
}

/** Jumlah peserta yang sudah lengkap di setiap pos. */
export function testProgress(pesertaIds: readonly string[], results: ReadonlyMap<string, SamaptaResult>): Record<Pos, number> {
  return Object.fromEntries(POS.map((pos) => [pos, pesertaIds.filter((id) => { const r = results.get(id); return r ? posFilled(r, pos) : false; }).length])) as Record<Pos, number>;
}

/** Durasi untuk tampilan: "49 dtk" atau "1:05,5", termasuk pecahan detik. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "";
  const total = Math.round(seconds * 100);
  if (total < 6000) return `${(total / 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })} dtk`;
  const rest = (total % 6000) / 100;
  return `${Math.floor(total / 6000)}:${rest.toLocaleString("id-ID", { minimumIntegerDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Pintasan papan angka "1.05" atau "1,05" berarti "1:05". */
export function normalizeDuration(text: string): string {
  const value = text.trim();
  const mss = /^(\d)[.,]([0-5]\d)$/.exec(value);
  return mss ? `${mss[1]}:${mss[2]}` : value;
}

/** Membaca "65", "65,5", atau "1:05" menjadi detik. Teks kosong → null. */
export function parseDuration(text: string, label: string): number | null {
  const value = normalizeDuration(text);
  if (!value) return null;
  const mmss = /^(\d{1,2}):([0-5]?\d(?:[.,]\d{1,2})?)$/.exec(value);
  const seconds = mmss ? Number(mmss[1]) * 60 + Number(mmss[2]!.replace(",", ".")) : Number(value.replace(",", "."));
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 900) throw new AppError(`${label} tidak valid. Tulis dalam detik (65) atau menit:detik (1:05).`);
  return round(seconds, 2);
}

/** Peserta tes: daftar beku saat tes dibuat, diurutkan kode siswa. */
export function participantsOfTest(test: SamaptaTest, students: readonly Student[]): Student[] {
  const byId = new Map(students.map((s) => [s.siswa_id, s]));
  return test.peserta_ids.map((id) => byId.get(id)).filter((s): s is Student => Boolean(s)).sort((a, b) => a.kode_siswa.localeCompare(b.kode_siswa));
}

/** Peringkat hasil akhir dalam satu tes (yang belum lengkap di urutan terakhir). */
export function rankOf(entries: readonly { siswa_id: string; akhir: number | null }[]): Map<string, number> {
  const sorted = [...entries].sort((a, b) => (b.akhir ?? -1) - (a.akhir ?? -1));
  return new Map(sorted.map((e, i) => [e.siswa_id, i + 1]));
}

// ---------------------------------------------------------------- Hak akses

const isStaff = (actor: Actor) => ["OWNER", "ADMIN", "PENGAJAR"].includes(actor.user.peran);
export const canManageSamapta = isStaff;

// ---------------------------------------------------------------- Pembantu perintah

function testById(t: Tables, tesId: string) {
  const found = find(t, "Tes_Samapta", "tes_id", tesId);
  if (!found) throw notFound("Tes samapta");
  return { ...found, test: toSamaptaTest(found.row) };
}

function numberIn(text: string, label: string, min: number, max: number, integer = false): number | null {
  const value = text.trim();
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new AppError(`${label} harus antara ${min} dan ${max}.`);
  if (integer && !Number.isInteger(parsed)) throw new AppError(`${label} harus bilangan bulat.`);
  return parsed;
}

/** Tensi "120/80" (sistolik 60–260, diastolik 30–160). */
function tensi(text: string, label: string): string {
  const value = text.trim().replace(/\s+/g, "");
  if (!value) return "";
  const match = /^(\d{2,3})\/(\d{2,3})$/.exec(value);
  const sys = Number(match?.[1]), dia = Number(match?.[2]);
  if (!match || sys < 60 || sys > 260 || dia < 30 || dia > 160 || dia >= sys) throw new AppError(`${label} tidak valid. Tulis seperti 120/80.`);
  return `${sys}/${dia}`;
}

const blank = (value: number | null) => (value === null ? "" : value);

/** Baris hasil kosong untuk satu peserta (bila belum ada). */
function prepareResult(t: Tables, tesId: string, siswaId: string, ctx: OperationContext): void {
  const hasilId = `${tesId}:${siswaId}`;
  if (find(t, "Hasil_Samapta", "hasil_id", hasilId)) return;
  rows(t, "Hasil_Samapta").push({ hasil_id: hasilId, tes_id: tesId, siswa_id: siswaId, ...created(ctx) });
}

// ---------------------------------------------------------------- Perintah

export interface SamaptaTestInput {
  tes_id: string;
  nama: string;
  tanggal: string;
  jam_mulai: string;
  tempat: string;
  catatan: string;
}

/** Membuat atau mengubah sesi tes. Tes baru otomatis berisi semua siswa aktif. */
export function saveSamaptaTest(t: Tables, input: SamaptaTestInput, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!canManageSamapta(actor)) throw forbidden();
  if (!DATE.test(input.tanggal)) throw new AppError("Tanggal tes tidak valid.");
  if (!TIME.test(input.jam_mulai)) throw new AppError("Jam mulai tidak valid (JJ:MM).");
  const nama = input.nama.trim() || "Tes Samapta";
  const tempat = input.tempat.trim() || samaptaSettings(t).tempat;
  if (input.tes_id) {
    const { row, index } = testById(t, input.tes_id);
    const after = { ...row, nama, tanggal: input.tanggal, jam_mulai: input.jam_mulai, tempat, catatan: input.catatan, ...updated(ctx) };
    replace(t, "Tes_Samapta", index, after);
    return { entityType: "Tes_Samapta", entityId: input.tes_id, message: "Data tes diperbarui.", before: row, after };
  }
  const peserta = rows(t, "Siswa")
    .map(toStudent)
    .filter((s) => s.aktif && (!s.tanggal_daftar || s.tanggal_daftar <= input.tanggal))
    .sort((a, b) => a.kode_siswa.localeCompare(b.kode_siswa))
    .map((s) => s.siswa_id);
  if (peserta.length === 0) throw new AppError("Belum ada siswa aktif untuk dites.");
  const after = {
    tes_id: ctx.newId("TSM"),
    nama,
    tanggal: input.tanggal,
    jam_mulai: input.jam_mulai,
    tempat,
    status: "BERJALAN",
    peserta_ids: peserta.join(","),
    catatan: input.catatan,
    ...created(ctx),
  };
  rows(t, "Tes_Samapta").push(after);
  // Baris hasil disiapkan sejak awal: isian per pos nanti hanya memperbarui sel, tidak menambah baris, sehingga
  // beberapa HP yang mengisi bersamaan tidak bisa membuat baris ganda.
  for (const siswaId of peserta) prepareResult(t, after.tes_id, siswaId, ctx);
  return { entityType: "Tes_Samapta", entityId: after.tes_id, message: `Tes dibuat dengan ${peserta.length} peserta.`, after };
}

/** Menandai tes selesai (isian dikunci) atau membukanya lagi untuk koreksi. */
export function setSamaptaStatus(t: Tables, input: { tes_id: string; status: SamaptaStatus }, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!canManageSamapta(actor)) throw forbidden();
  const { row, index, test } = testById(t, input.tes_id);
  if (test.status === input.status) return { entityType: "Tes_Samapta", entityId: test.tes_id, message: "Status tes tidak berubah." };
  const after = { ...row, status: input.status, ...updated(ctx) };
  replace(t, "Tes_Samapta", index, after);
  return {
    entityType: "Tes_Samapta",
    entityId: test.tes_id,
    message:
      input.status === "SELESAI"
        ? "Tes ditandai selesai. Isian dikunci; buka lagi bila perlu koreksi."
        : input.status === "DIHAPUS"
          ? "Tes dihapus."
          : input.status === "DIBATALKAN"
          ? "Tes dibatalkan. Tidak dihitung di beranda dan riwayat siswa; isiannya tetap tersimpan."
          : "Tes dibuka lagi untuk diisi.",
    before: row,
    after,
  };
}

/** Menambahkan siswa aktif yang belum ada di daftar peserta (mis. siswa baru). */
export function addSamaptaParticipant(t: Tables, input: { tes_id: string; siswa_id: string }, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!canManageSamapta(actor)) throw forbidden();
  const { row, index, test } = testById(t, input.tes_id);
  const student = find(t, "Siswa", "siswa_id", input.siswa_id);
  if (!student || !toStudent(student.row).aktif) throw notFound("Siswa");
  if (test.peserta_ids.includes(input.siswa_id)) throw new AppError("Siswa sudah menjadi peserta.", "DUPLICATE", 409);
  const after = { ...row, peserta_ids: [...test.peserta_ids, input.siswa_id].join(","), ...updated(ctx) };
  replace(t, "Tes_Samapta", index, after);
  prepareResult(t, test.tes_id, input.siswa_id, ctx);
  return { entityType: "Tes_Samapta", entityId: test.tes_id, message: "Siswa ditambahkan ke peserta.", before: row, after };
}

export type SamaptaPosInput = { tes_id: string; siswa_id: string; pos: Pos | "keterangan" } & Partial<Record<string, string>>;

/**
 * Menyimpan isian SATU pos untuk satu siswa. Kolom pos lain tidak disentuh, jadi beberapa pos
 * bisa diisi bergantian. Isian kosong menghapus nilai yang salah ketik.
 */
export function saveSamaptaPos(t: Tables, input: SamaptaPosInput, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!canManageSamapta(actor)) throw forbidden();
  const { test } = testById(t, input.tes_id);
  if (test.status === "SELESAI") throw new AppError("Tes sudah ditandai selesai. Buka lagi untuk mengubah isian.", "CONFLICT", 409);
  if (test.status === "DIBATALKAN") throw new AppError("Tes ini dibatalkan. Pulihkan dulu bila ingin mengisi.", "CONFLICT", 409);
  if (test.status === "DIHAPUS") throw notFound("Tes samapta");
  if (!test.peserta_ids.includes(input.siswa_id)) throw new AppError("Siswa bukan peserta tes ini.");
  const v = (key: string) => String(input[key] ?? "");
  let patch: Row;
  switch (input.pos) {
    case "tensi":
      patch = {
        tensi_1: tensi(v("tensi_1"), "Tensi I"),
        tensi_2: tensi(v("tensi_2"), "Tensi II"),
        tensi_3: tensi(v("tensi_3"), "Tensi III"),
        riwayat_1: v("riwayat_1").trim().slice(0, 120),
        riwayat_2: v("riwayat_2").trim().slice(0, 120),
        riwayat_3: v("riwayat_3").trim().slice(0, 120),
      };
      break;
    case "badan":
      patch = { tinggi_cm: blank(numberIn(v("tinggi_cm"), "Tinggi badan", 100, 230)), berat_kg: blank(numberIn(v("berat_kg"), "Berat badan", 25, 200)) };
      break;
    case "lari":
    case "pull":
    case "situp":
    case "pushup":
    case "shuttle": {
      const { field, label, range: [min, max], integer } = GARJAS_FIELDS[input.pos];
      const raw = numberIn(v(field), label, min, max, integer);
      const found = find(t, "Siswa", "siswa_id", input.siswa_id);
      const student = found ? toStudent(found.row) : null;
      const usia = ageAt(student?.tanggal_lahir ?? "", test.tanggal);
      const score = garjasScore(input.pos, raw, student?.jenis_kelamin ?? "", usia);
      patch = { [field]: blank(raw), [`${input.pos}_nilai`]: blank(score) };
      break;
    }
    case "renang": {
      const gaya = v("renang_gaya").trim();
      if (gaya && !(GAYA_RENANG as readonly string[]).includes(gaya)) throw new AppError("Pilih gaya renang.");
      patch = { renang_gaya: gaya, renang_waktu: blank(parseDuration(v("renang_waktu"), "Waktu renang")) };
      break;
    }
    case "keterangan":
      patch = { keterangan: v("keterangan").trim().slice(0, 200) };
      break;
    default:
      throw new AppError("Pos tidak dikenal.");
  }
  const hasilId = `${test.tes_id}:${input.siswa_id}`;
  const { before, after } = upsert(t, "Hasil_Samapta", "hasil_id", { hasil_id: hasilId, tes_id: test.tes_id, siswa_id: input.siswa_id, ...patch }, ctx);
  return { entityType: "Hasil_Samapta", entityId: hasilId, message: "Tersimpan.", before, after };
}

export const SAMAPTA_TABLES = ["Pengaturan", "Siswa", "Tes_Samapta", "Hasil_Samapta"] as const;
