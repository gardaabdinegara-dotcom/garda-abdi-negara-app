import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { localClock } from "../core/akademik";
import type { User } from "../core/types";
import { MemoryGate, MemoryLimiter } from "../data/gate";
import { MemoryStore } from "../data/memory-store";
import { deps, type Deps } from "../deps";
import { buildDemoData } from "../demo/data-contoh";
import { getActor } from "./session";

/** Cookie penanda mode pratinjau (data contoh). Hanya berlaku untuk akun owner/admin. */
export const PRATINJAU_COOKIE = "rg_pratinjau";

const canPreview = (user: User) => user.peran === "OWNER" || user.peran === "ADMIN";

type DemoHolder = { __ruangGardaDemo?: { day: string; deps: Deps } };
const holder = globalThis as DemoHolder;

/**
 * Penyimpanan data contoh di memori server, dibuat ulang tiap hari (atau saat diatur ulang).
 * Tidak pernah menyentuh Google Sheets. Perubahan di pratinjau bisa hilang saat server dimulai ulang.
 */
async function demoDeps(viewer: User): Promise<Deps> {
  const day = localClock("Asia/Jakarta", new Date().toISOString()).date;
  if (!holder.__ruangGardaDemo || holder.__ruangGardaDemo.day !== day) {
    const data = buildDemoData(viewer);
    holder.__ruangGardaDemo = { day, deps: { store: new MemoryStore({ initial: data }), gate: new MemoryGate(), limiter: new MemoryLimiter() } };
  }
  const demo = holder.__ruangGardaDemo.deps;
  // Admin lain yang membuka pratinjau ikut dimasukkan agar perintah atas namanya berjalan.
  const before = await demo.store.read("inti", ["Pengguna"]);
  if (!before.Pengguna!.some((u) => u.user_id === viewer.user_id)) {
    const now = new Date().toISOString();
    const after = { Pengguna: [...before.Pengguna!, { ...(viewer as unknown as Record<string, string | number | boolean>), password_hash: "", created_at: now, created_by: "SISTEM", updated_at: now, updated_by: "SISTEM" }] };
    await demo.store.commit("inti", before, after);
  }
  return demo;
}

/** Membuang data contoh; pratinjau berikutnya mulai dari data contoh yang segar. */
export function resetDemo(): void {
  delete holder.__ruangGardaDemo;
}

/**
 * Sumber data untuk request ini: data contoh bila owner/admin sedang dalam mode pratinjau,
 * selain itu spreadsheet lembaga. Login dan akun selalu memakai spreadsheet asli.
 */
export const dataDeps = cache(async (): Promise<Deps> => {
  const actor = await getActor();
  if (!actor || !canPreview(actor.user)) return deps();
  const on = (await cookies()).get(PRATINJAU_COOKIE)?.value === "1";
  return on ? demoDeps(actor.user) : deps();
});

/** Apakah request ini sedang memakai data contoh. */
export const isPreview = cache(async (): Promise<boolean> => (await dataDeps()) !== deps());
