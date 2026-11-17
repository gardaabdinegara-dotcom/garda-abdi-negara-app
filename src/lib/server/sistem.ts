import "server-only";
import { dataMode } from "../config";
import { SCHEMA, OPERATION_TABLE, type SpreadsheetKey } from "../data/schema";
import { AppError } from "../data/types";
import { deps } from "../deps";
import { checkEnvironment, envReady } from "../env-check";

export interface SheetStatus {
  sheet: SpreadsheetKey;
  label: string;
  ok: boolean;
  missing: string[];
  extra: string[];
  error: string;
}

/** Status konfigurasi dan kedua spreadsheet: tab yang kurang dan header yang berubah. */
export async function loadSystemStatus() {
  const env = checkEnvironment();
  const sheets: SheetStatus[] = [];
  for (const sheet of ["inti", "keuangan"] as const) {
    const label = sheet === "inti" ? "Inti & Akademik" : "Keuangan";
    try {
      const store = deps().store;
      const existing = new Set(await store.existingTables(sheet));
      const expected = Object.keys(SCHEMA[sheet]);
      const missing = expected.filter((name) => !existing.has(name));
      let error = "";
      // Tab lama yang hanya kekurangan kolom baru di ujung kanan: cukup dilengkapi lewat setup, bukan dipulihkan manual.
      const toExtend = await store.extendHeaders(sheet, Object.values(SCHEMA[sheet]), false);
      if (toExtend.length) error = `Tab ${toExtend.join(", ")} perlu kolom baru di ujung kanan. Jalankan npm run setup:sheets -- --apply (data lama tidak diubah).`;
      if (missing.length === 0 && !error) {
        try {
          await store.read(sheet, expected.filter((name) => name !== OPERATION_TABLE[sheet]), { fresh: true });
        } catch (e) {
          error = e instanceof AppError ? e.message : "Tab tidak bisa dibaca.";
        }
      }
      sheets.push({ sheet, label, ok: missing.length === 0 && !error, missing, extra: [...existing].filter((name) => !expected.includes(name)), error });
    } catch (e) {
      sheets.push({ sheet, label, ok: false, missing: [], extra: [], error: e instanceof AppError ? e.message : "Spreadsheet tidak bisa dihubungi." });
    }
  }
  return { mode: dataMode(), env, envOk: envReady(env), sheets, checkedAt: new Date().toISOString() };
}
