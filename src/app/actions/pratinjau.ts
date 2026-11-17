"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cookieOptions } from "@/lib/auth/session";
import { PRATINJAU_COOKIE, resetDemo } from "@/lib/server/data";
import { requireActor } from "@/lib/server/session";

const ADMIN = { roles: ["OWNER", "ADMIN"] as ("OWNER" | "ADMIN")[] };

/** Menyalakan mode pratinjau (data contoh) untuk browser ini selama 4 jam. */
export async function nyalakanPratinjau(): Promise<void> {
  await requireActor(ADMIN);
  (await cookies()).set(PRATINJAU_COOKIE, "1", cookieOptions(new Date(Date.now() + 4 * 3600_000)));
  redirect("/beranda");
}

/** Kembali ke data asli (spreadsheet lembaga). */
export async function matikanPratinjau(): Promise<void> {
  await requireActor(ADMIN);
  (await cookies()).delete(PRATINJAU_COOKIE);
  redirect("/pengaturan/pratinjau");
}

/** Membuang perubahan di data contoh dan memulai dari data contoh yang segar. */
export async function aturUlangPratinjau(): Promise<void> {
  await requireActor(ADMIN);
  resetDemo();
  redirect("/beranda");
}
