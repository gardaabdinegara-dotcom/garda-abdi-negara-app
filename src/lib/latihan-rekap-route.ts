import { isDurasi, isJenis } from "./core/latihan";
import { FILTER_REKAP_AWAL, PERIODE_REKAP, type FilterRekapLatihan, type TandaRekap } from "./core/latihan-rekap";

export interface PilihanRekap extends FilterRekapLatihan {
  grafik: "aktivitas" | "skor";
  tanda: TandaRekap | "perlu";
  siswa: string | null;
}

export function bacaPilihanRekap(query: Record<string, string | string[] | undefined>): PilihanRekap {
  return {
    periode: PERIODE_REKAP.find((hari) => String(hari) === query.periode) ?? FILTER_REKAP_AWAL.periode,
    jenis: typeof query.jenis === "string" && isJenis(query.jenis) ? query.jenis : null,
    durasi: typeof query.durasi === "string" && isDurasi(query.durasi) ? query.durasi : null,
    grafik: query.grafik === "skor" ? "skor" : "aktivitas",
    tanda: query.tanda === "turun" || query.tanda === "lama" || query.tanda === "belum" || query.tanda === "perlu" ? query.tanda : null,
    siswa: typeof query.siswa === "string" && query.siswa ? query.siswa : null,
  };
}

export function rekapHref(pilihan: PilihanRekap, perubahan: Partial<PilihanRekap>, bagian?: "grafik-latihan" | "daftar-latihan"): string {
  const { periode, jenis, durasi, grafik, tanda, siswa } = { ...pilihan, ...perubahan };
  const query = new URLSearchParams();
  if (periode !== FILTER_REKAP_AWAL.periode) query.set("periode", String(periode));
  if (jenis) query.set("jenis", jenis);
  if (durasi) query.set("durasi", durasi);
  if (grafik === "skor") query.set("grafik", grafik);
  if (tanda) query.set("tanda", tanda);
  if (siswa) query.set("siswa", siswa);
  return `/latihan${query.size ? `?${query}` : ""}${bagian ? `#${bagian}` : ""}`;
}
