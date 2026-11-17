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

/** Password awal bawaan akun owner; wajib diganti saat pertama masuk (aktivasi). */
export const DEFAULT_OWNER_PASSWORD = "admin";

/**
 * Mengatur password AWAL akun owner/admin dan mewajibkan penggantian saat masuk berikutnya.
 * Semua sesi akun itu langsung berakhir (versi otorisasi naik). Password baru saat aktivasi tetap harus
 * diisi bebas, asal berbeda dari password awal.
 */
export async function setInitialOwnerPassword(deps: Deps, username: string, password = DEFAULT_OWNER_PASSWORD) {
  if (!password) throw new Error("Password awal tidak boleh kosong.");
  const passwordHash = await hashPassword(password);
  const name = username.trim().toLowerCase();
  return runOperation(deps, {
    sheet: "inti",
    operationId: randomUUID(),
    actorId: "SISTEM",
    action: "aturPasswordAwal",
    fingerprint: { username: name, at: Date.now() },
    tables: ["Pengguna"],
    apply: (t) => {
      const list = t.Pengguna ?? [];
      const index = list.findIndex((row) => String(row.username).toLowerCase() === name);
      const row = list[index];
      if (!row) throw new Error(`Akun ${name} tidak ditemukan.`);
      if (row.peran !== "OWNER" && row.peran !== "ADMIN") throw new Error("Password awal hanya untuk akun owner/admin. Siswa memakai Reset PIN.");
      list[index] = {
        ...row,
        password_hash: passwordHash,
        wajib_ganti_password: true,
        aktif: true,
        versi_otorisasi: Number(row.versi_otorisasi || 1) + 1,
        updated_at: new Date().toISOString(),
        updated_by: "SISTEM",
      };
      return { entityType: "Pengguna", entityId: String(row.user_id), message: "Password awal diatur; wajib diganti saat masuk." };
    },
  });
}

