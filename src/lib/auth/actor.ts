import { toLink, toUser, type Actor } from "../core/types";
import type { Tables } from "../data/types";
import type { SessionClaims } from "./session";

/**
 * Menentukan pengguna dari klaim sesi yang tanda tangannya sudah sah.
 * Sesi gugur bila akun tidak ada, nonaktif, atau versi otorisasinya sudah naik
 * (ganti password, password sementara baru, ganti peran/akses, atau cabut sesi).
 */
export function resolveActor(tables: Tables, claims: SessionClaims | null): Actor | null {
  if (!claims) return null;
  const user = (tables.Pengguna ?? []).map(toUser).find((u) => u.user_id === claims.u);
  if (!user || !user.aktif || user.versi_otorisasi !== claims.v) return null;
  const links = (tables.Tautan_Akun ?? []).map(toLink).filter((link) => link.user_id === user.user_id && link.aktif);
  return { user, links };
}
