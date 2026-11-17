// Validasi kiriman hasil latihan dari HP. Batas kewajaran per jenis/durasi diperiksa lagi di saveLatihan.
import { z } from "zod";
import { DURASI_LATIHAN, JENIS_LATIHAN, type Bagian } from "./latihan";

const seri = z
  .string()
  .max(4000, "Data latihan terlalu panjang.")
  .transform((text, ctx): Bagian[] => {
    try {
      const raw = JSON.parse(text) as unknown;
      if (Array.isArray(raw) && raw.length >= 1 && raw.length <= 60 && raw.every((x) => Array.isArray(x) && x.length === 2 && x.every(Number.isInteger))) {
        return (raw as [number, number][]).map(([benar, jawab]) => ({ benar, jawab }));
      }
    } catch {
      // jatuh ke pesan di bawah
    }
    ctx.addIssue({ code: "custom", message: "Data latihan tidak terbaca." });
    return z.NEVER;
  });

export const latihanInput = z.object({
  jenis: z.enum(JENIS_LATIHAN, { message: "Jenis latihan tidak dikenal." }),
  durasi: z.enum(DURASI_LATIHAN, { message: "Durasi latihan tidak dikenal." }),
  mulai: z.string().max(40).default(""),
  detik: z.coerce.number().int().min(5).max(4000),
  seri,
});
