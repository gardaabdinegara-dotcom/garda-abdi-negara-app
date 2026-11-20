import "server-only";
import type { Row } from "@/lib/data/types";
import { dataDeps } from "@/lib/server/data";

/** Baris tab Pengaturan apa adanya (template pesan WA tersimpan di sana). */
export async function loadSettingRows(): Promise<Row[]> {
  const t = await (await dataDeps()).store.read("inti", ["Pengaturan"]);
  return t.Pengaturan ?? [];
}
