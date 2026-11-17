import { createUser, hasActiveOwner } from "./core/domain";
import type { UserCreateInput } from "./core/validation";
import { hashPassword, temporaryPassword } from "./auth/password";
import { runOperation } from "./data/coordinator";
import { DEFAULT_FINANCE_SETTINGS, DEFAULT_SETTINGS, INTI, KEUANGAN, type SpreadsheetKey, type TableDef } from "./data/schema";
import type { Deps } from "./deps";
import type { Row } from "./data/types";
import { randomUUID } from "node:crypto";

const settingRows = (values: Record<string, string | number>, now: string): Row[] =>
  Object.entries(values).map(([key, value]) => ({ key, value, updated_at: now, updated_by: "SISTEM" }));

const PLAN: { sheet: SpreadsheetKey; defs: TableDef[]; seed: () => Record<string, Row[]> }[] = [
  { sheet: "inti", defs: Object.values(INTI), seed: () => ({ Pengaturan: settingRows(DEFAULT_SETTINGS, new Date().toISOString()) }) },
  {
    sheet: "keuangan",
    defs: Object.values(KEUANGAN),
    seed: () => ({ Pengaturan_Keuangan: settingRows(DEFAULT_FINANCE_SETTINGS, new Date().toISOString()) }),
  },
];

export interface SetupReport {
  sheet: SpreadsheetKey;
  missing: string[];
  added: string[];
  /** Tab lama yang header-nya (perlu) dilengkapi kolom baru di ujung kanan. */
  extended: string[];
}

/**
 * Menyiapkan tab dan header kedua spreadsheet. Aman dijalankan berulang:
 * tab yang sudah ada tidak diubah dan tab lain (mis. Sheet1) tidak dihapus.
 */
export async function setupSheets(deps: Pick<Deps, "store">, apply: boolean): Promise<SetupReport[]> {
  const reports: SetupReport[] = [];
  for (const step of PLAN) {
    const existing = new Set(await deps.store.existingTables(step.sheet));
    const missing = step.defs.filter((def) => !existing.has(def.name)).map((def) => def.name);
    const added = apply && missing.length ? await deps.store.ensureTables(step.sheet, step.defs, step.seed()) : [];
    const extended = await deps.store.extendHeaders(step.sheet, step.defs, apply);
    // Membaca semua tab sekaligus memeriksa header yang sudah ada.
    if (apply || (missing.length === 0 && extended.length === 0)) await deps.store.read(step.sheet, step.defs.map((def) => def.name), { fresh: true });
    reports.push({ sheet: step.sheet, missing, added, extended });
  }
  return reports;
}

/** Membuat akun OWNER pertama dengan password sementara yang wajib diganti saat masuk. */
export async function createFirstOwner(deps: Deps, input: Pick<UserCreateInput, "username" | "nama">) {
  const existing = await deps.store.read("inti", ["Pengguna"], { fresh: true });
  if (hasActiveOwner(existing)) throw new Error("Sudah ada OWNER aktif. Tambahkan akun lain dari menu Pengaturan → Akun.");
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  const data: UserCreateInput = { username: input.username, nama: input.nama, peran: "OWNER", akses_keuangan: "TIDAK" };
  const result = await runOperation(deps, {
    sheet: "inti",
    operationId: randomUUID(),
    actorId: "SISTEM",
    action: "buatOwnerPertama",
    fingerprint: { username: data.username },
    tables: ["Pengguna"],
    apply: (t, ctx) => createUser(t, data, passwordHash, ctx, null),
  });
  return { userId: result.outcome.entityId, password };
}
