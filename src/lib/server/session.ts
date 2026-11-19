import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { cookieOptions, createSessionToken, readSessionToken, SESSION_COOKIE } from "../auth/session";
import { resolveActor } from "../auth/actor";
import { canTestAsStudent, createUjiSiswaToken, readUjiSiswaToken, UJI_SISWA_CHANGE_PREFIX, UJI_SISWA_COOKIE } from "../auth/uji-siswa";
import { toLink, toUser, type Actor, type Role, type User } from "../core/types";
import { UJI_SISWA_FIELD } from "../core/uji-siswa";
import { MemoryGate, MemoryLimiter } from "../data/gate";
import { AppError } from "../data/types";
import { UjiSiswaStore } from "../data/uji-siswa-store";
import { buildSiswaUji } from "../demo/siswa-uji";
import { deps, type Deps } from "../deps";

interface Login {
  actor: Actor;
  token: string;
  expires: Date;
}

type UjiSiswa = { status: "aktif"; id: string; actor: Actor; source: Deps } | { status: "berakhir" };

/** Akun yang memegang sesi login asli, termasuk saat tampilan berganti ke siswa uji. */
export const getLogin = cache(async (): Promise<Login | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = readSessionToken(token);
  if (!token || !claims) return null;
  const tables = await deps().store.read("inti", ["Pengguna", "Tautan_Akun"]);
  const actor = resolveActor(tables, claims);
  return actor ? { actor, token, expires: new Date(claims.e) } : null;
});

export const getUjiSiswa = cache(async (): Promise<UjiSiswa | null> => {
  const jar = await cookies();
  const marker = jar.get(UJI_SISWA_COOKIE)?.value;
  if (marker === undefined) return null;
  const login = await getLogin();
  const claims = login && readUjiSiswaToken(marker, login.token);
  if (!login || !canTestAsStudent(login.actor.user) || !claims) return { status: "berakhir" };
  const prefix = `${UJI_SISWA_CHANGE_PREFIX}${claims.id}_`;
  const entries = jar.getAll().filter(({ name }) => name.startsWith(prefix));
  try {
    const { data, userId } = await buildSiswaUji(claims.started);
    const store = new UjiSiswaStore(data, marker, prefix, entries, ({ name, value }) => {
      jar.set(name, value, cookieOptions(login.expires));
    });
    const tables = await store.read("inti", ["Pengguna", "Tautan_Akun"]);
    const user = toUser(tables.Pengguna!.find((row) => row.user_id === userId)!);
    const links = tables.Tautan_Akun!.map(toLink).filter((link) => link.user_id === userId && link.aktif);
    return { status: "aktif", id: claims.id, actor: { user, links }, source: { store, gate: new MemoryGate(), limiter: new MemoryLimiter() } };
  } catch (error) {
    if (error instanceof AppError && error.code === "UJI_SISWA_INVALID") return { status: "berakhir" };
    throw error;
  }
});

/** Identitas yang dipakai halaman dan aturan akses setelah login. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const login = await getLogin();
  if (!login) return null;
  const test = await getUjiSiswa();
  if (test?.status === "aktif") return test.actor;
  if (test?.status === "berakhir") redirect("/uji-siswa/berakhir");
  return login.actor;
});

/** Tolak kiriman dari tab lama sebelum perintah mendapat akses tulis. */
export async function matchUjiSiswaForm(formData: FormData) {
  const test = await getUjiSiswa();
  const submitted = formData.get(UJI_SISWA_FIELD) ?? "";
  if (test?.status === "berakhir" || submitted !== (test?.id ?? "")) {
    throw new AppError("Mode akun sudah berubah. Muat ulang halaman sebelum mengirim lagi.", "UJI_SISWA_CHANGED", 409);
  }
  return test;
}

export async function startUjiSiswa(login: Login): Promise<void> {
  if (!canTestAsStudent(login.actor.user)) redirect("/beranda");
  await endUjiSiswa();
  // Penanda bertahan hingga login habis agar tab uji yang kedaluwarsa tidak beralih ke data asli.
  (await cookies()).set(UJI_SISWA_COOKIE, createUjiSiswaToken(login.token), cookieOptions(login.expires));
}

export async function endUjiSiswa(): Promise<void> {
  const jar = await cookies();
  for (const { name } of jar.getAll()) {
    if (name === UJI_SISWA_COOKIE || name.startsWith(UJI_SISWA_CHANGE_PREFIX)) jar.delete(name);
  }
}

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
  await endUjiSiswa();
  const { token, expires } = createSessionToken(user.user_id, user.versi_otorisasi);
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expires));
}

export async function endSession(): Promise<void> {
  await endUjiSiswa();
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
