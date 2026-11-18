import type { Gender } from "./types";

const AGE_BANDS = [
  [18, 25], [26, 30], [31, 35], [36, 40], [41, 43],
  [44, 46], [47, 49], [50, 52], [53, 55], [56, 58],
] as const;

export const GARJAS_FIELDS = {
  lari: { field: "lari_jarak", label: "Jarak lari", range: [0, 6000], integer: true },
  pull: { field: "pull_jumlah", label: "Jumlah pull up/chinning", range: [0, 200], integer: true },
  situp: { field: "situp_jumlah", label: "Jumlah sit up", range: [0, 200], integer: true },
  pushup: { field: "pushup_jumlah", label: "Jumlah push up", range: [0, 200], integer: true },
  shuttle: { field: "shuttle_waktu", label: "Waktu shuttle run", range: [5, 90], integer: false },
} as const;

export type GarjasPos = keyof typeof GARJAS_FIELDS;

export const isGarjasPos = (value: string): value is GarjasPos => Object.hasOwn(GARJAS_FIELDS, value);

/** Usia dalam tahun penuh pada tanggal tes. */
export function ageAt(birth: string, date: string): number | null {
  const valid = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const day = new Date(value);
    return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value;
  };
  if (!valid(birth) || !valid(date) || birth > date) return null;
  const years = Number(date.slice(0, 4)) - Number(birth.slice(0, 4));
  return years - (date.slice(5) < birth.slice(5) ? 1 : 0);
}

/** Acuan latihan memakai kelompok terdekat untuk umur di luar tabel, atau 18–25 bila usia belum diketahui. */
function bandIndex(usia: number | null): number {
  const i = AGE_BANDS.findIndex(([, max]) => (usia ?? 18) <= max);
  return i === -1 ? AGE_BANDS.length - 1 : i;
}

export function garjasAgeBand(usia: number | null): string {
  const [min, max] = AGE_BANDS[bandIndex(usia)]!;
  return `${min}–${max}`;
}

// TABEL GARJAS LAPANGAN.pptx, Rindam XIV/Hasanuddin. Urutan baris mengikuti tabel
// mulai dari 100 poin di kelompok 18–25. Setiap kelompok umur berikutnya menambah 5 poin.
const steps = (start: number, step: number, length: number) =>
  Array.from({ length }, (_, i) => start + i * step);

const PUTRI_LARI = [
  2630, 2619, 2608, 2597, 2586, 2575, 2564, 2553, 2542, 2531, 2520, 2509,
  2498, 2487, 2476, 2465, 2454, 2443, 2432, 2421, 2410, 2399, 2388, 2377,
  2366, 2355, 2344, 2333, 2322, 2311, 2300, 2289, 2278, 2267, 2256, 2245,
  2234, 2223, 2212, 2201, 2190, 2179, 2168, 2157, 2146, 2135, 2124, 2113,
  2102, 2088, 2074, 2060, 2046, 2033, 2019, 2005, 1992, 1979, 1966, 1953,
  1940, 1927, 1914, 1901, 1888, 1875, 1862, 1849, 1836, 1823, 1810, 1797,
  1783, 1769, 1775, 1741, 1727, 1714, 1701, 1672, 1667, 1642, 1627, 1612,
  1597, 1582, 1567, 1552, 1537, 1522, 1507, 1492, 1477, 1447, 1432, 1417,
  1402, 1387, 1372, 1357, 1342, 1327, 1312, 1297, 1282, 1267, 1252, 1237,
  1222, 1207, 1192, 1177, 1162, 1147, 1132, 1117, 1102, 1087, 1072, 1057,
  1042, 1027, 1012, 997, 982, 967, 952, 937, 922, 907, 892, 877,
  862, 847, 832, 817, 802, 787, 772, 757, 742, 727, 712, 697, 682,
];

// Waktu dalam persepuluh detik. Bagian waktu yang berulang dipertahankan sesuai sumber.
const DISTANCE_AND_TIME = {
  L: {
    lari: steps(3507, -19, 145),
    shuttle: [...steps(159, 1, 141), 291, 291, 291, 291],
  },
  P: {
    lari: PUTRI_LARI,
    shuttle: [
      ...steps(172, 1, 108),
      ...steps(271, 0, 5), ...steps(272, 0, 10), ...steps(273, 0, 10),
      ...steps(274, 0, 10), 275, 275,
    ],
  },
};

// Indeks 0 = satu repetisi. Nilai dasar di bawah 0 menjadi relevan saat
// penambahan poin kelompok umur membuat baris tersebut muncul di tabel.
const REPETITION_SCORES = {
  L: {
    pull: steps(15, 5, 18),
    situp: [
      -27, -25, -23, -21, -19, -17, -15, -13, -11, -9, -7, -5, -2, 1,
      4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34, 37, 40, 43, 46, 49, 52, 55,
      60, 65, 70, 75, 80, 85, 90, 95, 100,
    ],
    pushup: [
      -31, -29, -27, -25, -23, -21, -19, -17, -15, -13, -11, -9, -7, -5, -2, 1,
      4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34, 37, 40, 43, 46, 49, 52, 55,
      60, 65, 70, 75, 80, 85, 90, 95, 100,
    ],
  },
  P: {
    pull: [
      -20, -18, -16, -14, -12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10,
      12, 14, 16, 18, 20, 22, 24, 26, 29, 31, 33, 35, 37, 39, 43, 46,
      49, 51, 53, 55, 57, 58, 60, 62, 63, 65, 67, 68, 70, 72, 73, 75,
      77, 78, 80, 82, 83, 85, 87, 88, 90, 92, 93, 95, 97, 98, 100,
    ],
    situp: [
      -21, -19, -17, -15, -13, -11, -9, -7, -5, -3, -1, 2, 4, 6, 8, 10,
      12, 15, 18, 20, 22, 24, 27, 30, 32, 34, 37, 42, 44, 46, 50, 53, 55,
      60, 65, 70, 75, 80, 85, 90, 95, 100,
    ],
    pushup: [
      -32, -27, -22, -17, -12, -7, -2, 3, 8, 13, 18, 23, 28, 32,
      37, 42, 47, 51, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
    ],
  },
};

const capScore = (value: number) => Math.min(100, Math.max(0, value));

/** Ambang terbaik yang tercapai. Jarak/jumlah lebih besar dan waktu lebih singkat menguntungkan. */
export function garjasScore(pos: GarjasPos, raw: number | null, gender: Gender | "", usia: number | null): number | null {
  const { range: [min, max], integer } = GARJAS_FIELDS[pos];
  if (!gender || raw === null || !Number.isFinite(raw) || raw < min || raw > max || (integer && !Number.isInteger(raw))) return null;
  const adjustment = 5 * bandIndex(usia);

  if (pos === "lari" || pos === "shuttle") {
    const thresholds = DISTANCE_AND_TIME[gender][pos];
    const i = thresholds.findIndex((threshold) => pos === "lari" ? raw >= threshold : raw <= threshold / 10);
    return i === -1 ? 0 : capScore(100 - i + adjustment);
  }

  if (raw === 0) return 0;
  const scores = REPETITION_SCORES[gender][pos];
  const base = scores[Math.min(raw, scores.length) - 1]!;
  return capScore(base + adjustment);
}

/** PDF Ketangkasan Renang Militer 50 m: tabel pria dan wanita identik. */
export function nilaiRenang(gaya: string, detik: number | null, usia: number | null): number | null {
  if (gaya !== "Dada" || detik === null || !Number.isFinite(detik) || detik <= 0) return null;
  return capScore(145 + 3 * bandIndex(usia) - Math.ceil(detik));
}
