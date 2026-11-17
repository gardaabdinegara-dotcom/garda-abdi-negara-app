import type { TableDef } from "./schema";
import { AppError, type Cell, type Row } from "./types";

/** Melengkapi baris dengan semua kolom tab; kolom asing dibuang. */
export function normalizeRow(def: TableDef, row: Row): Row {
  return Object.fromEntries(def.columns.map((column) => [column, row[column] ?? ""]));
}

export function keyOf(def: TableDef, row: Row): string {
  return String(row[def.key] ?? "");
}

/**
 * Menghitung perubahan satu tab: baris yang diperbarui (dengan indeks posisinya) dan baris baru.
 * Penghapusan baris tidak diizinkan karena posisi baris di spreadsheet harus tetap.
 */
export function diffTable(def: TableDef, before: Row[], after: Row[]) {
  const index = new Map<string, number>();
  before.forEach((row, i) => index.set(keyOf(def, row), i));
  const seen = new Set<string>();
  const updates: { index: number; row: Row }[] = [];
  const appends: Row[] = [];
  for (const row of after) {
    const key = keyOf(def, row);
    if (!key) throw new AppError(`Baris tanpa ${def.key} pada ${def.name}.`, "DATA_INTEGRITY", 500);
    if (seen.has(key)) throw new AppError(`ID ganda ${key} pada ${def.name}.`, "DATA_INTEGRITY", 500);
    seen.add(key);
    const position = index.get(key);
    if (position === undefined) appends.push(normalizeRow(def, row));
    else if (!sameRow(def, before[position]!, row)) updates.push({ index: position, row: normalizeRow(def, row) });
  }
  for (const key of index.keys()) {
    if (!seen.has(key)) throw new AppError(`Baris ${key} pada ${def.name} tidak boleh dihapus.`, "DATA_INTEGRITY", 500);
  }
  return { updates, appends };
}

function sameRow(def: TableDef, a: Row, b: Row): boolean {
  return def.columns.every((column) => cellText(a[column]) === cellText(b[column]));
}

const cellText = (value: Cell | undefined): string => (value === undefined ? "" : String(value));

/** Memeriksa baris hasil baca: header sesuai, tanpa ID kosong atau ganda. */
export function validateRead(def: TableDef, header: Cell[], rows: Row[]): void {
  if (header.length < def.columns.length || def.columns.some((column, i) => header[i] !== column)) {
    throw new AppError(`Header tab ${def.name} berubah. Pulihkan nama dan urutan kolom sebelum melanjutkan.`, "SCHEMA", 409);
  }
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    const key = keyOf(def, row);
    if (!key) {
      throw new AppError(
        `Baris ${i + 2} pada tab ${def.name} tidak punya ${def.key}. Hapus baris kosong atau lengkapi datanya.`,
        "DATA_INTEGRITY",
        409,
      );
    }
    if (seen.has(key)) throw new AppError(`ID ${key} muncul dua kali pada tab ${def.name}.`, "DATA_INTEGRITY", 409);
    seen.add(key);
  });
}

export const bool = (value: Cell | undefined): boolean => value === true || String(value).toLowerCase() === "true";

export const num = (value: Cell | undefined, fallback = 0): number => {
  if (value === "" || value === undefined || value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const str = (value: Cell | undefined): string => (value === undefined || value === null ? "" : String(value));
