// Tautan WhatsApp (wa.me) dengan pesan yang sudah terisi. Tanpa API dan tanpa biaya: tautan hanya membuka
// WhatsApp di HP/komputer owner; pesan baru terkirim setelah owner menekan kirim sendiri.
import type { Row } from "../data/types";
import { str } from "../data/rows";

/**
 * Nomor WA untuk wa.me: hanya angka, kode negara 62. "0812-3456-7890" dan "+62 812…" menjadi "6281234567890".
 * Null bila kosong atau tidak masuk akal (kurang dari 9 atau lebih dari 15 angka).
 */
export function nomorWa(raw: unknown): string | null {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  if (digits.length < 9 || digits.length > 15) return null;
  return digits;
}

/** Tautan wa.me. Tanpa nomor: WhatsApp membuka pilihan chat/grup untuk membagikan pesan. */
export function tautanWa(nomor: string | null, pesan: string): string {
  const text = encodeURIComponent(pesan);
  return nomor ? `https://wa.me/${nomor}?text=${text}` : `https://wa.me/?text=${text}`;
}

export const WA_JENIS = ["kehadiran", "latihan", "samapta"] as const;
export type WaJenis = (typeof WA_JENIS)[number];

export const WA_JENIS_LABEL: Record<WaJenis, string> = { kehadiran: "Kehadiran", latihan: "Latihan", samapta: "Tes Samapta" };

/** Kunci Pengaturan tempat template tersimpan (kosong = memakai template bawaan). */
export const WA_TEMPLATE_KEY: Record<WaJenis, string> = {
  kehadiran: "wa_template_kehadiran",
  latihan: "wa_template_latihan",
  samapta: "wa_template_samapta",
};

export const WA_TEMPLATE_DEFAULT: Record<WaJenis, string> = {
  kehadiran:
    "Assalamualaikum Bapak/Ibu wali {nama}, kehadiran ananda di {lembaga} bulan {bulan} {persen} ({hadir} dari {sesi} sesi): {izin} izin, {sakit} sakit, {alfa} alfa. Mohon dukungan Bapak/Ibu agar ananda lebih rutin hadir. Terima kasih. Admin {lembaga}",
  latihan: "Assalamualaikum {nama}, {catatan}. Yuk lanjutkan latihan psikotes di Ruang Garda hari ini, sedikit tapi rutin. Semangat! Admin {lembaga}",
  samapta:
    "Assalamualaikum Bapak/Ibu wali {nama}, hasil {tes} ananda: nilai akhir {nilai} ({klasifikasi}), peringkat {peringkat} dari {peserta} peserta. Garjas A {garjas_a}, Garjas B {garjas_b}. Terima kasih. Admin {lembaga}",
};

/** Isian yang bisa dipakai di setiap template (ditampilkan di Pengaturan). */
export const WA_TEMPLATE_FIELDS: Record<WaJenis, { kode: string; ket: string }[]> = {
  kehadiran: [
    { kode: "nama", ket: "nama siswa" },
    { kode: "bulan", ket: "bulan rekap" },
    { kode: "persen", ket: "persentase hadir" },
    { kode: "hadir", ket: "jumlah hadir" },
    { kode: "sesi", ket: "jumlah sesi" },
    { kode: "izin", ket: "jumlah izin" },
    { kode: "sakit", ket: "jumlah sakit" },
    { kode: "alfa", ket: "jumlah alfa" },
    { kode: "lembaga", ket: "nama lembaga" },
  ],
  latihan: [
    { kode: "nama", ket: "nama siswa" },
    { kode: "catatan", ket: "alasan, mis. 9 hari belum latihan" },
    { kode: "lembaga", ket: "nama lembaga" },
  ],
  samapta: [
    { kode: "nama", ket: "nama siswa" },
    { kode: "tes", ket: "nama tes" },
    { kode: "nilai", ket: "nilai akhir" },
    { kode: "klasifikasi", ket: "klasifikasi" },
    { kode: "peringkat", ket: "peringkat" },
    { kode: "peserta", ket: "jumlah peserta" },
    { kode: "garjas_a", ket: "nilai Garjas A" },
    { kode: "garjas_b", ket: "nilai Garjas B" },
    { kode: "lembaga", ket: "nama lembaga" },
  ],
};

export const WA_TEMPLATE_MAX = 600;

/** Template yang berlaku (isian Pengaturan bila ada, selain itu bawaan). */
export function waTemplates(t: { Pengaturan?: readonly Row[] }): Record<WaJenis, string> {
  const value = (key: string) => str((t.Pengaturan ?? []).find((row) => row.key === key)?.value ?? "").trim();
  return Object.fromEntries(WA_JENIS.map((j) => [j, value(WA_TEMPLATE_KEY[j]) || WA_TEMPLATE_DEFAULT[j]])) as Record<WaJenis, string>;
}

/** Mengganti {kode} dengan datanya. Kode yang tidak dikenal dibiarkan apa adanya agar mudah terlihat saat menyunting. */
export function isiTemplate(template: string, data: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{([a-z_]+)\}/g, (whole, kode: string) => {
    const v = data[kode];
    return v === undefined || v === null ? whole : String(v);
  });
}
