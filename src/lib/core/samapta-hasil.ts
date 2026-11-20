// Hasil satu Tes Samapta untuk dibawa ke luar aplikasi: berkas CSV yang langsung terbuka rapi di Excel,
// dan pesan WhatsApp "Kirim hasil" ke wali. Murni (tanpa akses data) agar bisa diuji.
import type { Klasifikasi, SamaptaResult } from "./samapta";
import type { Gender } from "./types";
import { isiTemplate, nomorWa } from "./wa";

export interface BarisHasil {
  student: { siswa_id: string; kode_siswa: string; nama: string; jenis_kelamin: Gender | ""; no_wa: string; no_wa_wali: string; nama_wali: string };
  result: SamaptaResult;
  score: { garjasA: number | null; garjasB: number | null; akhir: number | null; klas: Klasifikasi | null; pullLabel: string };
  rank: number | null;
}

/** Angka gaya Indonesia tanpa pemisah ribuan (koma desimal), cocok untuk Excel berbahasa Indonesia. Kosong untuk null. */
export function angkaCsv(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

/** Sel teks: diapit tanda kutip; awalan rumus (= + - @) dinetralkan agar tidak dijalankan Excel. */
export function teksCsv(value: string | null | undefined): string {
  let text = value ?? "";
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export const KOLOM_CSV_SAMAPTA = [
  "No",
  "Kode",
  "Nama",
  "L/P",
  "Lari 12 menit (m)",
  "Nilai lari",
  "Pull up/Chinning (kali)",
  "Nilai pull up/chinning",
  "Sit up (kali)",
  "Nilai sit up",
  "Push up (kali)",
  "Nilai push up",
  "Shuttle run (detik)",
  "Nilai shuttle run",
  "Garjas A",
  "Garjas B",
  "Hasil akhir",
  "Klasifikasi",
  "Peringkat",
] as const;

/** Urutan berkas: peringkat 1 ke bawah, lalu peserta yang hasil akhirnya belum lengkap (urut kode). */
export function urutPeringkat<T extends Pick<BarisHasil, "rank" | "student">>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.student.kode_siswa.localeCompare(b.student.kode_siswa));
}

/**
 * Berkas CSV hasil tes: UTF-8 dengan BOM, pemisah titik koma, dan baris pertama "sep=;" agar Excel langsung
 * memecah kolom. Nilai mentah dan nilai tiap materi, Garjas A, Garjas B, hasil akhir, klasifikasi, dan peringkat.
 */
export function csvHasilTes(entries: readonly BarisHasil[]): string {
  const rows = urutPeringkat(entries).map((e, i) => {
    const r = e.result;
    return [
      String(i + 1),
      teksCsv(e.student.kode_siswa),
      teksCsv(e.student.nama),
      teksCsv(e.student.jenis_kelamin),
      angkaCsv(r.lari_jarak),
      angkaCsv(r.lari_nilai),
      angkaCsv(r.pull_jumlah),
      angkaCsv(r.pull_nilai),
      angkaCsv(r.situp_jumlah),
      angkaCsv(r.situp_nilai),
      angkaCsv(r.pushup_jumlah),
      angkaCsv(r.pushup_nilai),
      angkaCsv(r.shuttle_waktu),
      angkaCsv(r.shuttle_nilai),
      angkaCsv(e.score.garjasA),
      angkaCsv(e.score.garjasB),
      angkaCsv(e.score.akhir),
      teksCsv(e.score.klas ?? "Belum lengkap"),
      e.rank === null ? "" : String(e.rank),
    ].join(";");
  });
  return `﻿sep=;\r\n${[KOLOM_CSV_SAMAPTA.map(teksCsv).join(";"), ...rows].join("\r\n")}\r\n`;
}

/** Nama berkas aman: "Hasil Tes Samapta III.csv" → ASCII untuk filename dan versi UTF-8 untuk filename*. */
export function namaBerkasHasil(namaTes: string): { ascii: string; utf8: string } {
  const dasar = `Hasil ${namaTes.trim() || "Tes Samapta"}`.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return { ascii: `${dasar.replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, "-")}.csv`, utf8: `${dasar}.csv` };
}

const angkaPesan = (v: number | null) => (v === null ? "-" : v.toLocaleString("id-ID", { maximumFractionDigits: 2 }));

/**
 * Pesan WA "Kirim hasil" ke wali (nomor wali, atau nomor siswa bila nomor wali kosong) dari template samapta.
 * Null bila hasil akhir belum lengkap.
 */
export function waHasilSamapta(
  template: string,
  data: { lembaga: string; tes: string; peserta: number },
  e: Pick<BarisHasil, "student" | "score" | "rank">,
): { nomor: string | null; pesan: string; untuk: string } | null {
  if (e.score.akhir === null) return null;
  const s = e.student;
  const wali = nomorWa(s.no_wa_wali);
  const nomor = wali ?? nomorWa(s.no_wa);
  const pesan = isiTemplate(template, {
    nama: s.nama,
    tes: data.tes,
    nilai: angkaPesan(e.score.akhir),
    klasifikasi: e.score.klas ?? "-",
    peringkat: e.rank ?? "-",
    peserta: data.peserta,
    garjas_a: angkaPesan(e.score.garjasA),
    garjas_b: angkaPesan(e.score.garjasB),
    lembaga: data.lembaga,
  });
  const untuk = wali
    ? `Wali ${s.nama}${s.nama_wali ? ` (${s.nama_wali})` : ""} · ${s.no_wa_wali}`
    : nomor
      ? `${s.nama} · ${s.no_wa} (nomor wali kosong)`
      : `${s.nama} · nomor WA kosong`;
  return { nomor, pesan, untuk };
}
