import { JWT } from "google-auth-library";
import { diffTable, normalizeRow, validateRead } from "./rows";
import { OPERATION_TABLE, tableDef, type SpreadsheetKey, type TableDef } from "./schema";
import { AppError, StoreError, type Cell, type Row, type Store, type Tables } from "./types";

interface SheetMeta {
  properties: { sheetId: number; title: string; gridProperties?: { rowCount: number; columnCount: number } };
}

export interface SheetsConfig {
  clientEmail: string;
  privateKey: string;
  spreadsheetIds: Record<SpreadsheetKey, string>;
  timeZone: string;
  /** Lama cache baca per tab (milidetik). */
  cacheMs?: number;
}

const READ_LIMIT_ROWS = 20000;

/** Huruf kolom A1 dari nomor kolom (1 → A, 27 → AA). */
export function columnLetter(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

const toCell = (value: Cell) =>
  typeof value === "number"
    ? { userEnteredValue: { numberValue: value } }
    : typeof value === "boolean"
      ? { userEnteredValue: { boolValue: value } }
      : { userEnteredValue: { stringValue: value } };

const rowData = (def: TableDef, row: Row) => ({ values: def.columns.map((column) => toCell(row[column] ?? "")) });

/** Penyimpanan Google Sheets: membaca hanya tab yang diminta, menulis perubahan dalam satu batchUpdate. */
export class SheetsStore implements Store {
  readonly mode = "sheets" as const;
  private client?: JWT;
  private readonly meta = new Map<string, { sheets: SheetMeta[]; expires: number }>();
  private readonly cache = new Map<string, { rows: Row[]; expires: number }>();
  private readonly cacheMs: number;

  constructor(private readonly config: SheetsConfig) {
    this.cacheMs = config.cacheMs ?? 15_000;
  }

  private async api<T>(spreadsheetId: string, suffix: string, method = "GET", body?: unknown): Promise<T> {
    this.client ??= new JWT({
      email: this.config.clientEmail,
      key: this.config.privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    let response: Response;
    try {
      const token = (await this.client.getAccessToken()).token;
      response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}${suffix}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
    } catch {
      // Jaringan terputus atau waktu habis: untuk penulisan, hasilnya tidak bisa dipastikan.
      throw new StoreError("Google Sheets tidak dapat dihubungi.", method !== "GET");
    }
    if (!response.ok) {
      const definitive = response.status < 500 && response.status !== 408;
      const message =
        response.status === 403
          ? "Service account belum diberi akses Editor ke spreadsheet, atau Google Sheets API belum aktif."
          : response.status === 404
            ? "Spreadsheet tidak ditemukan. Periksa ID spreadsheet."
            : response.status === 429
              ? "Kuota Google Sheets sedang penuh. Coba lagi sebentar."
              : "Google Sheets sedang tidak dapat diakses.";
      throw new StoreError(message, method !== "GET" && !definitive, response.status === 429 ? 429 : 503);
    }
    return (await response.json()) as T;
  }

  private id(sheet: SpreadsheetKey): string {
    const value = this.config.spreadsheetIds[sheet];
    if (!value) throw new AppError(`ID spreadsheet ${sheet} belum diisi.`, "CONFIG", 503);
    return value;
  }

  private async sheets(sheet: SpreadsheetKey, force = false): Promise<SheetMeta[]> {
    const id = this.id(sheet);
    const cached = this.meta.get(id);
    if (!force && cached && cached.expires > Date.now()) return cached.sheets;
    const value = await this.api<{ sheets: SheetMeta[] }>(id, "?fields=sheets(properties(sheetId,title,gridProperties))");
    this.meta.set(id, { sheets: value.sheets, expires: Date.now() + 300_000 });
    return value.sheets;
  }

  async existingTables(sheet: SpreadsheetKey): Promise<string[]> {
    return (await this.sheets(sheet, true)).map((s) => s.properties.title);
  }

  async findOperation(sheet: SpreadsheetKey, operationId: string): Promise<Row | null> {
    const id = this.id(sheet);
    const table = OPERATION_TABLE[sheet];
    const def = tableDef(sheet, table);
    // Hanya kolom operation_id yang dibaca, agar biaya tetap kecil walau tab operasi terus bertambah.
    const ids = await this.api<{ values?: Cell[][] }>(id, `/values/${encodeURIComponent(`'${table}'!A2:A`)}?valueRenderOption=UNFORMATTED_VALUE`);
    const index = (ids.values ?? []).findIndex((cells) => cells[0] === operationId);
    if (index < 0) return null;
    const rowNumber = index + 2;
    const full = await this.api<{ values?: Cell[][] }>(
      id,
      `/values/${encodeURIComponent(`'${table}'!A${rowNumber}:${columnLetter(def.columns.length)}${rowNumber}`)}?valueRenderOption=UNFORMATTED_VALUE`,
    );
    const cells = full.values?.[0] ?? [];
    return normalizeRow(def, Object.fromEntries(def.columns.map((c, j) => [c, cells[j] ?? ""])));
  }

  async read(sheet: SpreadsheetKey, tables: readonly string[], options: { fresh?: boolean } = {}): Promise<Tables> {
    const id = this.id(sheet);
    const out: Tables = {};
    const missing: string[] = [];
    for (const table of tables) {
      const cached = this.cache.get(`${id}:${table}`);
      if (!options.fresh && cached && cached.expires > Date.now()) out[table] = cached.rows.map((row) => ({ ...row }));
      else missing.push(table);
    }
    if (missing.length === 0) return out;

    const titles = new Set((await this.sheets(sheet)).map((s) => s.properties.title));
    const absent = missing.filter((table) => !titles.has(table));
    if (absent.length) {
      throw new AppError(`Tab ${absent.join(", ")} belum ada. Jalankan setup spreadsheet terlebih dahulu.`, "SCHEMA_INCOMPLETE", 409);
    }
    const params = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE" });
    for (const table of missing) {
      const def = tableDef(sheet, table);
      params.append("ranges", `'${table}'!A1:${columnLetter(def.columns.length)}${READ_LIMIT_ROWS + 1}`);
    }
    const data = await this.api<{ valueRanges: { values?: Cell[][] }[] }>(id, `/values:batchGet?${params}`);
    missing.forEach((table, i) => {
      const def = tableDef(sheet, table);
      const values = data.valueRanges[i]?.values ?? [];
      const rows = values.slice(1).map((cells) => normalizeRow(def, Object.fromEntries(def.columns.map((c, j) => [c, cells[j] ?? ""]))));
      validateRead(def, values[0] ?? [], rows);
      if (rows.length >= READ_LIMIT_ROWS) {
        throw new AppError(`Tab ${table} mendekati batas ${READ_LIMIT_ROWS} baris. Arsipkan data lama terlebih dahulu.`, "CAPACITY", 409);
      }
      this.cache.set(`${id}:${table}`, { rows, expires: Date.now() + this.cacheMs });
      out[table] = rows.map((row) => ({ ...row }));
    });
    return out;
  }

  async commit(sheet: SpreadsheetKey, before: Tables, after: Tables): Promise<void> {
    const id = this.id(sheet);
    const metas = await this.sheets(sheet);
    const requests: unknown[] = [];
    for (const [table, rows] of Object.entries(after)) {
      const def = tableDef(sheet, table);
      const target = metas.find((s) => s.properties.title === table);
      if (!target) throw new AppError(`Tab ${table} tidak tersedia.`, "SCHEMA_INCOMPLETE", 409);
      const sheetId = target.properties.sheetId;
      const { updates, appends } = diffTable(def, before[table] ?? [], rows);
      for (const update of updates) {
        requests.push({
          updateCells: { start: { sheetId, rowIndex: update.index + 1, columnIndex: 0 }, rows: [rowData(def, update.row)], fields: "userEnteredValue" },
        });
      }
      if (appends.length) {
        requests.push({ appendCells: { sheetId, rows: appends.map((row) => rowData(def, row)), fields: "userEnteredValue" } });
      }
    }
    if (requests.length === 0) return;
    if (Buffer.byteLength(JSON.stringify({ requests })) > 1_800_000) {
      throw new AppError("Perubahan terlalu besar untuk satu penyimpanan. Bagi menjadi beberapa bagian.", "TOO_LARGE", 413);
    }
    try {
      await this.api(id, ":batchUpdate", "POST", { requests });
    } finally {
      // Apa pun hasilnya, data di cache tidak lagi bisa dipercaya.
      for (const key of [...this.cache.keys()]) if (key.startsWith(`${id}:`)) this.cache.delete(key);
    }
  }

  async ensureTables(sheet: SpreadsheetKey, defs: readonly TableDef[], seed: Tables): Promise<string[]> {
    const id = this.id(sheet);
    const metas = await this.sheets(sheet, true);
    const titles = new Set(metas.map((s) => s.properties.title));
    const missing = defs.filter((def) => !titles.has(def.name));
    if (missing.length === 0) return [];
    let nextId = Math.max(0, ...metas.map((s) => s.properties.sheetId)) + 1;
    const requests: unknown[] = [];
    for (const def of missing) {
      const sheetId = nextId++;
      requests.push(
        {
          addSheet: {
            properties: {
              sheetId,
              title: def.name,
              gridProperties: { rowCount: 1000, columnCount: Math.max(26, def.columns.length), frozenRowCount: 1 },
            },
          },
        },
        {
          updateCells: {
            start: { sheetId, rowIndex: 0, columnIndex: 0 },
            rows: [{ values: def.columns.map((c) => toCell(c)) }, ...(seed[def.name] ?? []).map((row) => rowData(def, row))],
            fields: "userEnteredValue",
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.21, green: 0.42, blue: 0.32 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 0.97 } },
              },
            },
            fields: "userEnteredFormat",
          },
        },
        {
          addProtectedRange: {
            protectedRange: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              warningOnly: true,
              description: "Header database Ruang Garda: jangan ubah nama atau urutan kolom.",
            },
          },
        },
      );
    }
    requests.push({ updateSpreadsheetProperties: { properties: { timeZone: this.config.timeZone }, fields: "timeZone" } });
    await this.api(id, ":batchUpdate", "POST", { requests });
    this.meta.delete(id);
    return missing.map((def) => def.name);
  }

  async extendHeaders(sheet: SpreadsheetKey, defs: readonly TableDef[], apply: boolean): Promise<string[]> {
    const id = this.id(sheet);
    const metas = await this.sheets(sheet, true);
    const present = defs.filter((def) => metas.some((m) => m.properties.title === def.name));
    if (present.length === 0) return [];
    const params = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE" });
    for (const def of present) params.append("ranges", `'${def.name}'!1:1`);
    const data = await this.api<{ valueRanges: { values?: Cell[][] }[] }>(id, `/values:batchGet?${params}`);
    const requests: unknown[] = [];
    const extended: string[] = [];
    present.forEach((def, i) => {
      const header = (data.valueRanges[i]?.values?.[0] ?? []).filter((cell) => cell !== "");
      const isPrefix = header.length < def.columns.length && header.every((cell, j) => cell === def.columns[j]);
      if (!isPrefix || header.length === 0) return;
      extended.push(def.name);
      const meta = metas.find((m) => m.properties.title === def.name)!;
      const sheetId = meta.properties.sheetId;
      const columnCount = meta.properties.gridProperties?.columnCount ?? 26;
      if (columnCount < def.columns.length) requests.push({ appendDimension: { sheetId, dimension: "COLUMNS", length: def.columns.length - columnCount } });
      requests.push({
        updateCells: {
          start: { sheetId, rowIndex: 0, columnIndex: header.length },
          rows: [{ values: def.columns.slice(header.length).map((c) => toCell(c)) }],
          fields: "userEnteredValue",
        },
      });
    });
    if (apply && requests.length) {
      await this.api(id, ":batchUpdate", "POST", { requests });
      this.meta.delete(id);
      for (const name of extended) this.cache.delete(`${id}:${name}`);
    }
    return extended;
  }
}
