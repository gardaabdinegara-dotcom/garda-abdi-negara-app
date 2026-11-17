import type { SpreadsheetKey, TableDef } from "./schema";

export type Cell = string | number | boolean;
export type Row = Record<string, Cell>;
export type Tables = Record<string, Row[]>;

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code = "VALIDATION", status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Kegagalan penyimpanan. `uncertain` berarti tidak bisa dipastikan apakah data sudah tertulis. */
export class StoreError extends AppError {
  readonly uncertain: boolean;
  constructor(message: string, uncertain: boolean, status = 503) {
    super(message, uncertain ? "WRITE_UNCERTAIN" : "STORE", status);
    this.uncertain = uncertain;
  }
}

export interface ReadOptions {
  /** Abaikan cache dan baca langsung dari sumber (wajib di dalam operasi tulis). */
  fresh?: boolean;
}

export interface Store {
  readonly mode: "sheets" | "lokal";
  read(sheet: SpreadsheetKey, tables: readonly string[], options?: ReadOptions): Promise<Tables>;
  /** Menulis perbedaan `after` terhadap `before`: baris berubah diperbarui, baris baru ditambahkan. Tidak pernah menghapus. */
  commit(sheet: SpreadsheetKey, before: Tables, after: Tables): Promise<void>;
  /** Membuat tab yang belum ada beserta header dan isi awal. Mengembalikan nama tab yang ditambahkan. */
  ensureTables(sheet: SpreadsheetKey, defs: readonly TableDef[], seed: Tables): Promise<string[]>;
  /** Nama tab yang sudah ada. */
  existingTables(sheet: SpreadsheetKey): Promise<string[]>;
  /**
   * Melengkapi header tab lama yang hanya kekurangan kolom baru di ujung kanan (kolom lama tidak diubah).
   * `apply: false` hanya melaporkan. Mengembalikan nama tab yang (perlu) dilengkapi.
   */
  extendHeaders(sheet: SpreadsheetKey, defs: readonly TableDef[], apply: boolean): Promise<string[]>;
  /** Mencari catatan operasi berdasarkan operation_id tanpa membaca seluruh tab operasi. */
  findOperation(sheet: SpreadsheetKey, operationId: string): Promise<Row | null>;
}

export interface GateLease {
  scope: string;
  token: string;
  operationId: string;
}

export interface Gate {
  acquire(scope: string, operationId: string): Promise<GateLease>;
  release(lease: GateLease): Promise<void>;
}

export interface Limiter {
  /** Menambah hitungan pada kunci dalam jendela waktu tertentu; mengembalikan jumlah terbaru. */
  hit(key: string, windowSeconds: number): Promise<number>;
  count(key: string): Promise<number>;
  reset(key: string): Promise<void>;
}

/** Menyalin tabel agar perubahan pada salinan tidak menyentuh data asli. */
export function cloneTables(tables: Tables): Tables {
  return Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
}
