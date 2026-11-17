import { timingSafeEqual } from "node:crypto";
import { signFor } from "./session";

/** Masa berlaku QR presensi (PRD 4.2). */
export const QR_MINUTES = 10;

/** Token QR berisi ID sesi dan waktu kedaluwarsa, ditandatangani agar tidak bisa dipalsukan. */
export function createQrToken(sesiId: string, now = Date.now()): { token: string; expires: number } {
  const expires = now + QR_MINUTES * 60_000;
  const payload = Buffer.from(JSON.stringify({ s: sesiId, e: expires })).toString("base64url");
  return { token: `${payload}.${signFor("qr", payload)}`, expires };
}

/** Mengembalikan ID sesi bila token sah dan belum kedaluwarsa. */
export function readQrToken(token: string | undefined | null, now = Date.now()): string | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(signFor("qr", payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as { s?: unknown; e?: unknown };
    if (typeof value.s !== "string" || typeof value.e !== "number") return null;
    return value.e > now ? value.s : null;
  } catch {
    return null;
  }
}
