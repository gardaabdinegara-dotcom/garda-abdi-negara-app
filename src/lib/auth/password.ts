import { randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (password: string, salt: string, keylen: number, options: object) => Promise<Buffer>;

/** Biaya scrypt. Nilai produksi mengikuti aplikasi Presensi; tes boleh menurunkannya lewat SCRYPT_N. */
const cost = () => Number(process.env.SCRYPT_N || 131072);

export async function hashPassword(password: string): Promise<string> {
  const n = cost();
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64, { N: n, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  return `scrypt$${n}$8$1$${salt}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (typeof password !== "string" || password.length > 128) return false;
  const parts = String(encoded || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, expected] = parts as [string, string, string, string, string, string];
  const result = await scrypt(password, salt, 64, { N: Number(n), r: Number(r), p: Number(p), maxmem: 256 * 1024 * 1024 });
  const want = Buffer.from(expected, "hex");
  return want.length === result.length && timingSafeEqual(want, result);
}

/** Hash tiruan agar waktu respons login sama walau username tidak ditemukan. */
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(12).toString("hex"));
  return dummy;
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Password sementara 16 karakter tanpa huruf yang mudah tertukar (l, 1, O, 0). Selalu memuat angka. */
export function temporaryPassword(length = 16): string {
  for (;;) {
    let out = "";
    for (let i = 0; i < length; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
    if (/\d/.test(out) && /[a-zA-Z]/.test(out)) return out;
  }
}
