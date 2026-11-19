// Jalannya latihan psikotes di HP: deret angka Kraepelin/Pauli, kunci dan soal kecermatan (angka/simbol hilang),
// perpindahan kolom/interval menurut waktu, dan ringkasan yang dikirim ke server.
// Murni (tanpa DOM dan tanpa jam): waktu dan sumber acak selalu diberikan dari luar, jadi semuanya bisa diuji.
import { JENIS_INFO, PRESET, SIMBOL, isDurasi, isJenis, jawabanPenjumlahan, type Bagian, type DurasiLatihan, type JenisLatihan } from "./latihan";
import { UJI_SISWA_FIELD } from "./uji-siswa";

/** Sumber acak 0 ≤ x < 1 (Math.random di HP, PRNG berbenih di tes). */
export type Acak = () => number;

/** PRNG berbenih (mulberry32): benih yang sama selalu memberi urutan yang sama. */
export function acakBerbenih(benih: number): Acak {
  let a = benih >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ambil = (acak: Acak, n: number) => Math.min(n - 1, Math.max(0, Math.floor(acak() * n)));

/** Mengacak urutan (Fisher-Yates) tanpa mengubah larik asal. */
export function acakUrutan<T>(items: readonly T[], acak: Acak): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = ambil(acak, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const samaUrutan = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// ---------------------------------------------------------------- Deret angka (Kraepelin & Pauli)

/** Angka 1 sampai 9, seperti lembar Kraepelin/Pauli kertas. */
export const angkaDeret = (acak: Acak) => 1 + ambil(acak, 9);

/** Banyak angka yang sudah tersedia di depan pasangan aktif (dibuat terus, jadi deret tidak pernah habis). */
export const DEPAN = 3;
/** Pasangan yang sudah dikerjakan dan angka berikutnya yang tampil di sekitar pasangan aktif. */
export const TAMPIL_LALU = 2;
export const TAMPIL_DEPAN = 2;

export interface Deret {
  /** Angka urut pengerjaan: Kraepelin dari bawah, Pauli dari atas. */
  angka: number[];
  /** Jawaban yang sudah diketuk; jawaban ke-i untuk pasangan angka[i] dan angka[i + 1]. */
  jawab: number[];
}

export function deretBaru(acak: Acak): Deret {
  return { angka: Array.from({ length: 2 + DEPAN }, () => angkaDeret(acak)), jawab: [] };
}

/** Kunci pasangan yang sedang dikerjakan: angka terakhir dari jumlah dua angka. */
export function kunciDeret(d: Deret): number {
  const i = d.jawab.length;
  return jawabanPenjumlahan(d.angka[i]!, d.angka[i + 1]!);
}

export function jawabDeret(d: Deret, nilai: number, acak: Acak): { deret: Deret; benar: boolean } {
  const benar = nilai === kunciDeret(d);
  const jawab = [...d.jawab, nilai];
  const angka = [...d.angka];
  while (angka.length < jawab.length + 2 + DEPAN) angka.push(angkaDeret(acak));
  return { deret: { angka, jawab }, benar };
}

/**
 * Satu baris tampilan kolom. Baris "angka" dan "sela" selalu berselang-seling, dan jumlah barisnya tetap,
 * jadi tampilan tidak bergeser saat siswa menjawab. "sela" adalah tempat jawaban di antara dua angka.
 */
export type BarisDeret =
  | { tipe: "angka"; nilai: number | null; posisi: "lalu" | "aktif" | "depan"; dekat: boolean }
  | { tipe: "sela"; isi: "jawab"; nilai: number; garis: boolean }
  | { tipe: "sela"; isi: "slot" | "kosong" };

/**
 * Jendela kolom di sekitar pasangan aktif, urut dari atas ke bawah layar.
 * Pauli ("turun") dikerjakan dari atas, Kraepelin ("naik") dari bawah sehingga urutannya dibalik.
 * `garis` berisi posisi garis Pauli: jumlah jawaban saat interval berakhir (garis di bawah jawaban terakhir).
 */
export function jendelaDeret(d: Deret, arah: "naik" | "turun", garis: readonly number[] = []): BarisDeret[] {
  const j = d.jawab.length;
  const rows: BarisDeret[] = [];
  for (let k = j - TAMPIL_LALU; k < j; k++) {
    rows.push({ tipe: "angka", nilai: k >= 0 ? d.angka[k]! : null, posisi: "lalu", dekat: k === j - 1 });
    if (k >= 0) rows.push({ tipe: "sela", isi: "jawab", nilai: d.jawab[k]!, garis: garis.includes(k + 1) });
    else rows.push({ tipe: "sela", isi: "kosong" });
  }
  rows.push({ tipe: "angka", nilai: d.angka[j]!, posisi: "aktif", dekat: true });
  rows.push({ tipe: "sela", isi: "slot" });
  rows.push({ tipe: "angka", nilai: d.angka[j + 1]!, posisi: "aktif", dekat: true });
  for (let k = j + 2; k < j + 2 + TAMPIL_DEPAN; k++) {
    rows.push({ tipe: "sela", isi: "kosong" });
    rows.push({ tipe: "angka", nilai: d.angka[k] ?? null, posisi: "depan", dekat: k === j + 2 });
  }
  return arah === "naik" ? rows.reverse() : rows;
}

// ---------------------------------------------------------------- Kecermatan (angka hilang & simbol hilang)

export const HURUF = ["A", "B", "C", "D", "E"] as const;
const POOL_ANGKA = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export type JenisCermat = "angka" | "simbol";
export const isCermat = (jenis: JenisLatihan): jenis is JenisCermat => jenis === "angka" || jenis === "simbol";

/** Lima butir kunci berbeda (A sampai E). Kunci kolom baru selalu berbeda dari kunci sebelumnya. */
export function kunciBaru(jenis: JenisCermat, acak: Acak, sebelumnya?: readonly string[]): string[] {
  const pool: readonly string[] = jenis === "angka" ? POOL_ANGKA : SIMBOL;
  let kunci = acakUrutan(pool, acak).slice(0, 5);
  for (let coba = 0; sebelumnya && samaUrutan(kunci, sebelumnya) && coba < 20; coba++) kunci = acakUrutan(pool, acak).slice(0, 5);
  return kunci;
}

export interface SoalCermat {
  /** Empat butir kunci dalam urutan acak. */
  tampil: string[];
  /** Indeks butir kunci yang hilang (0 = A sampai 4 = E). */
  hilang: number;
}

/** Soal baru: empat dari lima butir kunci, diacak. Tampilannya selalu berbeda dari soal sebelumnya. */
export function soalBaru(kunci: readonly string[], acak: Acak, sebelumnya?: SoalCermat | null): SoalCermat {
  const buat = (): SoalCermat => {
    const hilang = ambil(acak, kunci.length);
    return { hilang, tampil: acakUrutan(kunci.filter((_, i) => i !== hilang), acak) };
  };
  let soal = buat();
  for (let coba = 0; sebelumnya && samaUrutan(soal.tampil, sebelumnya.tampil) && coba < 20; coba++) soal = buat();
  return soal;
}

// ---------------------------------------------------------------- Sesi: jalannya satu latihan

export interface Sesi {
  jenis: JenisLatihan;
  durasi: DurasiLatihan;
  /** Banyak bagian (kolom/interval) dan lama tiap bagian, dari PRESET. */
  bagianTotal: number;
  detikBagian: number;
  /** Indeks bagian yang sedang berjalan (0 = pertama). */
  bagian: number;
  /** Benar dan dijawab per bagian; panjangnya = bagian + 1 (bagian berjalan ikut). */
  seri: Bagian[];
  /** Kraepelin & Pauli. Kraepelin mendapat deret baru setiap kolom; Pauli satu deret panjang. */
  deret: Deret | null;
  /** Pauli: posisi garis (jumlah jawaban saat interval berakhir). */
  garis: number[];
  /** Kecermatan: kunci kolom ini dan soal yang tampil. */
  kunci: string[] | null;
  soal: SoalCermat | null;
  /** Nomor soal di kolom ini (kecermatan). */
  nomor: number;
  dijawab: number;
  selesai: boolean;
}

export const totalMs = (s: Pick<Sesi, "bagianTotal" | "detikBagian">) => s.bagianTotal * s.detikBagian * 1000;

function isiBagian(s: Sesi, acak: Acak): Pick<Sesi, "deret" | "kunci" | "soal" | "nomor"> {
  if (isCermat(s.jenis)) {
    const kunci = kunciBaru(s.jenis, acak, s.kunci ?? undefined);
    return { deret: null, kunci, soal: soalBaru(kunci, acak), nomor: 1 };
  }
  return { deret: s.jenis === "pauli" && s.deret ? s.deret : deretBaru(acak), kunci: null, soal: null, nomor: 0 };
}

export function sesiBaru(jenis: JenisLatihan, durasi: DurasiLatihan, acak: Acak): Sesi {
  const preset = PRESET[jenis][durasi];
  const dasar: Sesi = {
    jenis,
    durasi,
    bagianTotal: preset.bagian,
    detikBagian: preset.detik,
    bagian: 0,
    seri: [{ benar: 0, jawab: 0 }],
    deret: null,
    garis: [],
    kunci: null,
    soal: null,
    nomor: 0,
    dijawab: 0,
    selesai: false,
  };
  return { ...dasar, ...isiBagian(dasar, acak) };
}

/**
 * Menyesuaikan sesi dengan waktu yang sudah berjalan. Waktu dihitung dari jam (bukan hitungan detak),
 * jadi bila layar sempat tersembunyi, bagian yang terlewat tercatat kosong dan latihan tetap berakhir tepat waktu.
 * `pindah` benar bila bagian berganti (untuk aba-aba "Pindah"/"Garis").
 */
export function majuWaktu(s: Sesi, lewatMs: number, acak: Acak): { sesi: Sesi; pindah: boolean } {
  if (s.selesai) return { sesi: s, pindah: false };
  const habis = lewatMs >= totalMs(s);
  const target = habis ? s.bagianTotal - 1 : Math.min(s.bagianTotal - 1, Math.floor(Math.max(0, lewatMs) / (s.detikBagian * 1000)));
  if (target <= s.bagian && !habis) return { sesi: s, pindah: false };
  let next: Sesi = s;
  if (target > s.bagian) {
    const seri = [...s.seri];
    while (seri.length < target + 1) seri.push({ benar: 0, jawab: 0 });
    const garis = s.jenis === "pauli" && s.deret && !s.garis.includes(s.deret.jawab.length) ? [...s.garis, s.deret.jawab.length] : s.garis;
    next = { ...s, bagian: target, seri, garis };
    next = { ...next, ...isiBagian(next, acak) };
  }
  if (habis) {
    const seri = [...next.seri];
    while (seri.length < s.bagianTotal) seri.push({ benar: 0, jawab: 0 });
    return { sesi: { ...next, seri, selesai: true }, pindah: false };
  }
  return { sesi: next, pindah: true };
}

/** Mencatat satu jawaban. `nilai`: angka 0 sampai 9 (Kraepelin/Pauli) atau indeks huruf 0 sampai 4 (kecermatan). */
export function jawabSesi(s: Sesi, nilai: number, acak: Acak): Sesi {
  if (s.selesai || !Number.isInteger(nilai)) return s;
  let benar: boolean;
  let ubah: Partial<Sesi>;
  if (s.deret) {
    if (nilai < 0 || nilai > 9) return s;
    const r = jawabDeret(s.deret, nilai, acak);
    benar = r.benar;
    ubah = { deret: r.deret };
  } else if (s.kunci && s.soal) {
    if (nilai < 0 || nilai > 4) return s;
    benar = nilai === s.soal.hilang;
    ubah = { soal: soalBaru(s.kunci, acak, s.soal), nomor: s.nomor + 1 };
  } else {
    return s;
  }
  const seri = s.seri.map((b, i) => (i === s.bagian ? { benar: b.benar + (benar ? 1 : 0), jawab: b.jawab + 1 } : b));
  return { ...s, ...ubah, seri, dijawab: s.dijawab + 1 };
}

/** Sisa waktu bagian berjalan dan sisa waktu total (ms, tidak negatif). */
export function sisaWaktu(s: Sesi, lewatMs: number): { bagianMs: number; totalMs: number } {
  const total = totalMs(s);
  const akhirBagian = Math.min(total, (s.bagian + 1) * s.detikBagian * 1000);
  return { bagianMs: Math.max(0, akhirBagian - lewatMs), totalMs: Math.max(0, total - lewatMs) };
}

/**
 * Data yang dinilai dan disimpan. Waktu habis: semua bagian. Diakhiri lebih awal: hanya bagian yang sudah selesai
 * (bagian berjalan tidak dihitung agar kurva kerja tetap adil), kecuali belum ada bagian yang selesai; maka bagian
 * pertama dipakai dengan waktu sebenarnya. Null bila tidak ada jawaban atau terlalu singkat untuk disimpan.
 */
export function ringkasSesi(s: Sesi, lewatMs: number): { seri: Bagian[]; detik: number } | null {
  let seri: Bagian[];
  let detik: number;
  if (s.selesai) {
    seri = s.seri.slice(0, s.bagianTotal);
    detik = s.bagianTotal * s.detikBagian;
  } else if (s.bagian >= 1) {
    seri = s.seri.slice(0, s.bagian);
    detik = s.bagian * s.detikBagian;
  } else {
    seri = s.seri.slice(0, 1);
    detik = Math.min(s.detikBagian, Math.round(Math.max(0, lewatMs) / 1000));
  }
  const dijawab = seri.reduce((a, b) => a + b.jawab, 0);
  if (dijawab === 0 || detik < 5) return null;
  return { seri, detik };
}

// ---------------------------------------------------------------- Kiriman ke server & simpanan sementara di HP

/** Kunci localStorage untuk hasil yang belum terkirim. */
export const KUNCI_TERTUNDA = "rg-latihan-tertunda";
/** Paling banyak hasil tertunda yang disimpan di satu HP. */
export const BATAS_TERTUNDA = 10;

export interface KirimanLatihan {
  /** Satu ID per latihan selesai; dipakai ulang saat kirim ulang agar tidak tersimpan dua kali. */
  operation_id: string;
  jenis: JenisLatihan;
  durasi: DurasiLatihan;
  mulai: string;
  detik: number;
  seri: [number, number][];
  /** user_id pemilik, agar hasil tidak terkirim atas nama akun lain yang masuk di HP yang sama. */
  pemilik: string;
  /** Waktu latihan selesai (ISO). */
  dibuat: string;
  uji_siswa?: string;
}

export function buatKiriman(input: {
  operationId: string;
  jenis: JenisLatihan;
  durasi: DurasiLatihan;
  mulai: string;
  pemilik: string;
  dibuat: string;
  ujiSiswa?: string;
  ringkas: { seri: Bagian[]; detik: number };
}): KirimanLatihan {
  return {
    operation_id: input.operationId,
    jenis: input.jenis,
    durasi: input.durasi,
    mulai: input.mulai,
    detik: input.ringkas.detik,
    seri: input.ringkas.seri.map((b) => [b.benar, b.jawab]),
    pemilik: input.pemilik,
    dibuat: input.dibuat,
    ...(input.ujiSiswa ? { uji_siswa: input.ujiSiswa } : {}),
  };
}

/** Isian FormData untuk Server Action simpanLatihan. */
export function isiForm(k: KirimanLatihan): [string, string][] {
  const fields: [string, string][] = [
    ["operation_id", k.operation_id],
    ["jenis", k.jenis],
    ["durasi", k.durasi],
    ["mulai", k.mulai],
    ["detik", String(k.detik)],
    ["seri", JSON.stringify(k.seri)],
  ];
  if (k.uji_siswa) fields.push([UJI_SISWA_FIELD, k.uji_siswa]);
  return fields;
}

export const seriDariKiriman = (k: Pick<KirimanLatihan, "seri">): Bagian[] => k.seri.map(([benar, jawab]) => ({ benar, jawab }));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function kirimanSah(x: unknown): x is KirimanLatihan {
  if (!x || typeof x !== "object") return false;
  const k = x as Record<string, unknown>;
  return (
    typeof k.operation_id === "string" &&
    UUID.test(k.operation_id) &&
    isJenis(k.jenis) &&
    isDurasi(k.durasi) &&
    typeof k.mulai === "string" &&
    typeof k.detik === "number" &&
    Number.isInteger(k.detik) &&
    typeof k.pemilik === "string" &&
    typeof k.dibuat === "string" &&
    (k.uji_siswa === undefined || (typeof k.uji_siswa === "string" && /^[a-f0-9]{32}$/.test(k.uji_siswa))) &&
    Array.isArray(k.seri) &&
    k.seri.length >= 1 &&
    k.seri.every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => Number.isInteger(v) && v >= 0))
  );
}

/** Membaca daftar tertunda dari localStorage; isi rusak diabaikan. */
export function bacaTertunda(text: string | null | undefined): KirimanLatihan[] {
  try {
    const raw = JSON.parse(text || "[]") as unknown;
    return Array.isArray(raw) ? raw.filter(kirimanSah) : [];
  } catch {
    return [];
  }
}

/** Menambah atau mengganti satu kiriman (menurut operation_id); yang tertua dibuang bila melebihi batas. */
export function tambahTertunda(list: readonly KirimanLatihan[], k: KirimanLatihan): KirimanLatihan[] {
  return [...list.filter((x) => x.operation_id !== k.operation_id), k].slice(-BATAS_TERTUNDA);
}

export const hapusTertunda = (list: readonly KirimanLatihan[], operationId: string) => list.filter((x) => x.operation_id !== operationId);

/** UUID v4 untuk ID operasi; tetap jalan di alamat http biasa (tanpa crypto.randomUUID). */
export function idOperasi(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---------------------------------------------------------------- Teks bantu

/** 75 000 ms → "01:15". Pembulatan ke atas agar "00:00" baru tampil saat waktu benar-benar habis. */
export function jamMundur(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const angkaId = (v: number) => v.toLocaleString("id-ID", { maximumFractionDigits: 1 });

/** 30 → "30 detik", 180 → "3 menit". */
export function lamaTeks(detik: number): string {
  return detik >= 60 && detik % 60 === 0 ? `${detik / 60} menit` : detik >= 60 ? `${angkaId(detik / 60)} menit` : `${detik} detik`;
}

/** "20 kolom × 15 detik · total 5 menit" */
export function keteranganDurasi(jenis: JenisLatihan, durasi: DurasiLatihan): string {
  const p = PRESET[jenis][durasi];
  return `${p.bagian} ${JENIS_INFO[jenis].bagian} × ${lamaTeks(p.detik)} · total ${lamaTeks(p.bagian * p.detik)}`;
}
