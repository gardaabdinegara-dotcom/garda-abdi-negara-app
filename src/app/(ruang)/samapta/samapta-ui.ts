// Pembantu tampilan Tes Samapta (murni, dipakai halaman server dan komponen klien).
import {
  formatDuration,
  KLASIFIKASI,
  POS,
  posFilled,
  type Klasifikasi,
  type Pos,
  type SamaptaResult,
  type SamaptaScore,
  type SamaptaSettings,
} from "@/lib/core/samapta";

/** Angka gaya Indonesia (koma desimal). Kosong → "-". */
export function fmt(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "-" : value.toLocaleString("id-ID", { maximumFractionDigits: digits });
}

/** 1 → I, 4 → IV, 12 → XII. */
export function roman(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return String(n);
  const table: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let rest = n;
  let out = "";
  for (const [value, letters] of table) {
    while (rest >= value) {
      out += letters;
      rest -= value;
    }
  }
  return out;
}

/** "2026-11-15" → "Minggu, 15 November 2026". */
export function longDate(tanggal: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(tanggal);
  if (!match) return tanggal || "-";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
}

/** "2026-11-15" → "15 Nov". */
export function shortDate(tanggal: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(tanggal);
  if (!match) return tanggal || "-";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", day: "numeric", month: "short" }).format(date).replace(".", "");
}

/** "07:00" → "07.00" (penulisan jam di Indonesia). */
export const jam = (value: string) => value.replace(":", ".");

/** "Tes Samapta II" → "Tes II" untuk label pendek. */
export const shortTestName = (nama: string) => nama.replace(/^Tes Samapta\s+/i, "Tes ");

export const jkLabel = (jk: string) => (jk === "P" ? "putri" : jk === "L" ? "putra" : "-");

/** Dua kata pertama nama untuk chip. */
export const shortName = (nama: string) => nama.trim().split(/\s+/).slice(0, 2).join(" ");

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

export const KLAS_TONE: Record<Klasifikasi, BadgeTone> = { "Baik Sekali": "success", Baik: "info", Cukup: "warning", Kurang: "danger" };

/** Rentang klasifikasi dari pengaturan, mis. Baik "61–80". */
export function klasRanges(s: Pick<SamaptaSettings, "baik_sekali" | "baik" | "cukup">): { klas: Klasifikasi; teks: string }[] {
  return [
    { klas: "Baik Sekali", teks: `≥ ${fmt(s.baik_sekali)}` },
    { klas: "Baik", teks: `${fmt(s.baik)}–${fmt(s.baik_sekali - 1)}` },
    { klas: "Cukup", teks: `${fmt(s.cukup)}–${fmt(s.baik - 1)}` },
    { klas: "Kurang", teks: `≤ ${fmt(s.cukup - 1)}` },
  ];
}

export const emptyKlas = (): Record<Klasifikasi, number> => Object.fromEntries(KLASIFIKASI.map((k) => [k, 0])) as Record<Klasifikasi, number>;

/** Kemajuan isian seluruh tes: sel pos terisi dari (peserta × 8). */
export function overallProgress(progress: Record<Pos, number>, peserta: number) {
  const filled = POS.reduce((sum, pos) => sum + (progress[pos] ?? 0), 0);
  const total = peserta * POS.length;
  return { filled, total, persen: total ? (filled / total) * 100 : 0 };
}

/** Pos pertama yang belum lengkap (bawaan halaman isi per pos). */
export function defaultPos(progress: Record<Pos, number>, peserta: number): Pos {
  return POS.find((pos) => (progress[pos] ?? 0) < peserta) ?? POS[0];
}

export const isPos = (value: unknown): value is Pos => typeof value === "string" && (POS as readonly string[]).includes(value);

/** Pos yang belum lengkap untuk satu siswa. */
export const missingPos = (result: SamaptaResult): Pos[] => POS.filter((pos) => !posFilled(result, pos));

export interface Materi {
  key: "lari" | "pull" | "situp" | "pushup" | "shuttle";
  label: string;
  short: string;
  hasil: string;
  nilai: number | null;
}

/** Lima materi bernilai untuk rincian dan perbandingan. */
export function materiOf(result: SamaptaResult, pullLabel: string): Materi[] {
  const kali = (n: number | null) => (n === null ? "-" : `${fmt(n, 0)} kali`);
  return [
    { key: "lari", label: "Lari 12 menit", short: "Lari", hasil: result.lari_jarak === null ? "-" : `${fmt(result.lari_jarak, 0)} m`, nilai: result.lari_nilai },
    { key: "pull", label: pullLabel, short: pullLabel === "Chinning" ? "Chinning" : "Pull up", hasil: kali(result.pull_jumlah), nilai: result.pull_nilai },
    { key: "situp", label: "Sit up", short: "Sit up", hasil: kali(result.situp_jumlah), nilai: result.situp_nilai },
    { key: "pushup", label: "Push up", short: "Push up", hasil: kali(result.pushup_jumlah), nilai: result.pushup_nilai },
    { key: "shuttle", label: "Shuttle run 6 × 10 m", short: "Shuttle", hasil: result.shuttle_waktu === null ? "-" : `${fmt(result.shuttle_waktu, 1)} detik`, nilai: result.shuttle_nilai },
  ];
}

/** "Gaya bebas · 1:34", atau null bila renang belum diisi. */
export function renangText(result: SamaptaResult): string | null {
  const parts = [result.renang_gaya ? `Gaya ${result.renang_gaya.toLowerCase()}` : "", formatDuration(result.renang_waktu)].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

const mean = (values: (number | null)[]) => {
  const xs = values.filter((v): v is number => v !== null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};

export interface CompareGroup {
  label: string;
  a: number | null;
  b: number | null;
}

type Scored = { result: SamaptaResult; score: SamaptaScore };

/** Nilai per materi untuk dua tes (satu siswa). */
export function compareGroups(prev: Scored, cur: Scored): CompareGroup[] {
  const a = materiOf(prev.result, cur.score.pullLabel);
  const b = materiOf(cur.result, cur.score.pullLabel);
  return [...b.map((m, i) => ({ label: m.short, a: a[i]!.nilai, b: m.nilai })), { label: "Akhir", a: prev.score.akhir, b: cur.score.akhir }];
}

/** Rata-rata nilai per materi seluruh peserta untuk dua tes. */
export function averageGroups(prev: readonly Scored[], cur: readonly Scored[]): CompareGroup[] {
  const pick = (list: readonly Scored[], i: number) => mean(list.map((e) => materiOf(e.result, e.score.pullLabel)[i]!.nilai));
  const labels = ["Lari", "Pull/Chin", "Sit up", "Push up", "Shuttle"];
  return [
    ...labels.map((label, i) => ({ label, a: pick(prev, i), b: pick(cur, i) })),
    { label: "Akhir", a: mean(prev.map((e) => e.score.akhir)), b: mean(cur.map((e) => e.score.akhir)) },
  ];
}

const KLAS_ORDER: Record<Klasifikasi, number> = { Kurang: 0, Cukup: 1, Baik: 2, "Baik Sekali": 3 };

/** Kalimat singkat tentang perubahan dari tes sebelumnya ke tes ini (satu siswa). */
export function progressSentence(prev: Scored, cur: Scored): string {
  const a = materiOf(prev.result, cur.score.pullLabel);
  const b = materiOf(cur.result, cur.score.pullLabel);
  const items = b
    .map((m, i) => ({ label: m.label, d: m.nilai !== null && a[i]!.nilai !== null ? Math.round((m.nilai - a[i]!.nilai!) * 100) / 100 : null }))
    .filter((x): x is { label: string; d: number } => x.d !== null);
  const out: string[] = [];
  const pa = prev.score.akhir;
  const pb = cur.score.akhir;
  if (pa !== null && pb !== null) {
    const d = Math.round((pb - pa) * 100) / 100;
    out.push(
      d > 0
        ? `Hasil akhir naik ${fmt(d)} poin, dari ${fmt(pa)} menjadi ${fmt(pb)}.`
        : d < 0
          ? `Hasil akhir turun ${fmt(-d)} poin, dari ${fmt(pa)} menjadi ${fmt(pb)}.`
          : `Hasil akhir sama dengan tes sebelumnya (${fmt(pb)}).`,
    );
    const ka = prev.score.klas;
    const kb = cur.score.klas;
    if (ka && kb && ka !== kb) out.push(`Klasifikasi ${KLAS_ORDER[kb] > KLAS_ORDER[ka] ? "naik" : "turun"} dari ${ka} menjadi ${kb}.`);
  }
  if (items.length === 0) {
    out.push("Belum bisa dibandingkan per materi karena nilainya belum lengkap.");
    return out.join(" ");
  }
  const naik = items.filter((x) => x.d > 0).sort((x, y) => y.d - x.d);
  const turun = items.filter((x) => x.d < 0).sort((x, y) => x.d - y.d);
  if (naik.length) out.push(`Naik di ${naik.length} dari ${items.length} materi, paling banyak di ${naik[0]!.label} (+${fmt(naik[0]!.d)}).`);
  if (turun.length) out.push(`Perlu perhatian: ${turun.map((x) => `${x.label} turun ${fmt(-x.d)}`).join(", ")}.`);
  else if (naik.length < items.length) out.push(naik.length ? "Materi lain tetap, tidak ada yang turun." : "Semua materi tetap, tidak ada yang turun.");
  else out.push("Tidak ada materi yang turun.");
  return out.join(" ");
}

// ---------------------------------------------------------------- Isian per pos

/** Angka untuk kolom isian (koma desimal). */
export const decInput = (value: number | null) => (value === null ? "" : String(value).replace(".", ","));

/** Detik → isian: di bawah 60 "49,5"; selebihnya "1:05". */
export function durationInput(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds < 60) return decInput(seconds);
  const m = Math.floor(seconds / 60);
  const rest = Math.round((seconds - m * 60) * 10) / 10;
  return `${m}:${rest < 10 ? "0" : ""}${decInput(rest)}`;
}

/** Nilai awal kolom isian satu pos (nama kolom sama dengan POS_INFO[pos].fields). */
export function posInputValues(result: SamaptaResult, pos: Pos): Record<string, string> {
  switch (pos) {
    case "tensi":
      return {
        tensi_1: result.tensi[0],
        tensi_2: result.tensi[1],
        tensi_3: result.tensi[2],
        riwayat_1: result.riwayat[0],
        riwayat_2: result.riwayat[1],
        riwayat_3: result.riwayat[2],
      };
    case "badan":
      return { tinggi_cm: decInput(result.tinggi_cm), berat_kg: decInput(result.berat_kg) };
    case "lari":
      return { lari_jarak: decInput(result.lari_jarak), lari_nilai: decInput(result.lari_nilai) };
    case "pull":
      return { pull_jumlah: decInput(result.pull_jumlah), pull_nilai: decInput(result.pull_nilai) };
    case "situp":
      return { situp_jumlah: decInput(result.situp_jumlah), situp_nilai: decInput(result.situp_nilai) };
    case "pushup":
      return { pushup_jumlah: decInput(result.pushup_jumlah), pushup_nilai: decInput(result.pushup_nilai) };
    case "shuttle":
      return { shuttle_waktu: decInput(result.shuttle_waktu), shuttle_nilai: decInput(result.shuttle_nilai) };
    case "renang":
      return { renang_gaya: result.renang_gaya, renang_waktu: durationInput(result.renang_waktu) };
  }
}

/** Isian pos lengkap (cermin posFilled untuk teks di form). Riwayat kesehatan tidak wajib. */
export function isPosComplete(pos: Pos, values: Record<string, string>): boolean {
  const has = (key: string) => (values[key] ?? "").trim() !== "";
  switch (pos) {
    case "tensi":
      return has("tensi_1") && has("tensi_2") && has("tensi_3");
    case "badan":
      return has("tinggi_cm") && has("berat_kg");
    case "renang":
      return has("renang_gaya") && has("renang_waktu");
    default:
      return Object.keys(values).every(has);
  }
}

/** Tensi dari papan angka: "120.80", "120 80", atau "12080" → "120/80". Selain itu dibiarkan. */
export function normalizeTensi(text: string): string {
  const value = text.trim();
  if (!value) return "";
  const split = /^(\d{2,3})\s*[/.,\-\s]\s*(\d{2,3})$/.exec(value);
  if (split) return `${split[1]}/${split[2]}`;
  if (/^\d{4,6}$/.test(value)) {
    const cut = value.length === 4 ? 2 : 3;
    return `${value.slice(0, cut)}/${value.slice(cut)}`;
  }
  return value;
}

/** Waktu renang "1.05" atau "1,05" (menit.detik) → "1:05". Detik biasa dibiarkan. */
export function normalizeDuration(text: string): string {
  const value = text.trim();
  const mss = /^(\d)[.,]([0-5]\d)$/.exec(value);
  return mss ? `${mss[1]}:${mss[2]}` : value;
}
