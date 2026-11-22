import "server-only";
import { cache } from "react";
import { str } from "../data/rows";
import { DEFAULT_SETTINGS } from "../data/schema";
import { dataDeps } from "./data";

const ZONA_SAH = new Set(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]);

/**
 * Zona waktu lembaga dari Pengaturan → Lembaga (WIB, WITA, atau WIT), dibaca sekali per permintaan.
 * Dipakai tampilan yang menulis tanggal atau jam dari waktu sekarang/cap waktu, agar semuanya ikut pengaturan.
 * Bila Pengaturan gagal dibaca, tampilan tetap jalan dengan WIB.
 */
export const zonaLembaga = cache(async (): Promise<string> => {
  try {
    const t = await (await dataDeps()).store.read("inti", ["Pengaturan"]);
    const value = str((t.Pengaturan ?? []).find((row) => row.key === "zona_waktu")?.value ?? DEFAULT_SETTINGS.zona_waktu);
    return ZONA_SAH.has(value) ? value : "Asia/Jakarta";
  } catch {
    return "Asia/Jakarta";
  }
});
