import fs from "node:fs";
import path from "node:path";
import type { SpreadsheetKey } from "./data/schema";
import { AppError } from "./data/types";

export type DataMode = "sheets" | "lokal";

export interface ServiceAccount {
  clientEmail: string;
  privateKey: string;
}

function readServiceAccount(): ServiceAccount | null {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  const raw = inline || (file && fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
    if (!parsed.client_email || !parsed.private_key) throw new Error("kolom tidak lengkap");
    return { clientEmail: parsed.client_email, privateKey: parsed.private_key };
  } catch {
    throw new AppError("JSON service account tidak valid. Salin ulang seluruh isi file kunci.", "CONFIG", 503);
  }
}

export function dataMode(env: NodeJS.ProcessEnv = process.env): DataMode {
  const requested = env.DATA_MODE?.trim();
  if (requested === "sheets" || requested === "lokal") return requested;
  return env.GOOGLE_SERVICE_ACCOUNT_JSON || env.GOOGLE_SERVICE_ACCOUNT_FILE ? "sheets" : "lokal";
}

export function sheetsConfig() {
  const account = readServiceAccount();
  if (!account) throw new AppError("Service account belum dikonfigurasi (GOOGLE_SERVICE_ACCOUNT_JSON).", "CONFIG", 503);
  const ids: Record<SpreadsheetKey, string> = {
    inti: process.env.SHEET_ID_INTI?.trim() ?? "",
    keuangan: process.env.SHEET_ID_KEUANGAN?.trim() ?? "",
  };
  if (!ids.inti || !ids.keuangan) throw new AppError("SHEET_ID_INTI dan SHEET_ID_KEUANGAN wajib diisi.", "CONFIG", 503);
  return { ...account, spreadsheetIds: ids, timeZone: timeZone() };
}

export const timeZone = () => process.env.APP_TIMEZONE?.trim() || "Asia/Jakarta";

export const redisConfigured = () => Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

export const localDataFile = () => path.join(process.cwd(), ".data", "lokal.json");

/** Memuat .env.local untuk skrip baris perintah (Next memuatnya sendiri saat aplikasi berjalan). */
export function loadEnvForScripts(): void {
  const file = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(file)) process.loadEnvFile(file);
}
