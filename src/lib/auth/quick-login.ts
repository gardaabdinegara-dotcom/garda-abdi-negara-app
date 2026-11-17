import { dataMode } from "../config";
import { ROLES, type User } from "../core/types";

/**
 * Masuk cepat tanpa password, khusus uji coba di komputer sendiri.
 * Hanya aktif bila server berjalan lewat `npm run dev` (NODE_ENV=development) DAN memakai data lokal.
 * Build produksi (`npm start`, Vercel) atau mode Google Sheets selalu mematikannya.
 * Set MASUK_CEPAT=0 untuk mematikannya juga saat development (mis. untuk menguji halaman masuk biasa).
 */
export function quickLoginAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "development" && dataMode(env) === "lokal" && env.MASUK_CEPAT?.trim() !== "0";
}

/** Akun aktif untuk tombol masuk cepat, urut menurut peran lalu nama. */
export function quickLoginUsers(users: User[]): User[] {
  const order = new Map<string, number>(ROLES.map((role, i) => [role, i]));
  return users
    .filter((user) => user.aktif)
    .sort((a, b) => (order.get(a.peran) ?? 99) - (order.get(b.peran) ?? 99) || a.nama.localeCompare(b.nama, "id"));
}
