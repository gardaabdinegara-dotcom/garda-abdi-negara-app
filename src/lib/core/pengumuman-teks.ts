// Batas isian dan teks WhatsApp pengumuman. Terpisah dari pengumuman.ts agar bisa dipakai komponen klien
// tanpa ikut memuat validasi dan perintah domain.

export const PENGUMUMAN_JUDUL_MAX = 80;
export const PENGUMUMAN_ISI_MAX = 500;
/** Paling lama satu tahun ke depan, agar salah ketik tahun tidak membuat info tampil selamanya. */
export const PENGUMUMAN_HARI_MAX = 366;

/** Teks siap kirim ke grup WhatsApp: judul tebal, lalu isi. */
export const teksWaPengumuman = (p: { judul: string; isi: string }) => `*${p.judul.trim()}*\n${p.isi.trim()}`;

/** Panjang isi seperti yang dihitung server (baris baru = satu karakter, spasi di ujung diabaikan). */
export const panjangIsi = (isi: string) => isi.replace(/\r\n?/g, "\n").trim().length;

export function tambahHari(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
