// Pemeriksaan konfigurasi tanpa pernah menampilkan nilai rahasia. Dipakai `npm run cek:env`
// dan halaman Pengaturan → Sistem.
import fs from "node:fs";

export interface EnvItem {
  key: string;
  label: string;
  ok: boolean;
  /** Wajib untuk kondisi yang diperiksa (produksi atau mode Sheets). */
  required: boolean;
  detail: string;
}

/** Hanya beberapa karakter terakhir, cukup untuk mengenali ID tanpa membukanya utuh. */
export const mask = (value: string | undefined) => (value ? `…${value.slice(-6)}` : "");

function serviceAccount(env: NodeJS.ProcessEnv): { ok: boolean; detail: string } {
  const inline = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const file = env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  if (!inline && !file) return { ok: false, detail: "Belum diisi (GOOGLE_SERVICE_ACCOUNT_JSON atau GOOGLE_SERVICE_ACCOUNT_FILE)." };
  try {
    const raw = inline || fs.readFileSync(file!, "utf8");
    const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
    if (!parsed.client_email || !parsed.private_key) return { ok: false, detail: "JSON tidak lengkap (client_email/private_key)." };
    return { ok: true, detail: `Bagikan kedua spreadsheet sebagai Editor ke ${parsed.client_email}` };
  } catch {
    return { ok: false, detail: inline ? "Isi GOOGLE_SERVICE_ACCOUNT_JSON bukan JSON yang valid." : "File kunci tidak bisa dibaca." };
  }
}

export function checkEnvironment(env: NodeJS.ProcessEnv = process.env, production = env.NODE_ENV === "production"): EnvItem[] {
  const requested = env.DATA_MODE?.trim() ?? "";
  const sa = serviceAccount(env);
  const mode = requested === "sheets" || requested === "lokal" ? requested : sa.ok ? "sheets" : "lokal";
  const sheets = mode === "sheets";
  const secret = env.AUTH_SECRET ?? "";
  const inti = env.SHEET_ID_INTI?.trim();
  const keuangan = env.SHEET_ID_KEUANGAN?.trim();
  const zone = env.APP_TIMEZONE?.trim() || "Asia/Jakarta";
  const redis = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
  return [
    {
      key: "DATA_MODE",
      label: "Mode data",
      ok: !(production && mode === "lokal" && env.ALLOW_LOCAL_DATA !== "1"),
      required: production,
      detail: mode === "sheets" ? "Google Sheets" : "Lokal (.data/lokal.json), hanya untuk mencoba di komputer sendiri",
    },
    { key: "GOOGLE_SERVICE_ACCOUNT", label: "Service account Google", ok: sa.ok, required: sheets, detail: sa.detail },
    { key: "SHEET_ID_INTI", label: "Spreadsheet Inti & Akademik", ok: Boolean(inti), required: sheets, detail: inti ? `ID ${mask(inti)}` : "Belum diisi." },
    {
      key: "SHEET_ID_KEUANGAN",
      label: "Spreadsheet Keuangan",
      ok: Boolean(keuangan),
      required: sheets,
      detail: keuangan ? `ID ${mask(keuangan)}${keuangan === inti ? " (sama dengan Inti: mode spreadsheet latihan)" : ""}` : "Belum diisi.",
    },
    {
      key: "AUTH_SECRET",
      label: "Secret sesi",
      ok: secret.length >= 32,
      required: production,
      detail: secret.length >= 32 ? `Terisi (${secret.length} karakter)` : secret ? "Terlalu pendek, minimal 32 karakter." : "Belum diisi (di komputer sendiri dibuat otomatis di .data/).",
    },
    {
      key: "UPSTASH_REDIS",
      label: "Redis Upstash",
      ok: redis,
      // Opsional: tanpa Redis, batas salah PIN disimpan di tab Batas_Masuk (murni spreadsheet).
      required: false,
      detail: redis
        ? "Terisi"
        : "Tidak dipakai (murni spreadsheet). Batas salah PIN disimpan di tab Batas_Masuk. Jalankan aplikasi di satu server agar penyimpanan bersamaan tidak bertabrakan.",
    },
    {
      key: "APP_TIMEZONE",
      label: "Zona waktu aplikasi",
      ok: ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"].includes(zone),
      required: true,
      detail: zone,
    },
  ];
}

export const envReady = (items: EnvItem[]) => items.every((item) => item.ok || !item.required);
