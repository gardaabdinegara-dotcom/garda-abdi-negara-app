// Target latihan mingguan dari pelatih: satu target untuk semua siswa aktif (jenis, durasi, berapa kali per minggu).
// Murni hitungan (tanpa akses data) agar bisa diuji. Target tersimpan di Pengaturan sebagai JSON pada kunci
// `latihan_target`; nilai kosong berarti tidak ada target (baris Pengaturan tidak pernah dihapus).
//
// Aturan hitung:
// - Minggu berjalan Senin sampai Minggu menurut tanggal lokal lembaga (tanggal latihan sudah tanggal lokal).
// - "Kali" dihitung per hari: beberapa latihan yang sesuai target di hari yang sama dihitung satu kali,
//   jadi target 3 kali berarti latihan di 3 hari berbeda.
// - Hari beruntun: hari berturut-turut dengan latihan apa pun sampai hari ini. Bila hari ini belum latihan,
//   hitungan dari kemarin tetap berlaku (rangkaian baru putus setelah satu hari penuh terlewat).
import type { OperationContext, OperationOutcome } from "../data/coordinator";
import { AppError, type Tables } from "../data/types";
import { DURASI_LABEL, isDurasi, isJenis, JENIS_INFO, PRESET, type DurasiLatihan, type JenisLatihan } from "./latihan";
import { forbidden, rows } from "./table-ops";
import type { Actor } from "./types";

export const TARGET_KEY = "latihan_target";
export const TARGET_KALI_MIN = 1;
export const TARGET_KALI_MAX = 7;

export interface TargetLatihan {
  /** null = semua jenis. */
  jenis: JenisLatihan | null;
  /** null = durasi apa saja. */
  durasi: DurasiLatihan | null;
  /** Berapa hari latihan per minggu (1 sampai 7). */
  kali: number;
}

/** Membaca JSON target. Kosong, rusak, atau di luar batas: tidak ada target. */
export function parseTarget(value: unknown): TargetLatihan | null {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") return null;
    const kali = Number(raw.kali);
    if (!Number.isInteger(kali) || kali < TARGET_KALI_MIN || kali > TARGET_KALI_MAX) return null;
    const jenis = raw.jenis === null || raw.jenis === undefined || raw.jenis === "" ? null : isJenis(raw.jenis) ? raw.jenis : undefined;
    const durasi = raw.durasi === null || raw.durasi === undefined || raw.durasi === "" ? null : isDurasi(raw.durasi) ? raw.durasi : undefined;
    if (jenis === undefined || durasi === undefined) return null;
    return { jenis, durasi, kali };
  } catch {
    return null;
  }
}

export const tulisTarget = (target: TargetLatihan) => JSON.stringify({ jenis: target.jenis, durasi: target.durasi, kali: target.kali });

/** Target yang berlaku, atau null bila owner belum memasang target. */
export function bacaTarget(t: Tables): TargetLatihan | null {
  return parseTarget((t.Pengaturan ?? []).find((row) => row.key === TARGET_KEY)?.value);
}

const durasiTeks = (d: DurasiLatihan) => (d === "asli" ? "seperti tes asli" : DURASI_LABEL[d]);

/** "Kraepelin Standar", "Pauli seperti tes asli", "Latihan Singkat", "Kraepelin", "Latihan apa saja". */
export function namaTarget(target: Pick<TargetLatihan, "jenis" | "durasi">): string {
  if (target.jenis && target.durasi) return `${JENIS_INFO[target.jenis].nama} ${durasiTeks(target.durasi)}`;
  if (target.jenis) return JENIS_INFO[target.jenis].nama;
  if (target.durasi) return `Latihan ${durasiTeks(target.durasi)}`;
  return "Latihan apa saja";
}

/** Lama satu latihan sesuai target dalam menit (hanya bila jenis dan durasi ditentukan). */
export function menitTarget(target: Pick<TargetLatihan, "jenis" | "durasi">): number | null {
  if (!target.jenis || !target.durasi) return null;
  const p = PRESET[target.jenis][target.durasi];
  return Math.round((p.bagian * p.detik) / 60);
}

export const cocokTarget = (l: { jenis: string; durasi: string }, target: Pick<TargetLatihan, "jenis" | "durasi">) =>
  (!target.jenis || l.jenis === target.jenis) && (!target.durasi || l.durasi === target.durasi);

// ---------------------------------------------------------------- Kalender minggu

export const HARI_PENDEK = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"] as const;

const HARI_MS = 86_400_000;
const msOf = (tanggal: string) => Date.parse(`${tanggal}T00:00:00Z`);
const tanggalValid = (tanggal: string) => /^\d{4}-\d{2}-\d{2}$/.test(tanggal) && Number.isFinite(msOf(tanggal));

export function geserTanggal(tanggal: string, hari: number): string {
  return new Date(msOf(tanggal) + hari * HARI_MS).toISOString().slice(0, 10);
}

/** Urutan hari dalam minggu: Senin 0 sampai Minggu 6. */
export const urutHari = (tanggal: string) => (new Date(msOf(tanggal)).getUTCDay() + 6) % 7;

/** Tujuh tanggal minggu berjalan (Senin sampai Minggu) yang memuat hari ini. */
export function tanggalMinggu(hariIni: string): string[] {
  const senin = geserTanggal(hariIni, -urutHari(hariIni));
  return Array.from({ length: 7 }, (_, i) => geserTanggal(senin, i));
}

// ---------------------------------------------------------------- Progres satu siswa

export type StatusHari = "target" | "lain" | "kosong";

export interface HariTarget {
  tanggal: string;
  label: (typeof HARI_PENDEK)[number];
  status: StatusHari;
  hariIni: boolean;
  /** Hari setelah hari ini (belum dijalani). */
  nanti: boolean;
}

export interface ProgresTarget {
  target: TargetLatihan;
  dari: string;
  sampai: string;
  /** Hari berbeda minggu ini dengan latihan yang sesuai target. */
  selesai: number;
  terpenuhi: boolean;
  /** Hari latihan sesuai target yang masih kurang (0 bila terpenuhi). */
  kurang: number;
  /** Hari tersisa setelah hari ini sampai Minggu. */
  sisaHari: number;
  hari: HariTarget[];
  /** Latihan minggu ini yang tidak sesuai target, beserta jenisnya (urut seperti JENIS_LATIHAN dipakai pertama). */
  latihanLain: number;
  jenisLain: JenisLatihan[];
}

type LatihanRingkas = { jenis: JenisLatihan; durasi: DurasiLatihan; tanggal: string };

export function progresTarget(target: TargetLatihan, riwayat: readonly LatihanRingkas[], hariIni: string): ProgresTarget {
  const minggu = tanggalMinggu(hariIni);
  const dari = minggu[0]!;
  const sampai = minggu[6]!;
  const sesuai = new Set<string>();
  const ada = new Set<string>();
  let latihanLain = 0;
  const jenisLain: JenisLatihan[] = [];
  for (const l of riwayat) {
    if (l.tanggal < dari || l.tanggal > sampai || l.tanggal > hariIni) continue;
    ada.add(l.tanggal);
    if (cocokTarget(l, target)) sesuai.add(l.tanggal);
    else {
      latihanLain++;
      if (!jenisLain.includes(l.jenis)) jenisLain.push(l.jenis);
    }
  }
  const selesai = sesuai.size;
  const hari = minggu.map((tanggal, i) => ({
    tanggal,
    label: HARI_PENDEK[i]!,
    status: (sesuai.has(tanggal) ? "target" : ada.has(tanggal) ? "lain" : "kosong") as StatusHari,
    hariIni: tanggal === hariIni,
    nanti: tanggal > hariIni,
  }));
  return {
    target,
    dari,
    sampai,
    selesai,
    terpenuhi: selesai >= target.kali,
    kurang: Math.max(0, target.kali - selesai),
    sisaHari: 6 - urutHari(hariIni),
    hari,
    latihanLain,
    jenisLain,
  };
}

/** Hari berturut-turut dengan latihan apa pun sampai hari ini (atau sampai kemarin bila hari ini belum latihan). */
export function hariBeruntun(tanggal: Iterable<string>, hariIni: string): number {
  const ada = new Set([...tanggal].filter((d) => tanggalValid(d) && d <= hariIni));
  let hari = ada.has(hariIni) ? hariIni : geserTanggal(hariIni, -1);
  let n = 0;
  while (ada.has(hari)) {
    n++;
    hari = geserTanggal(hari, -1);
  }
  return n;
}

/** Rangkaian hari beruntun terpanjang sepanjang riwayat (tanggal setelah hari ini diabaikan). */
export function rekorBeruntun(tanggal: Iterable<string>, hariIni?: string): number {
  const urut = [...new Set([...tanggal].filter((d) => tanggalValid(d) && (!hariIni || d <= hariIni)))].sort();
  let terbaik = 0;
  let jalan = 0;
  let sebelum = "";
  for (const d of urut) {
    jalan = sebelum && geserTanggal(sebelum, 1) === d ? jalan + 1 : 1;
    terbaik = Math.max(terbaik, jalan);
    sebelum = d;
  }
  return terbaik;
}

// ---------------------------------------------------------------- Ringkasan kelompok (owner)

export interface RingkasTargetKelompok {
  target: TargetLatihan;
  dari: string;
  sampai: string;
  sisaHari: number;
  /** Siswa aktif yang sudah memenuhi target minggu ini. */
  memenuhi: number;
  total: number;
  /** Progres per siswa aktif, kunci siswa_id. */
  perSiswa: Record<string, ProgresTarget>;
}

export function ringkasTargetKelompok(
  target: TargetLatihan,
  siswaIds: readonly string[],
  bySiswa: ReadonlyMap<string, readonly LatihanRingkas[]>,
  hariIni: string,
): RingkasTargetKelompok {
  const perSiswa: Record<string, ProgresTarget> = {};
  for (const id of siswaIds) perSiswa[id] = progresTarget(target, bySiswa.get(id) ?? [], hariIni);
  const minggu = tanggalMinggu(hariIni);
  return {
    target,
    dari: minggu[0]!,
    sampai: minggu[6]!,
    sisaHari: 6 - urutHari(hariIni),
    memenuhi: Object.values(perSiswa).filter((p) => p.terpenuhi).length,
    total: siswaIds.length,
    perSiswa,
  };
}

// ---------------------------------------------------------------- Menyimpan target

export interface TargetInput {
  jenis: string;
  durasi: string;
  kali: string | number;
  /** true = hapus target (siswa tidak lagi melihat target). */
  hapus?: boolean;
}

/** Isian form → target. "semua" berarti tidak dibatasi. */
export function bacaIsianTarget(input: TargetInput): TargetLatihan {
  const jenis = input.jenis === "semua" || input.jenis === "" ? null : isJenis(input.jenis) ? input.jenis : undefined;
  if (jenis === undefined) throw new AppError("Pilih jenis latihan.");
  const durasi = input.durasi === "semua" || input.durasi === "" ? null : isDurasi(input.durasi) ? input.durasi : undefined;
  if (durasi === undefined) throw new AppError("Pilih durasi latihan.");
  const kali = Number(input.kali);
  if (!Number.isInteger(kali) || kali < TARGET_KALI_MIN || kali > TARGET_KALI_MAX) throw new AppError(`Berapa kali per minggu harus ${TARGET_KALI_MIN} sampai ${TARGET_KALI_MAX}.`);
  return { jenis, durasi, kali };
}

export const canSetTargetLatihan = (actor: Actor) => actor.user.peran === "OWNER" || actor.user.peran === "ADMIN";

/** Memasang, mengubah, atau menghapus target (hapus = nilai dikosongkan; baris Pengaturan tetap ada). */
export function simpanTargetLatihan(t: Tables, input: TargetInput, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!canSetTargetLatihan(actor)) throw forbidden("Hanya owner atau admin yang dapat mengatur target latihan.");
  const value = input.hapus ? "" : tulisTarget(bacaIsianTarget(input));
  const list = rows(t, "Pengaturan");
  const index = list.findIndex((row) => row.key === TARGET_KEY);
  const before = index >= 0 ? list[index]! : null;
  const after = { key: TARGET_KEY, value, updated_at: ctx.now, updated_by: ctx.actorId };
  if (index >= 0) list[index] = after;
  else list.push(after);
  return {
    entityType: "Pengaturan",
    entityId: TARGET_KEY,
    message: input.hapus ? "Target latihan dihapus." : "Target latihan disimpan. Siswa melihatnya di menu Latihan.",
    before,
    after,
  };
}
