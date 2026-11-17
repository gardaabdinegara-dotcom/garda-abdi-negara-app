import { toUser, type User } from "../core/types";
import { AppError, type Limiter, type Store } from "../data/types";
import { dummyHash, verifyPassword } from "./password";

export const LOGIN_WINDOW_SECONDS = 15 * 60;
export const MAX_FAILS_PER_ACCOUNT = 5;
export const MAX_FAILS_PER_IP = 25;

const accountKey = (username: string) => `login:akun:${username}`;
const ipKey = (ip: string) => `login:ip:${ip}`;

const tooMany = () => new AppError("Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.", "RATE_LIMIT", 429);
const wrong = () => new AppError("Username atau password salah.", "LOGIN_FAILED", 401);

/**
 * Memeriksa username dan password dengan pembatasan percobaan per akun dan per alamat IP.
 * Pesan kegagalan selalu sama agar tidak membocorkan username mana yang terdaftar.
 */
export async function attemptLogin(
  deps: { store: Store; limiter: Limiter },
  input: { username: string; password: string; ip: string },
): Promise<User> {
  const username = input.username.trim().toLowerCase();
  if (!username || !input.password) throw wrong();
  if ((await deps.limiter.count(accountKey(username))) >= MAX_FAILS_PER_ACCOUNT) throw tooMany();
  if ((await deps.limiter.count(ipKey(input.ip))) >= MAX_FAILS_PER_IP) throw tooMany();

  const tables = await deps.store.read("inti", ["Pengguna"], { fresh: true });
  const user = tables.Pengguna!.map(toUser).find((u) => u.username.toLowerCase() === username);
  const valid = user && user.aktif ? await verifyPassword(input.password, user.password_hash) : (await verifyPassword(input.password, await dummyHash()), false);
  if (!user || !user.aktif || !valid) {
    await deps.limiter.hit(accountKey(username), LOGIN_WINDOW_SECONDS);
    await deps.limiter.hit(ipKey(input.ip), LOGIN_WINDOW_SECONDS);
    throw wrong();
  }
  await deps.limiter.reset(accountKey(username));
  return user;
}
