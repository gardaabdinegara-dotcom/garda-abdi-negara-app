// Perkembangan Samapta satu siswa: deret hasil akhir dari tes ke tes, tren tiap materi, dan geometri grafik SVG.
// Murni hitungan agar bisa diuji; komponen hanya menggambar angka dari sini (tanpa style inline, CSP).
import type { Klasifikasi, SamaptaResult, SamaptaScore, SamaptaSettings, SamaptaTest } from "./samapta";

/** Satu tes yang diikuti siswa (riwayat diurutkan lama ke baru). */
export interface RiwayatSamapta {
  test: Pick<SamaptaTest, "tes_id" | "nama" | "tanggal" | "status">;
  result: SamaptaResult;
  score: Pick<SamaptaScore, "akhir" | "klas" | "pullLabel">;
}

const bulat = (v: number) => Math.round(v * 100) / 100;

/** Selisih nilai terakhir dengan nilai sebelumnya yang ada (nilai kosong dilewati). Null bila kurang dari dua nilai. */
export function selisihTerakhir(values: readonly (number | null)[]): number | null {
  const ada = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (ada.length < 2) return null;
  return bulat(ada[ada.length - 1]! - ada[ada.length - 2]!);
}

export interface TitikAkhir {
  tes_id: string;
  nama: string;
  tanggal: string;
  akhir: number;
  klas: Klasifikasi | null;
}

/** Hasil akhir per tes; tes yang hasil akhirnya belum lengkap dilewati. */
export function seriAkhir(riwayat: readonly RiwayatSamapta[]): TitikAkhir[] {
  return riwayat
    .filter((r) => r.score.akhir !== null)
    .map((r) => ({ tes_id: r.test.tes_id, nama: r.test.nama, tanggal: r.test.tanggal, akhir: r.score.akhir!, klas: r.score.klas }));
}

export const MATERI_KUNCI = ["lari", "pull", "situp", "pushup", "shuttle"] as const;
export type MateriKunci = (typeof MATERI_KUNCI)[number];

const MENTAH: Record<MateriKunci, keyof SamaptaResult> = {
  lari: "lari_jarak",
  pull: "pull_jumlah",
  situp: "situp_jumlah",
  pushup: "pushup_jumlah",
  shuttle: "shuttle_waktu",
};
const NILAI: Record<MateriKunci, keyof SamaptaResult> = {
  lari: "lari_nilai",
  pull: "pull_nilai",
  situp: "situp_nilai",
  pushup: "pushup_nilai",
  shuttle: "shuttle_nilai",
};
export const SATUAN_MATERI: Record<MateriKunci, string> = { lari: "m", pull: "kali", situp: "kali", pushup: "kali", shuttle: "detik" };

export interface SeriMateri {
  key: MateriKunci;
  label: string;
  /** Nilai per tes (urut riwayat); null bila belum diisi. */
  nilai: (number | null)[];
  /** Nilai dan hasil ukur dari tes terakhir yang punya nilai. */
  terakhir: { nilai: number; mentah: number | null } | null;
  /** Dibanding nilai tes sebelumnya yang ada. */
  delta: number | null;
}

/** Tren lima materi bernilai (lari, pull up/chinning, sit up, push up, shuttle run). */
export function seriMateri(riwayat: readonly RiwayatSamapta[]): SeriMateri[] {
  const pullLabel = riwayat.at(-1)?.score.pullLabel ?? "Pull Up";
  const label: Record<MateriKunci, string> = {
    lari: "Lari 12 menit",
    pull: pullLabel === "Chinning" ? "Chinning" : "Pull up",
    situp: "Sit up",
    pushup: "Push up",
    shuttle: "Shuttle run",
  };
  return MATERI_KUNCI.map((key) => {
    const nilai = riwayat.map((r) => r.result[NILAI[key]] as number | null);
    let terakhir: SeriMateri["terakhir"] = null;
    for (let i = riwayat.length - 1; i >= 0; i--) {
      const v = nilai[i];
      if (v !== null && v !== undefined) {
        terakhir = { nilai: v, mentah: riwayat[i]!.result[MENTAH[key]] as number | null };
        break;
      }
    }
    return { key, label: label[key], nilai, terakhir, delta: selisihTerakhir(nilai) };
  });
}

// ---------------------------------------------------------------- Geometri grafik

export interface UkuranGrafik {
  lebar: number;
  tinggi: number;
  kiri: number;
  kanan: number;
  atas: number;
  bawah: number;
}

/** Ukuran bawaan grafik hasil akhir (viewBox 340 × 198, seperti rancangan). */
export const UKURAN_GRAFIK: UkuranGrafik = { lebar: 340, tinggi: 198, kiri: 34, kanan: 326, atas: 14, bawah: 160 };

export interface GrafikAkhir {
  min: number;
  max: number;
  ticks: { nilai: number; y: number }[];
  titik: (TitikAkhir & { x: number; y: number; label: boolean })[];
  /** Jalur garis "M x y L x y ...". */
  garis: string;
  /** Bidang di bawah garis sampai sumbu bawah. */
  bidang: string;
  baik: number;
  baikSekali: number;
}

/** Skala sumbu: kelipatan 10 yang memuat semua nilai serta batas Baik dan Baik Sekali, dalam rentang 0 sampai 100. */
export function skalaAkhir(values: readonly number[], batas: Pick<SamaptaSettings, "baik" | "baik_sekali">): { min: number; max: number; step: number } {
  const semua = [...values, batas.baik, batas.baik_sekali];
  let min = Math.max(0, Math.floor((Math.min(...semua) - 5) / 10) * 10);
  let max = Math.min(100, Math.ceil((Math.max(...semua) + 5) / 10) * 10);
  if (max - min < 20) {
    if (max + 10 <= 100) max += 10;
    if (max - min < 20) min = Math.max(0, min - 10);
  }
  const step = max - min > 30 ? 20 : 10;
  if ((max - min) % step !== 0) max = Math.min(100, min + Math.ceil((max - min) / step) * step);
  return { min, max, step };
}

export function grafikAkhir(titik: readonly TitikAkhir[], batas: Pick<SamaptaSettings, "baik" | "baik_sekali">, u: UkuranGrafik = UKURAN_GRAFIK): GrafikAkhir {
  const { min, max, step } = skalaAkhir(titik.map((t) => t.akhir), batas);
  const y = (v: number) => bulat(u.bawah - ((v - min) / (max - min || 1)) * (u.bawah - u.atas));
  const awal = u.kiri + 26;
  const akhir = u.kanan - 36;
  const n = titik.length;
  const x = (i: number) => bulat(n <= 1 ? (awal + akhir) / 2 : awal + (i * (akhir - awal)) / (n - 1));
  const tiap = n <= 5 ? 1 : Math.ceil(n / 5);
  const pos = titik.map((t, i) => ({ ...t, x: x(i), y: y(t.akhir), label: i === 0 || i === n - 1 || i % tiap === 0 }));
  const garis = pos.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  const bidang = pos.length ? `${garis} L${pos.at(-1)!.x} ${u.bawah} L${pos[0]!.x} ${u.bawah} Z` : "";
  const ticks: GrafikAkhir["ticks"] = [];
  for (let v = min; v <= max; v += step) ticks.push({ nilai: v, y: y(v) });
  return { min, max, ticks, titik: pos, garis, bidang, baik: y(batas.baik), baikSekali: y(batas.baik_sekali) };
}

/** Titik sparkline "x,y x,y" untuk nilai yang ada; posisi x mengikuti urutan tes sehingga celah tetap terlihat. */
export function titikSparkline(values: readonly (number | null)[], lebar = 64, tinggi = 24, tepi = 4): { points: string; akhir: { x: number; y: number } | null } {
  const ada = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null && Number.isFinite(p.v));
  if (!ada.length) return { points: "", akhir: null };
  const lo = Math.min(...ada.map((p) => p.v));
  const hi = Math.max(...ada.map((p) => p.v));
  const n = values.length;
  const x = (i: number) => bulat(n <= 1 ? lebar / 2 : tepi + (i * (lebar - 2 * tepi)) / (n - 1));
  const y = (v: number) => bulat(hi === lo ? tinggi / 2 : tinggi - tepi - ((v - lo) / (hi - lo)) * (tinggi - 2 * tepi));
  const pts = ada.map((p) => ({ x: x(p.i), y: y(p.v) }));
  return { points: pts.map((p) => `${p.x},${p.y}`).join(" "), akhir: pts.at(-1)! };
}
