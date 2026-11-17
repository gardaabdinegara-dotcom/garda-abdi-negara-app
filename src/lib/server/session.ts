import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { cookieOptions, createSessionToken, readSessionToken, SESSION_COOKIE } from "../auth/session";
import { resolveActor } from "../auth/actor";
import type { Actor, Role, User } from "../core/types";
import { deps } from "../deps";

/** Pengguna yang sedang masuk, atau null. Dihitung sekali per request. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const store = await cookies();
  const claims = readSessionToken(store.get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const tables = await deps().store.read("inti", ["Pengguna", "Tautan_Akun"]);
  return resolveActor(tables, claims);
});

/**
 * Untuk halaman dan Server Action yang butuh login. Mengalihkan ke /masuk bila belum masuk,
 * dan ke /ganti-password bila password sementara belum diganti.
 */
export async function requireActor(options: { roles?: Role[]; allowPasswordChange?: boolean } = {}): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/masuk");
  if (actor.user.wajib_ganti_password && !options.allowPasswordChange) redirect("/ganti-password");
  if (options.roles && !options.roles.includes(actor.user.peran)) redirect("/beranda");
  return actor;
}

export async function startSession(user: Pick<User, "user_id" | "versi_otorisasi">): Promise<void> {
  const { token, expires } = createSessionToken(user.user_id, user.versi_otorisasi);
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expires));
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "lokal";
}

export async function nonce(): Promise<string | undefined> {
  return (await headers()).get("x-nonce") ?? undefined;
}

/** Alamat tujuan setelah login: hanya jalur internal ("/..."), bukan situs lain. */
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\") || value.length > 2000) return null;
  return value;
}
