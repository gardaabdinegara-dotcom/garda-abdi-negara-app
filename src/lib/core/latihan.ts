// Latihan psikotes: jenis, durasi, dan penilaian. Murni hitungan (tanpa akses data), jadi dipakai bersama oleh
// layar latihan di HP dan oleh server saat menyimpan (server selalu menghitung ulang dari data per kolom).
// Rumus dan tabel kategori Kraepelin/Pauli mengikuti prototipe owner (PROTOTIPE-KRAEPELIN.html, Prototype Tes Pauli.html).

export const JENIS_LATIHAN = ["kraepelin", "pauli", "angka", "simbol"] as const;
export type JenisLatihan = (typeof JENIS_LATIHAN)[number];

export const DURASI_LATIHAN = ["singkat", "standar", "asli"] as const;
export type DurasiLatihan = (typeof DURASI_LATIHAN)[number];
export const DURASI_LABEL: Record<DurasiLatihan, string> = { singkat: "Singkat", standar: "Standar", asli: "Seperti tes asli" };

export interface JenisInfo {
  nama: string;
  /** Satuan bagian waktu: Kraepelin & kecermatan berganti kolom, Pauli memakai interval "garis". */
  bagian: "kolom" | "interval";
  ket: string;
  /** Jawaban per menit yang dianggap 100% untuk skor kecepatan. */
  kecepatanPenuh: number;
}

export const JENIS_INFO: Record<JenisLatihan, JenisInfo> = {
  kraepelin: { nama: "Kraepelin", bagian: "kolom", kecepatanPenuh: 65.33, ket: "Jumlahkan dua angka dari bawah ke atas, tulis angka terakhirnya. Pindah kolom saat aba-aba." },
  pauli: { nama: "Pauli", bagian: "interval", kecepatanPenuh: 65.33, ket: "Jumlahkan dua angka dari atas ke bawah tanpa henti. Garis ditarik setiap interval." },
  angka: { nama: "Angka hilang", bagian: "kolom", kecepatanPenuh: 50, ket: "Lima angka kunci A–E. Soal menampilkan empat; pilih huruf angka yang hilang." },
  simbol: { nama: "Simbol hilang", bagian: "kolom", kecepatanPenuh: 50, ket: "Sama seperti angka hilang, memakai simbol." },
};

/** Jumlah bagian (kolom/interval) dan detik per bagian untuk setiap jenis dan durasi. */
export const PRESET: Record<JenisLatihan, Record<DurasiLatihan, { bagian: number; detik: number }>> = {
  kraepelin: { singkat: { bagian: 20, detik: 15 }, standar: { bagian: 20, detik: 30 }, asli: { bagian: 45, detik: 30 } },
  pauli: { singkat: { bagian: 6, detik: 30 }, standar: { bagian: 10, detik: 30 }, asli: { bagian: 20, detik: 180 } },
  angka: { singkat: { bagian: 3, detik: 60 }, standar: { bagian: 5, detik: 60 }, asli: { bagian: 10, detik: 60 } },
  simbol: { singkat: { bagian: 3, detik: 60 }, standar: { bagian: 5, detik: 60 }, asli: { bagian: 10, detik: 60 } },
};

/** Simbol untuk "simbol hilang": karakter Unicode (seperti Insert Symbol di Word), tampil sama di semua HP. */
export const SIMBOL = ["★", "◆", "♣", "▲", "●", "♥", "■", "✿", "☀", "♠", "✚", "◐", "☂", "♪", "✈", "☎", "✉", "⚑"] as const;

export const isJenis = (v: unknown): v is JenisLatihan => (JENIS_LATIHAN as readonly string[]).includes(String(v));
export const isDurasi = (v: unknown): v is DurasiLatihan => (DURASI_LATIHAN as readonly string[]).includes(String(v));

// ---------------------------------------------------------------- Kategori (Kraepelin & Pauli)

export interface Kategori {
  nama: string;
  tone: "ok" | "warn" | "bad";
  saran: string;
}
type Tabel = { batas: number; nama: string; tone: Kategori["tone"]; saran: string }[];

/** Batas "sampai dengan" (≤) kecuali ketelitian yang memakai "kurang dari" (<), sama seperti prototipe. */
const KECEPATAN: Tabel = [
  { batas: 13.07, nama: "Rendah", tone: "bad", saran: "Latih penjumlahan sederhana lebih sering agar hitungan terasa lebih cepat." },
  { batas: 26.13, nama: "Cukup rendah", tone: "warn", saran: "Kecepatan mulai terbentuk. Terus berlatih agar soal yang selesai makin banyak." },
  { batas: 39.2, nama: "Sedang", tone: "ok", saran: "Sudah cukup baik. Kurangi waktu berhenti atau ragu saat menghitung." },
  { batas: 52.27, nama: "Cukup tinggi", tone: "ok", saran: "Sudah baik. Jaga ritme agar perpindahan antarsoal tetap lancar." },
  { batas: Infinity, nama: "Tinggi", tone: "ok", saran: "Sangat baik. Jaga laju tinggi ini tanpa mengorbankan ketelitian." },
];
const KETELITIAN: Tabel = [
  { batas: 93.9, nama: "Rendah", tone: "bad", saran: "Kesalahan masih sering. Sedikit perlambat dan pastikan hitungan sebelum menjawab." },
  { batas: 95.25, nama: "Cukup rendah", tone: "warn", saran: "Fokuskan latihan pada mengurangi kesalahan hitung yang berulang." },
  { batas: 97.95, nama: "Sedang", tone: "ok", saran: "Cukup baik. Jaga fokus agar kesalahan kecil makin berkurang." },
  { batas: 99.3, nama: "Cukup tinggi", tone: "ok", saran: "Sudah baik. Pertahankan cara menghitung sambil menjaga ritme." },
  { batas: Infinity, nama: "Tinggi", tone: "ok", saran: "Sangat baik. Pertahankan tingkat kesalahan yang sangat rendah." },
];
const STABILITAS: Tabel = [
  { batas: 5, nama: "Tinggi", tone: "ok", saran: "Pengerjaan sangat stabil. Pertahankan konsistensi ini." },
  { batas: 7.5, nama: "Cukup tinggi", tone: "ok", saran: "Sudah stabil. Hindari perubahan kecepatan yang terlalu besar." },
  { batas: 12.5, nama: "Sedang", tone: "ok", saran: "Cukup stabil. Latih ritme yang sama dari awal hingga akhir." },
  { batas: 15, nama: "Cukup rendah", tone: "warn", saran: "Masih naik-turun. Jaga tempo agar tidak terlalu cepat atau lambat di beberapa bagian." },
  { batas: Infinity, nama: "Rendah", tone: "bad", saran: "Sering naik-turun. Latih ritme agar jumlah soal tiap bagian lebih konsisten." },
];
const PERFORMA: Tabel = [
  { batas: -20, nama: "Turun drastis", tone: "bad", saran: "Jumlah soal menurun tajam. Latih daya tahan, terutama menjelang akhir." },
  { batas: -5, nama: "Cenderung turun", tone: "warn", saran: "Perlahan berkurang. Jangan terlalu cepat di awal lalu melambat." },
  { batas: 5, nama: "Mendatar", tone: "ok", saran: "Ritme terjaga. Coba tingkatkan kecepatan secara bertahap." },
  { batas: 20, nama: "Cenderung naik", tone: "ok", saran: "Makin meningkat. Coba capai ritme terbaik lebih awal." },
  { batas: Infinity, nama: "Naik drastis", tone: "ok", saran: "Meningkat tajam. Usahakan ritme cepat sejak awal tes." },
];
const pilih = (tabel: Tabel, nilai: number, kurangDari = false): Kategori => {
  const row = tabel.find((r) => (kurangDari ? nilai < r.batas : nilai <= r.batas)) ?? tabel.at(-1)!;
  return { nama: row.nama, tone: row.tone, saran: row.saran };
};

// ---------------------------------------------------------------- Penilaian

/** Hasil satu bagian (kolom/interval): jumlah benar dan jumlah dijawab. */
export interface Bagian {
  benar: number;
  jawab: number;
}

export interface HasilLatihan {
  dijawab: number;
  benar: number;
  salah: number;
  /** Jawaban per menit. */
  kecepatan: number;
  /** Persentase benar dari yang dijawab. */
  ketelitian: number;
  /** Deviation rate (%): rata-rata simpangan jumlah benar per bagian terhadap rata-ratanya. Makin kecil makin stabil. */
  stabilitas: number;
  /** Tren kurva kerja (%), dari kemiringan regresi linear. */
  performa: number;
  skorAspek: { ketelitian: number; kecepatan: number; stabilitas: number; performa: number };
  /** Skor gabungan 0–100: ketelitian 35%, kecepatan 30%, stabilitas 20%, performa 15%. */
  skor: number;
  /** Kategori resmi (hanya Kraepelin & Pauli; kecermatan belum punya tabel norma). */
  kategori: { kecepatan: Kategori; ketelitian: Kategori; stabilitas: Kategori; performa: Kategori } | null;
  /** Jumlah benar per bagian (kurva kerja). */
  kurva: number[];
}

const bulat = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const jepit = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function hitungHasil(jenis: JenisLatihan, seri: readonly Bagian[], detik: number): HasilLatihan {
  const kurva = seri.map((s) => s.benar);
  const dijawab = seri.reduce((a, s) => a + s.jawab, 0);
  const benar = kurva.reduce((a, b) => a + b, 0);
  const n = kurva.length;
  const rata = n ? benar / n : 0;
  const simpang = n ? kurva.reduce((a, v) => a + Math.abs(v - rata), 0) / n : 0;
  const mx = (n - 1) / 2;
  const penyebut = kurva.reduce((a, _, i) => a + (i - mx) ** 2, 0);
  const miring = n > 1 && penyebut ? kurva.reduce((a, v, i) => a + (i - mx) * (v - rata), 0) / penyebut : 0;
  const menit = Math.max(detik, 1) / 60;
  const kecepatan = dijawab / menit;
  const ketelitian = dijawab ? (benar / dijawab) * 100 : 0;
  const stabilitas = rata ? (simpang / rata) * 100 : 0;
  const performa = rata ? ((miring * Math.max(0, n - 1)) / rata) * 100 : 0;
  // Tanpa satu pun jawaban benar, stabilitas dan performa tidak bermakna (bukan "stabil"), jadi skornya 0.
  const kosong = benar === 0;
  const skorAspek = {
    ketelitian: jepit(ketelitian, 0, 100),
    kecepatan: jepit((kecepatan / JENIS_INFO[jenis].kecepatanPenuh) * 100, 0, 100),
    stabilitas: kosong ? 0 : jepit(100 - stabilitas, 0, 100),
    performa: kosong ? 0 : jepit(85 + performa * 0.6, 25, 100),
  };
  const skor = kosong ? 0 : Math.round(0.35 * skorAspek.ketelitian + 0.3 * skorAspek.kecepatan + 0.2 * skorAspek.stabilitas + 0.15 * skorAspek.performa);
  const resmi = jenis === "kraepelin" || jenis === "pauli";
  // Kategori dihitung dari nilai yang sudah dibulatkan, sama dengan angka yang tampil.
  const nilai = { kecepatan: bulat(kecepatan), ketelitian: bulat(ketelitian), stabilitas: kosong ? 100 : bulat(stabilitas), performa: bulat(performa) };
  return {
    dijawab,
    benar,
    salah: dijawab - benar,
    ...nilai,
    skorAspek: { ketelitian: bulat(skorAspek.ketelitian, 1), kecepatan: bulat(skorAspek.kecepatan, 1), stabilitas: bulat(skorAspek.stabilitas, 1), performa: bulat(skorAspek.performa, 1) },
    skor,
    kategori: resmi
      ? {
          kecepatan: pilih(KECEPATAN, nilai.kecepatan),
          ketelitian: pilih(KETELITIAN, nilai.ketelitian, true),
          stabilitas: pilih(STABILITAS, nilai.stabilitas),
          performa: pilih(PERFORMA, nilai.performa),
        }
      : null,
    kurva,
  };
}

/** Kunci jawaban Kraepelin/Pauli: angka terakhir dari jumlah dua angka. */
export const jawabanPenjumlahan = (a: number, b: number) => (a + b) % 10;
