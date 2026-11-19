import { randomUUID, timingSafeEqual } from "node:crypto";
import type { User } from "../core/types";
import { signFor } from "./session";

export const UJI_SISWA_COOKIE = "rg_uji_siswa";
export const UJI_SISWA_CHANGE_PREFIX = "rg_us_";

const FOUR_HOURS = 4 * 3600_000;

export interface UjiSiswaClaims {
  id: string;
  started: number;
}

export const canTestAsStudent = (user: User) =>
  !user.wajib_ganti_password && (user.peran === "OWNER" || user.peran === "ADMIN");

export function createUjiSiswaToken(loginToken: string, now = Date.now()): string {
  const id = randomUUID().replaceAll("-", "");
  const payload = `${id}.${now}`;
  return `${payload}.${signFor("uji-siswa", `${payload}:${loginToken}`)}`;
}

export function readUjiSiswaToken(token: string, loginToken: string, now = Date.now()): UjiSiswaClaims | null {
  const [id, timestamp, mac, extra] = token.split(".");
  if (extra !== undefined || !id || !/^[a-f0-9]{32}$/.test(id) || !timestamp || !/^\d+$/.test(timestamp) || !mac) return null;
  const started = Number(timestamp);
  if (started > now || started + FOUR_HOURS <= now) return null;
  const expected = Buffer.from(signFor("uji-siswa", `${id}.${timestamp}:${loginToken}`));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given) ? { id, started } : null;
}
