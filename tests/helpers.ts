// Alat bantu tes: penyimpanan palsu di memori, pengguna contoh, dan konteks operasi.
process.env.SCRYPT_N ??= "1024"; // hash cepat untuk tes; produksi tetap 131072
process.env.AUTH_SECRET ??= "rahasia-tes-yang-cukup-panjang-untuk-hmac-0123456789";

import { randomUUID } from "node:crypto";
import type { OperationContext } from "../src/lib/data/coordinator";
import { MemoryGate, MemoryLimiter } from "../src/lib/data/gate";
import { MemoryStore } from "../src/lib/data/memory-store";
import { INTI } from "../src/lib/data/schema";
import type { Tables } from "../src/lib/data/types";
import type { AccountLink, Actor, FinanceAccess, LinkType, Role, User } from "../src/lib/core/types";
import { setupSheets } from "../src/lib/setup";

export const INTI_TABLES = Object.values(INTI).map((def) => def.name);

export async function freshDeps() {
  const deps = { store: new MemoryStore(), gate: new MemoryGate(), limiter: new MemoryLimiter() };
  await setupSheets(deps, true);
  return deps;
}

/** Semua tab inti dalam keadaan kosong (Pengaturan berisi nilai bawaan). */
export async function emptyTables(): Promise<Tables> {
  const deps = await freshDeps();
  const tables = await deps.store.read("inti", INTI_TABLES.filter((name) => name !== "Operasi"));
  return tables;
}

let counter = 0;
export function ctx(actorId = "USR_tes"): OperationContext {
  return {
    actorId,
    now: "2026-11-13T03:00:00.000Z",
    operationId: randomUUID(),
    newId: (prefix) => `${prefix}_${(++counter).toString().padStart(6, "0")}`,
  };
}

export function user(peran: Role, overrides: Partial<User> = {}): User {
  const id = overrides.user_id ?? `USR_${peran.toLowerCase()}_${++counter}`;
  return {
    user_id: id,
    username: overrides.username ?? id.toLowerCase(),
    nama: `Pengguna ${peran}`,
    peran,
    password_hash: "",
    wajib_ganti_password: false,
    versi_otorisasi: 1,
    akses_keuangan: "TIDAK",
    aktif: true,
    terakhir_masuk: "",
    ...overrides,
  };
}

export function link(jenis: LinkType, target: { siswa_id?: string; kelas_id?: string }, aktif = true): AccountLink {
  return { tautan_id: `TAU_${++counter}`, user_id: "", jenis, siswa_id: target.siswa_id ?? "", kelas_id: target.kelas_id ?? "", aktif };
}

export function actor(peran: Role, options: { akses?: FinanceAccess; links?: AccountLink[]; user?: Partial<User> } = {}): Actor {
  const u = user(peran, { akses_keuangan: options.akses ?? "TIDAK", ...options.user });
  return { user: u, links: (options.links ?? []).map((l) => ({ ...l, user_id: u.user_id })) };
}

/** Menyimpan pengguna ke tabel agar perintah domain bisa menemukannya. */
export function putUser(t: Tables, u: User): User {
  t.Pengguna!.push({ ...u });
  return u;
}
