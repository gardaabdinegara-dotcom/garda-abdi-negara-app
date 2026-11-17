// Alat bantu bersama untuk perintah domain yang mengubah salinan tabel di memori.
import type { OperationContext } from "../data/coordinator";
import { AppError, type Row, type Tables } from "../data/types";

export const forbidden = (message = "Anda tidak memiliki akses untuk tindakan ini.") => new AppError(message, "FORBIDDEN", 403);
export const notFound = (what: string) => new AppError(`${what} tidak ditemukan.`, "NOT_FOUND", 404);

export const created = (ctx: OperationContext) => ({ created_at: ctx.now, created_by: ctx.actorId, updated_at: ctx.now, updated_by: ctx.actorId });
export const updated = (ctx: OperationContext) => ({ updated_at: ctx.now, updated_by: ctx.actorId });

export function rows(t: Tables, table: string): Row[] {
  const found = t[table];
  if (!found) throw new AppError(`Tab ${table} tidak dimuat.`, "INTERNAL", 500);
  return found;
}

export function find(t: Tables, table: string, key: string, id: string): { row: Row; index: number } | null {
  const list = rows(t, table);
  const index = list.findIndex((row) => row[key] === id);
  return index < 0 ? null : { row: list[index]!, index };
}

export function replace(t: Tables, table: string, index: number, row: Row): void {
  rows(t, table)[index] = row;
}

/** Menambah baris baru atau mengganti baris dengan kunci yang sama (kolom created_* dipertahankan). */
export function upsert(t: Tables, table: string, key: string, row: Row, ctx: OperationContext): { before: Row | null; after: Row } {
  const found = find(t, table, key, String(row[key]));
  if (found) {
    const after = { ...found.row, ...row, ...updated(ctx) };
    replace(t, table, found.index, after);
    return { before: found.row, after };
  }
  const after = { ...row, ...created(ctx) };
  rows(t, table).push(after);
  return { before: null, after };
}
