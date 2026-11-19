import { timingSafeEqual } from "node:crypto";
import { signFor } from "./session";

/** Masa berlaku QR presensi (PRD 4.2). */
export const QR_MINUTES = 10;
const purpose = (test?: string) => test ? `qr-uji-siswa-${test}` : "qr";

/** Token QR berisi ID sesi dan waktu kedaluwarsa, ditandatangani agar tidak bisa dipalsukan. */
export function createQrToken(sesiId: string, now = Date.now(), test?: string): { token: string; expires: number } {
  const expires = now + QR_MINUTES * 60_000;
  const payload = Buffer.from(JSON.stringify({ s: sesiId, e: expires })).toString("base64url");
  return { token: `${payload}.${signFor(purpose(test), payload)}`, expires };
}

/** Token tetap sah sekian menit setelah QR berganti, agar siswa yang baru memindai sempat mengirim. */
export const QR_GRACE_MINUTES = 5;

/**
 * QR layar penuh: berganti tiap QR_MINUTES mengikuti jam dinding (mis. 16.10, 16.20).
 * Dalam satu jendela tokennya sama persis, jadi layar boleh dimuat ulang tanpa mengganti QR.
 */
export function rotatingQrToken(sesiId: string, now = Date.now()): { token: string; rotatesAt: number } {
  const period = QR_MINUTES * 60_000;
  const start = Math.floor(now / period) * period;
  const { token } = createQrToken(sesiId, start + QR_GRACE_MINUTES * 60_000);
  return { token, rotatesAt: start + period };
}

/** Mengembalikan ID sesi bila token sah dan belum kedaluwarsa. */
export function readQrToken(token: string | undefined | null, now = Date.now(), test?: string): string | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(signFor(purpose(test), payload));
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
