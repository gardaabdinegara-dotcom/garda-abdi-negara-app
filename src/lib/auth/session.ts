import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const SESSION_COOKIE = "rg_sesi";
export const SESSION_HOURS = 8;

export interface SessionClaims {
  /** user_id */
  u: string;
  /** versi_otorisasi saat sesi dibuat; sesi gugur bila versi akun naik. */
  v: number;
  /** kedaluwarsa (epoch ms) */
  e: number;
}

let devSecret: string | undefined;

/**
 * Di luar produksi, bila AUTH_SECRET kosong, kunci acak dibuat sekali di .data/ (diabaikan git)
 * agar `npm run dev` langsung bisa dipakai. Produksi wajib mengisi AUTH_SECRET.
 */
function developmentSecret(): string {
  if (devSecret) return devSecret;
  const file = path.join(process.cwd(), ".data", "auth-secret-dev.txt");
  if (fs.existsSync(file)) devSecret = fs.readFileSync(file, "utf8").trim();
  if (!devSecret || devSecret.length < 32) {
    devSecret = randomBytes(48).toString("base64url");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, devSecret, { mode: 0o600 });
  }
  return devSecret;
}

function secret(): string {
  const value = process.env.AUTH_SECRET ?? "";
  if (value.length >= 32) return value;
  if (process.env.NODE_ENV !== "production" && !value) return developmentSecret();
  throw new Error("AUTH_SECRET belum diisi (minimal 32 karakter).");
}

/** Tanda tangan HMAC dengan tujuan berbeda agar token sesi dan token QR tidak bisa saling dipakai. */
export const signFor = (purpose: string, payload: string) => createHmac("sha256", secret()).update(`${purpose}:${payload}`).digest("base64url");

const sign = (payload: string) => signFor("sesi", payload);

export function createSessionToken(userId: string, versi: number, now = Date.now()): { token: string; expires: Date } {
  const claims: SessionClaims = { u: userId, v: versi, e: now + SESSION_HOURS * 3600_000 };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, expires: new Date(claims.e) };
}

/** Memeriksa tanda tangan dan masa berlaku. Validitas akun (aktif, versi) diperiksa terpisah. */
export function readSessionToken(token: string | undefined, now = Date.now()): SessionClaims | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionClaims;
    if (typeof claims.u !== "string" || typeof claims.v !== "number" || typeof claims.e !== "number") return null;
    return claims.e > now ? claims : null;
  } catch {
    return null;
  }
}

export function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}
