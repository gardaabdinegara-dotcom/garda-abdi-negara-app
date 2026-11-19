export interface RentangTanggal {
  dari: string;
  sampai: string;
}

export interface PerbandinganSiswa {
  sebelumnya: RentangTanggal;
  median: number | null;
  siswa: number;
  naik: number;
  tetap: number;
  turun: number;
}

export function median(values: Iterable<number>): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const tengah = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[tengah]! : (sorted[tengah - 1]! + sorted[tengah]!) / 2;
}

/** Setiap nilai adalah selisih dari satu siswa yang memiliki data di kedua periode. */
export function ringkasPerubahanSiswa(sebelumnya: RentangTanggal, selisih: readonly number[]): PerbandinganSiswa {
  const naik = selisih.filter((nilai) => nilai > 0).length;
  const turun = selisih.filter((nilai) => nilai < 0).length;
  return {
    sebelumnya,
    median: median(selisih),
    siswa: selisih.length,
    naik,
    turun,
    tetap: selisih.length - naik - turun,
  };
}
