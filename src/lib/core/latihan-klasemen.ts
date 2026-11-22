// Klasemen latihan psikotes: adu skor mingguan per jenis, klasemen umum dari poin peringkat, tingkat, dan lencana.
// Murni hitungan (tanpa akses data), jadi bisa diuji langsung; server membaca tab Latihan_Psikotes lalu memanggil
// fungsi di sini. Yang diadu hanya durasi Standar agar skor setiap siswa sebanding.
import { JENIS_INFO, JENIS_LATIHAN, type JenisLatihan } from "./latihan";
import type { Latihan } from "./latihan-simpan";
import { geserTanggal, rekorBeruntun, urutHari } from "./latihan-target";

export const DURASI_KLASEMEN = "standar" as const;
/** Latihan Standar minimal per jenis dalam seminggu agar masuk klasemen jenis itu. */
export const MIN_LATIHAN = 3;
/** Poin klasemen umum untuk peringkat 1 sampai 8 setiap jenis. */
export const POIN_PERINGKAT = [10, 8, 6, 5, 4, 3, 2, 1] as const;
/** Tingkat memakai latihan beberapa hari terakhir, jadi tidak ikut dimulai ulang setiap Senin. */
export const HARI_TINGKAT = 30;

export type KodeTingkat = "pemula" | "perunggu" | "perak" | "emas";
/** Urut naik: indeks yang lebih besar berarti tingkat yang lebih tinggi. */
export const TINGKAT: readonly { kode: KodeTingkat; nama: string; batas: number }[] = [
  { kode: "pemula", nama: "Pemula", batas: 0 },
  { kode: "perunggu", nama: "Perunggu", batas: 60 },
  { kode: "perak", nama: "Perak", batas: 75 },
  { kode: "emas", nama: "Emas", batas: 85 },
];
const EMAS = TINGKAT.length - 1;

const jumlah = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const rata = (xs: readonly number[]) => jumlah(xs) / xs.length;
export const bulat1 = (v: number) => Math.round(v * 10) / 10;
const standar = (l: Latihan) => l.durasi === DURASI_KLASEMEN;
const urutWaktu = (a: Latihan, b: Latihan) => a.tanggal.localeCompare(b.tanggal) || a.mulai.localeCompare(b.mulai) || a.latihan_id.localeCompare(b.latihan_id);

/** Indeks tingkat untuk sebuah nilai (lihat TINGKAT). */
export function tingkatDari(nilai: number): number {
  let i = 0;
  TINGKAT.forEach((t, k) => {
    if (nilai >= t.batas) i = k;
  });
  return i;
}

/** Rata-rata tiga skor terbaik, atau null bila belum ada tiga skor. */
export function rataTigaTerbaik(skor: readonly number[]): number | null {
  if (skor.length < MIN_LATIHAN) return null;
  return rata([...skor].sort((a, b) => b - a).slice(0, MIN_LATIHAN));
}

// ---------------------------------------------------------------- Tanggal

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"] as const;

/** "19 Nov" dari YYYY-MM-DD. */
export function tanggalSingkat(tanggal: string): string {
  const [, m, d] = tanggal.split("-").map(Number) as [number, number, number];
  return `${d} ${BULAN[m - 1] ?? ""}`;
}

/** "16 sampai 22 Nov", atau "30 Nov sampai 6 Des" bila beda bulan. */
export function rentangMinggu(dari: string, sampai: string): string {
  if (dari.slice(0, 7) === sampai.slice(0, 7)) return `${Number(dari.slice(8, 10))} sampai ${tanggalSingkat(sampai)}`;
  return `${tanggalSingkat(dari)} sampai ${tanggalSingkat(sampai)}`;
}

/** Senin dari minggu yang memuat tanggal itu. */
export const seninDari = (tanggal: string) => geserTanggal(tanggal, -urutHari(tanggal));

export function singkatanZona(zona: string): string {
  if (zona === "Asia/Makassar") return "WITA";
  if (zona === "Asia/Jayapura") return "WIT";
  return "WIB";
}

// ---------------------------------------------------------------- Nama tampil

const rapikan = (nama: string) => {
  const kata = nama.trim().split(/\s+/).filter(Boolean);
  // Nama yang tertulis huruf besar semua ditampilkan dengan huruf awal kapital saja.
  const kapital = nama === nama.toUpperCase();
  return kata.map((k) => (kapital ? k.charAt(0) + k.slice(1).toLowerCase() : k));
};

/**
 * Nama untuk klasemen yang dilihat siswa: nama depan dan inisial ("Arif P."). Bila dua siswa jadi sama,
 * keduanya memakai dua kata pertama ("Muhammad Rizky A.").
 */
export function namaKlasemen(daftar: readonly { siswa_id: string; nama: string }[]): Record<string, string> {
  const pendek = (kata: string[], panjang: boolean) => {
    if (kata.length <= 1) return kata[0] ?? "";
    if (!panjang) return `${kata[0]} ${kata[1]!.charAt(0).toUpperCase()}.`;
    return kata.length === 2 ? kata.join(" ") : `${kata[0]} ${kata[1]} ${kata[2]!.charAt(0).toUpperCase()}.`;
  };
  const kata = daftar.map((s) => ({ id: s.siswa_id, kata: rapikan(s.nama) }));
  const awal = kata.map((k) => pendek(k.kata, false));
  const kembar = new Set(awal.filter((n, i) => awal.indexOf(n) !== i));
  return Object.fromEntries(kata.map((k, i) => [k.id, kembar.has(awal[i]!) ? pendek(k.kata, true) : awal[i]!]));
}

/** Dua huruf untuk lingkaran avatar ("AP"). */
export const inisial = (nama: string) =>
  nama
    .replace(/\./g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((k) => k.charAt(0).toUpperCase())
    .join("");

// ---------------------------------------------------------------- Klasemen satu minggu

export interface BarisJenis {
  siswa_id: string;
  peringkat: number;
  /** Rata-rata tiga skor terbaik (satu desimal). */
  nilai: number;
  terbaik: number[];
  /** Latihan Standar jenis ini dalam minggu itu. */
  jumlah: number;
  poin: number;
}

export interface KlasemenJenis {
  jenis: JenisLatihan;
  baris: BarisJenis[];
  /** Setiap siswa yang sudah latihan Standar jenis ini minggu itu: jumlah latihan dan skor (terbesar dulu). */
  peserta: Record<string, { jumlah: number; skor: number[] }>;
  /** Siswa yang sudah latihan jenis ini tetapi belum sampai tiga kali. */
  belumCukup: number;
}

export type PoinJenis = Record<JenisLatihan, { peringkat: number; poin: number } | null>;

export interface BarisUmum {
  siswa_id: string;
  peringkat: number;
  poin: number;
  /** Rata-rata nilai jenis yang diikuti (penentu bila poin sama). */
  rata: number;
  jenis: PoinJenis;
}

export interface KlasemenMinggu {
  dari: string;
  sampai: string;
  jenis: Record<JenisLatihan, KlasemenJenis>;
  umum: BarisUmum[];
  /** Siswa yang sudah latihan Standar minggu itu tetapi belum dapat poin. */
  tanpaPoin: number;
  /** Peserta yang belum latihan Standar sama sekali minggu itu. */
  belumLatihan: number;
}

/**
 * Klasemen latihan Standar antara `dari` dan `sampai` (YYYY-MM-DD, inklusif) untuk siswa dalam `peserta`.
 * Nilai jenis = rata-rata 3 skor terbaik; bila sama, skor tunggal terbaik lalu yang lebih dulu mencapainya.
 * Klasemen umum menjumlah poin peringkat; bila sama, rata-rata nilai jenis yang lebih tinggi.
 */
export function klasemenMinggu(latihan: readonly Latihan[], peserta: readonly string[], dari: string, sampai: string): KlasemenMinggu {
  const ikut = new Set(peserta);
  const pilih = latihan.filter((l) => ikut.has(l.siswa_id) && standar(l) && l.tanggal >= dari && l.tanggal <= sampai);

  const jenis = {} as Record<JenisLatihan, KlasemenJenis>;
  for (const j of JENIS_LATIHAN) {
    const per = new Map<string, Latihan[]>();
    for (const l of pilih) if (l.jenis === j) per.set(l.siswa_id, [...(per.get(l.siswa_id) ?? []), l]);
    const pesertaJ: KlasemenJenis["peserta"] = {};
    const calon: { siswa_id: string; nilai: number; terbaik: number[]; jumlah: number; tercapai: string }[] = [];
    for (const [id, ls] of per) {
      const urut = [...ls].sort((a, b) => b.skor - a.skor || a.mulai.localeCompare(b.mulai));
      pesertaJ[id] = { jumlah: ls.length, skor: urut.map((l) => l.skor) };
      if (ls.length < MIN_LATIHAN) continue;
      const top = urut.slice(0, MIN_LATIHAN);
      calon.push({
        siswa_id: id,
        nilai: rata(top.map((l) => l.skor)),
        terbaik: top.map((l) => l.skor),
        jumlah: ls.length,
        tercapai: top.map((l) => l.mulai).sort().at(-1)!,
      });
    }
    calon.sort((a, b) => b.nilai - a.nilai || b.terbaik[0]! - a.terbaik[0]! || a.tercapai.localeCompare(b.tercapai) || a.siswa_id.localeCompare(b.siswa_id));
    const baris = calon.map((c, i) => ({ siswa_id: c.siswa_id, peringkat: i + 1, nilai: bulat1(c.nilai), terbaik: c.terbaik, jumlah: c.jumlah, poin: POIN_PERINGKAT[i] ?? 0 }));
    const belumCukup = Object.values(pesertaJ).filter((p) => p.jumlah < MIN_LATIHAN).length;
    jenis[j] = { jenis: j, baris, peserta: pesertaJ, belumCukup };
  }

  const latihanIds = [...new Set(pilih.map((l) => l.siswa_id))];
  const umum = latihanIds
    .map((id) => {
      const per = Object.fromEntries(
        JENIS_LATIHAN.map((j) => {
          const b = jenis[j].baris.find((x) => x.siswa_id === id);
          return [j, b ? { peringkat: b.peringkat, poin: b.poin, nilai: b.nilai } : null];
        }),
      ) as Record<JenisLatihan, { peringkat: number; poin: number; nilai: number } | null>;
      const ada = JENIS_LATIHAN.map((j) => per[j]).filter((x) => x !== null);
      return {
        siswa_id: id,
        poin: jumlah(ada.map((x) => x.poin)),
        rata: ada.length ? rata(ada.map((x) => x.nilai)) : 0,
        jenis: Object.fromEntries(JENIS_LATIHAN.map((j) => [j, per[j] ? { peringkat: per[j]!.peringkat, poin: per[j]!.poin } : null])) as PoinJenis,
      };
    })
    .filter((r) => r.poin > 0)
    .sort((a, b) => b.poin - a.poin || b.rata - a.rata || a.siswa_id.localeCompare(b.siswa_id))
    .map((r, i) => ({ ...r, peringkat: i + 1, rata: bulat1(r.rata) }));

  return {
    dari,
    sampai,
    jenis,
    umum,
    tanpaPoin: latihanIds.length - umum.length,
    belumLatihan: peserta.filter((id) => !latihanIds.includes(id)).length,
  };
}

export type Gerak = { arah: "naik" | "turun" | "tetap"; selisih: number } | { arah: "baru"; selisih: 0 };

/** Perubahan peringkat umum dibanding akhir hari kemarin (null bila hari ini Senin atau siswa belum berperingkat). */
export function gerakUmum(sekarang: KlasemenMinggu, kemarin: KlasemenMinggu | null, siswaId: string): Gerak | null {
  const kini = sekarang.umum.find((r) => r.siswa_id === siswaId);
  if (!kini || !kemarin) return null;
  const dulu = kemarin.umum.find((r) => r.siswa_id === siswaId);
  if (!dulu) return { arah: "baru", selisih: 0 };
  const selisih = dulu.peringkat - kini.peringkat;
  return { arah: selisih > 0 ? "naik" : selisih < 0 ? "turun" : "tetap", selisih: Math.abs(selisih) };
}

/** Klasemen setiap minggu yang sudah selesai, dari minggu latihan Standar pertama sampai minggu sebelum `seninIni`. */
export function riwayatMinggu(latihan: readonly Latihan[], peserta: readonly string[], seninIni: string): KlasemenMinggu[] {
  const ikut = new Set(peserta);
  const pertama = latihan.filter((l) => ikut.has(l.siswa_id) && standar(l) && /^\d{4}-\d{2}-\d{2}$/.test(l.tanggal)).map((l) => l.tanggal).sort()[0];
  if (!pertama) return [];
  const hasil: KlasemenMinggu[] = [];
  for (let senin = seninDari(pertama); senin < seninIni; senin = geserTanggal(senin, 7)) {
    hasil.push(klasemenMinggu(latihan, peserta, senin, geserTanggal(senin, 6)));
  }
  return hasil;
}

// ---------------------------------------------------------------- Tingkat

export interface TingkatJenis {
  jenis: JenisLatihan;
  /** Rata-rata tiga skor Standar terbaik dalam HARI_TINGKAT hari terakhir (null bila kurang dari tiga latihan). */
  nilai: number | null;
  jumlah: number;
  /** Indeks TINGKAT (null bila belum ada nilai). */
  tingkat: number | null;
  /** Tingkat berikutnya dan kekurangannya (null bila sudah Emas atau belum ada nilai). */
  berikut: { nama: string; batas: number; kurang: number } | null;
}

function nilaiTingkat(latihanSiswa: readonly Latihan[], jenis: JenisLatihan, hariIni: string) {
  const batas = geserTanggal(hariIni, -HARI_TINGKAT);
  const skor = latihanSiswa.filter((l) => standar(l) && l.jenis === jenis && l.tanggal > batas && l.tanggal <= hariIni).map((l) => l.skor);
  const nilai = rataTigaTerbaik(skor);
  return { nilai, jumlah: skor.length };
}

export function tingkatSiswa(latihanSiswa: readonly Latihan[], hariIni: string): Record<JenisLatihan, TingkatJenis> {
  return Object.fromEntries(
    JENIS_LATIHAN.map((jenis) => {
      const { nilai, jumlah: n } = nilaiTingkat(latihanSiswa, jenis, hariIni);
      const tingkat = nilai === null ? null : tingkatDari(nilai);
      const lanjut = tingkat === null || tingkat >= EMAS ? null : TINGKAT[tingkat + 1]!;
      return [
        jenis,
        {
          jenis,
          nilai: nilai === null ? null : bulat1(nilai),
          jumlah: n,
          tingkat,
          berikut: lanjut && nilai !== null ? { nama: lanjut.nama, batas: lanjut.batas, kurang: bulat1(lanjut.batas - nilai) } : null,
        },
      ];
    }),
  ) as Record<JenisLatihan, TingkatJenis>;
}

// ---------------------------------------------------------------- Lencana

export type KodeLencana =
  | "juara_jenis"
  | "rekor_pribadi"
  | "naik_tingkat"
  | "lengkap_4"
  | "stabil"
  | "tahan_uji"
  | "beruntun_7"
  | "podium_umum"
  | "emas_semua"
  | "juara_umum";

export const LENCANA_INFO: Record<KodeLencana, { judul: string; ket: string }> = {
  juara_jenis: { judul: "Juara jenis", ket: "Peringkat 1 satu jenis saat minggu ditutup" },
  rekor_pribadi: { judul: "Rekor pribadi", ket: "Skor Standar tertinggi baru di satu jenis" },
  naik_tingkat: { judul: "Naik tingkat", ket: "Tingkat satu jenis naik" },
  lengkap_4: { judul: "Lengkap 4 jenis", ket: "Keempat jenis dalam satu minggu" },
  stabil: { judul: "Stabil", ket: "Stabilitas 90 ke atas di 3 latihan Standar" },
  tahan_uji: { judul: "Tahan uji", ket: "Kraepelin Seperti tes asli dengan skor 75 ke atas" },
  beruntun_7: { judul: "7 hari beruntun", ket: "Latihan 7 hari berturut-turut" },
  podium_umum: { judul: "Podium umum", ket: "3 besar klasemen umum saat minggu ditutup" },
  emas_semua: { judul: "Emas semua", ket: "Tingkat Emas di keempat jenis sekaligus" },
  juara_umum: { judul: "Juara umum", ket: "Peringkat 1 klasemen umum saat minggu ditutup" },
};
export const URUT_LENCANA = Object.keys(LENCANA_INFO) as KodeLencana[];

export const BATAS_STABIL = 90;
export const BATAS_TAHAN_UJI = 75;
export const HARI_BERUNTUN = 7;

export interface Lencana {
  kode: KodeLencana;
  judul: string;
  ket: string;
  dapat: boolean;
  /** Keterangan kapan/apa (bila sudah didapat) atau posisi sekarang (bila belum). */
  catatan: string;
  /** Kemajuan menuju lencana yang belum didapat. */
  progres: { nilai: number; target: number } | null;
}

const kaliTerakhir = (n: number, teks: string) => (n > 1 ? `${n} kali, terakhir ${teks}` : teks);

/**
 * Lencana satu siswa. `latihanSiswa` berisi semua latihan siswa itu (semua durasi), `mingguSelesai` klasemen
 * minggu-minggu yang sudah ditutup, `sekarang` klasemen minggu berjalan. Lencana yang sudah didapat tidak hilang.
 */
export function lencanaSiswa(input: {
  siswaId: string;
  latihanSiswa: readonly Latihan[];
  mingguSelesai: readonly KlasemenMinggu[];
  sekarang: KlasemenMinggu;
  hariIni: string;
}): Lencana[] {
  const { siswaId, mingguSelesai, sekarang, hariIni } = input;
  const semua = input.latihanSiswa.filter((l) => l.siswa_id === siswaId && l.tanggal <= hariIni).sort(urutWaktu);
  const std = semua.filter(standar);
  const posisiUmum = sekarang.umum.find((r) => r.siswa_id === siswaId);
  const catatanUmum = posisiUmum ? `Minggu ini peringkat ${posisiUmum.peringkat}` : "Belum dapat poin minggu ini";
  const hasil = new Map<KodeLencana, Omit<Lencana, "kode" | "judul" | "ket">>();

  // Juara jenis, podium umum, juara umum: hanya minggu yang sudah ditutup.
  const juaraJenis: string[] = [];
  const podium: string[] = [];
  const juaraUmum: string[] = [];
  for (const m of mingguSelesai) {
    const rentang = rentangMinggu(m.dari, m.sampai);
    for (const j of JENIS_LATIHAN) if (m.jenis[j].baris[0]?.siswa_id === siswaId) juaraJenis.push(`${JENIS_INFO[j].nama}, ${rentang}`);
    const u = m.umum.find((r) => r.siswa_id === siswaId);
    if (u && u.peringkat <= 3) podium.push(`peringkat ${u.peringkat}, ${rentang}`);
    if (u?.peringkat === 1) juaraUmum.push(rentang);
  }
  const terbaikJenisKini = JENIS_LATIHAN.map((j) => sekarang.jenis[j].baris.find((b) => b.siswa_id === siswaId))
    .filter((b) => b !== undefined)
    .sort((a, b) => a.peringkat - b.peringkat)[0];
  hasil.set("juara_jenis", {
    dapat: juaraJenis.length > 0,
    catatan: juaraJenis.length ? kaliTerakhir(juaraJenis.length, juaraJenis.at(-1)!) : terbaikJenisKini ? `Minggu ini paling tinggi peringkat ${terbaikJenisKini.peringkat}` : "Belum masuk klasemen jenis",
    progres: null,
  });
  hasil.set("podium_umum", { dapat: podium.length > 0, catatan: podium.length ? kaliTerakhir(podium.length, podium.at(-1)!) : catatanUmum, progres: null });
  hasil.set("juara_umum", { dapat: juaraUmum.length > 0, catatan: juaraUmum.length ? kaliTerakhir(juaraUmum.length, juaraUmum.at(-1)!) : catatanUmum, progres: null });

  // Rekor pribadi: skor Standar yang melampaui semua skor Standar sebelumnya pada jenis yang sama.
  const maks = new Map<JenisLatihan, number>();
  let rekor: Latihan | null = null;
  for (const l of std) {
    const sebelum = maks.get(l.jenis);
    if (sebelum !== undefined && l.skor > sebelum) rekor = l;
    maks.set(l.jenis, Math.max(sebelum ?? -Infinity, l.skor));
  }
  hasil.set("rekor_pribadi", {
    dapat: rekor !== null,
    catatan: rekor ? `${JENIS_INFO[rekor.jenis].nama} ${rekor.skor} · ${tanggalSingkat(rekor.tanggal)}` : std.length ? "Kalahkan skor terbaikmu di satu jenis" : "Mulai latihan Standar",
    progres: null,
  });

  // Naik tingkat dan Emas semua: tingkat dihitung ulang setiap kali ada latihan Standar baru.
  const sebelum: Record<JenisLatihan, number | null> = { kraepelin: null, pauli: null, angka: null, simbol: null };
  let naik: { jenis: JenisLatihan; tingkat: number; tanggal: string } | null = null;
  let emasSemua: string | null = null;
  for (let i = 0; i < std.length; i++) {
    const e = std[i]!;
    const sampaiIni = std.slice(0, i + 1);
    const tingkatPada = (j: JenisLatihan) => {
      const v = nilaiTingkat(sampaiIni, j, e.tanggal).nilai;
      return v === null ? null : tingkatDari(v);
    };
    const t = tingkatPada(e.jenis);
    const lama = sebelum[e.jenis];
    if (lama !== null && t !== null && t > lama) naik = { jenis: e.jenis, tingkat: t, tanggal: e.tanggal };
    sebelum[e.jenis] = t;
    if (!emasSemua && JENIS_LATIHAN.every((j) => (j === e.jenis ? t : tingkatPada(j)) === EMAS)) emasSemua = e.tanggal;
  }
  hasil.set("naik_tingkat", {
    dapat: naik !== null,
    catatan: naik ? `${JENIS_INFO[naik.jenis].nama} naik ke ${TINGKAT[naik.tingkat]!.nama} · ${tanggalSingkat(naik.tanggal)}` : "Naikkan rata-rata 3 skor terbaik",
    progres: null,
  });
  const tingkatKini = tingkatSiswa(std, hariIni);
  const emasKini = JENIS_LATIHAN.filter((j) => tingkatKini[j].tingkat === EMAS).length;
  hasil.set("emas_semua", {
    dapat: emasSemua !== null,
    catatan: emasSemua ? tanggalSingkat(emasSemua) : `${emasKini} dari 4 jenis sudah Emas`,
    progres: emasSemua ? null : { nilai: emasKini, target: JENIS_LATIHAN.length },
  });

  // Lengkap 4 jenis: semua durasi dihitung.
  const perMinggu = new Map<string, Set<JenisLatihan>>();
  for (const l of semua) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(l.tanggal)) continue;
    const senin = seninDari(l.tanggal);
    perMinggu.set(senin, (perMinggu.get(senin) ?? new Set()).add(l.jenis));
  }
  const mingguLengkap = [...perMinggu].filter(([, s]) => s.size === JENIS_LATIHAN.length).map(([senin]) => senin).sort();
  const jenisMingguIni = perMinggu.get(seninDari(hariIni))?.size ?? 0;
  const lengkapTerakhir = mingguLengkap.at(-1);
  hasil.set("lengkap_4", {
    dapat: lengkapTerakhir !== undefined,
    catatan: lengkapTerakhir ? rentangMinggu(lengkapTerakhir, geserTanggal(lengkapTerakhir, 6)) : `Minggu ini ${jenisMingguIni} dari 4 jenis`,
    progres: lengkapTerakhir ? null : { nilai: jenisMingguIni, target: JENIS_LATIHAN.length },
  });

  // Stabil: skor aspek stabilitas 90 ke atas pada tiga latihan Standar.
  const stabil = std.filter((l) => l.skorAspek.stabilitas >= BATAS_STABIL);
  hasil.set("stabil", {
    dapat: stabil.length >= 3,
    catatan: stabil.length >= 3 ? tanggalSingkat(stabil[2]!.tanggal) : `${stabil.length} dari 3 latihan`,
    progres: stabil.length >= 3 ? null : { nilai: stabil.length, target: 3 },
  });

  // Tahan uji: Kraepelin seperti tes asli.
  const asli = semua.filter((l) => l.jenis === "kraepelin" && l.durasi === "asli");
  const lulus = asli.find((l) => l.skor >= BATAS_TAHAN_UJI);
  const terbaikAsli = asli.length ? Math.max(...asli.map((l) => l.skor)) : null;
  hasil.set("tahan_uji", {
    dapat: lulus !== undefined,
    catatan: lulus ? `Skor ${lulus.skor} · ${tanggalSingkat(lulus.tanggal)}` : terbaikAsli === null ? "Belum dicoba" : `Terbaik ${terbaikAsli}`,
    progres: lulus ? null : { nilai: terbaikAsli ?? 0, target: BATAS_TAHAN_UJI },
  });

  // 7 hari beruntun: latihan apa pun.
  const rekorHari = rekorBeruntun(semua.map((l) => l.tanggal), hariIni);
  hasil.set("beruntun_7", {
    dapat: rekorHari >= HARI_BERUNTUN,
    catatan: `Rekor ${rekorHari} hari`,
    progres: rekorHari >= HARI_BERUNTUN ? null : { nilai: rekorHari, target: HARI_BERUNTUN },
  });

  const daftar = URUT_LENCANA.map((kode) => ({ kode, ...LENCANA_INFO[kode], ...hasil.get(kode)! }));
  // Yang sudah didapat tampil dulu, urutan lain tetap.
  return [...daftar.filter((l) => l.dapat), ...daftar.filter((l) => !l.dapat)];
}

// ---------------------------------------------------------------- Ringkasan untuk menu latihan

export interface RingkasKlasemen {
  peringkat: number | null;
  dari: number;
  poin: number;
  gerak: Gerak | null;
}

export function ringkasKlasemen(sekarang: KlasemenMinggu, kemarin: KlasemenMinggu | null, siswaId: string): RingkasKlasemen {
  const r = sekarang.umum.find((x) => x.siswa_id === siswaId);
  return { peringkat: r?.peringkat ?? null, dari: sekarang.umum.length, poin: r?.poin ?? 0, gerak: gerakUmum(sekarang, kemarin, siswaId) };
}
