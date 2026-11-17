import fs from "node:fs";
import path from "node:path";
import { normalizeRow, diffTable } from "./rows";
import { OPERATION_TABLE, tableDef, type SpreadsheetKey, type TableDef } from "./schema";
import { AppError, type Row, type Store, type Tables } from "./types";

type Snapshot = Record<SpreadsheetKey, Tables>;

/**
 * Penyimpanan di memori untuk tes dan pengembangan lokal.
 * Bila `file` diberikan, isi disimpan sebagai JSON agar bertahan setelah server dimulai ulang.
 */
export class MemoryStore implements Store {
  readonly mode = "lokal" as const;
  private data: Snapshot;
  private readonly file?: string;

  constructor(options: { file?: string; initial?: Partial<Snapshot> } = {}) {
    this.file = options.file;
    this.data = { inti: {}, keuangan: {}, ...options.initial };
    if (this.file && fs.existsSync(this.file)) {
      this.data = { inti: {}, keuangan: {}, ...(JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<Snapshot>) };
    }
  }

  async existingTables(sheet: SpreadsheetKey): Promise<string[]> {
    this.reload();
    return Object.keys(this.data[sheet]);
  }

  async findOperation(sheet: SpreadsheetKey, operationId: string): Promise<Row | null> {
    this.reload();
    const table = OPERATION_TABLE[sheet];
    const found = (this.data[sheet][table] ?? []).find((row) => row.operation_id === operationId);
    return found ? normalizeRow(tableDef(sheet, table), found) : null;
  }

  async read(sheet: SpreadsheetKey, tables: readonly string[]): Promise<Tables> {
    this.reload();
    const out: Tables = {};
    for (const table of tables) {
      const rows = this.data[sheet][table];
      if (!rows) {
        throw new AppError(`Tab ${table} belum ada. Jalankan "npm run setup:sheets -- --apply".`, "SCHEMA_INCOMPLETE", 409);
      }
      const def = tableDef(sheet, table);
      out[table] = rows.map((row) => normalizeRow(def, row));
    }
    return out;
  }

  async commit(sheet: SpreadsheetKey, before: Tables, after: Tables): Promise<void> {
    this.reload();
    for (const [table, rows] of Object.entries(after)) {
      const def = tableDef(sheet, table);
      const current = this.data[sheet][table];
      if (!current) throw new AppError(`Tab ${table} belum ada.`, "SCHEMA_INCOMPLETE", 409);
      const { updates, appends } = diffTable(def, before[table] ?? [], rows);
      for (const update of updates) current[update.index] = update.row;
      current.push(...appends);
    }
    this.persist();
  }

  async ensureTables(sheet: SpreadsheetKey, defs: readonly TableDef[], seed: Tables): Promise<string[]> {
    this.reload();
    const added: string[] = [];
    for (const def of defs) {
      if (this.data[sheet][def.name]) continue;
      this.data[sheet][def.name] = (seed[def.name] ?? []).map((row) => normalizeRow(def, row));
      added.push(def.name);
    }
    if (added.length) this.persist();
    return added;
  }

  /** Data lokal tidak menyimpan header: kolom baru otomatis kosong lewat normalizeRow. */
  async extendHeaders(): Promise<string[]> {
    return [];
  }

  private reload(): void {
    if (this.file && fs.existsSync(this.file)) {
      this.data = { inti: {}, keuangan: {}, ...(JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<Snapshot>) };
    }
  }

  private persist(): void {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2));
    fs.renameSync(temporary, this.file);
  }
}
