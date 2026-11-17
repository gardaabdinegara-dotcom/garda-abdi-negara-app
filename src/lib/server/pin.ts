import "server-only";
import { needsPin } from "../core/pin";
import { toUser, type User } from "../core/types";
import { deps } from "../deps";

/** Akun siswa aktif yang belum ber-PIN dengan username ini, atau null. */
export async function pinSetupTarget(username: string): Promise<User | null> {
  const name = username.trim().toLowerCase();
  if (!name) return null;
  const tables = await deps().store.read("inti", ["Pengguna"], { fresh: true });
  const user = (tables.Pengguna ?? []).map(toUser).find((u) => u.username.toLowerCase() === name);
  return user && needsPin(user) ? user : null;
}
