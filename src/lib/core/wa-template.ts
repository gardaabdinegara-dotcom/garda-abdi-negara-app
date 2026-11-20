// Menyimpan template pesan WhatsApp (Pengaturan → Pesan WA). Isi kosong berarti memakai template bawaan.
import { z } from "zod";
import type { OperationContext, OperationOutcome } from "../data/coordinator";
import { AppError, type Tables } from "../data/types";
import { canManageInstitution } from "./permissions";
import { find, forbidden, replace, rows, updated } from "./table-ops";
import type { Actor } from "./types";
import { WA_JENIS, WA_JENIS_LABEL, WA_TEMPLATE_DEFAULT, WA_TEMPLATE_FIELDS, WA_TEMPLATE_KEY, WA_TEMPLATE_MAX, type WaJenis } from "./wa";

export const waTemplateInput = z.object({
  jenis: z.enum(WA_JENIS, { message: "Pilih jenis pesan." }),
  /** "bawaan" mengembalikan template bawaan tanpa melihat isi teks. */
  aksi: z.enum(["simpan", "bawaan"]).catch("simpan"),
  teks: z
    .string()
    .default("")
    .transform((text) => text.replace(/\r\n?/g, "\n").trim())
    .pipe(z.string().max(WA_TEMPLATE_MAX, `Pesan maksimal ${WA_TEMPLATE_MAX} karakter.`)),
});

export type WaTemplateInput = z.infer<typeof waTemplateInput>;

/** Kode {isian} di teks yang tidak dikenal untuk jenis pesan ini. */
export function unknownWaFields(jenis: WaJenis, text: string): string[] {
  const known = new Set(WA_TEMPLATE_FIELDS[jenis].map((field) => field.kode));
  return [...new Set([...text.matchAll(/\{([^{}\s]*)\}/g)].map((match) => match[1]!))].filter((kode) => !known.has(kode));
}

export function saveWaTemplate(t: Tables, input: WaTemplateInput, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!canManageInstitution(actor)) throw forbidden("Hanya owner yang dapat mengubah template pesan WA.");
  const key = WA_TEMPLATE_KEY[input.jenis];
  const label = WA_JENIS_LABEL[input.jenis];
  let value = "";
  if (input.aksi === "simpan") {
    if (!input.teks) throw new AppError("Teks pesan wajib diisi. Pakai Kembalikan bawaan untuk memakai teks bawaan.");
    const unknown = unknownWaFields(input.jenis, input.teks);
    if (unknown.length) {
      const list = unknown.map((kode) => `{${kode}}`).join(", ");
      throw new AppError(`Isian ${list} tidak dikenal. Pakai isian dari daftar di bawah kotak pesan.`);
    }
    // Sama dengan bawaan disimpan kosong agar perbaikan teks bawaan berikutnya ikut terpakai.
    value = input.teks === WA_TEMPLATE_DEFAULT[input.jenis] ? "" : input.teks;
  }
  const found = find(t, "Pengaturan", "key", key);
  const row = { key, value, ...updated(ctx) };
  if (found) replace(t, "Pengaturan", found.index, { ...found.row, ...row });
  else rows(t, "Pengaturan").push(row);
  return {
    entityType: "Pengaturan",
    entityId: key,
    message: value ? `Template pesan ${label} disimpan.` : `Template pesan ${label} memakai teks bawaan.`,
    before: found?.row ?? null,
    after: row,
  };
}
