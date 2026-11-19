import { createHash, randomUUID } from "node:crypto";
import { OPERATION_TABLE, type SpreadsheetKey } from "./schema";
import { AppError, StoreError, cloneTables, type Gate, type Row, type Store, type Tables } from "./types";

export interface OperationContext {
  actorId: string;
  now: string;
  operationId: string;
  newId(prefix: string): string;
}

export interface OperationOutcome<T = unknown> {
  entityType: string;
  entityId: string;
  message: string;
  data?: T;
  before?: Row | null;
  after?: Row | null;
  /** Nilai rahasia sekali tampil (mis. password sementara); tidak pernah disimpan di tab operasi. */
  secret?: string;
  alasan?: string;
}

export interface StoredOutcome<T = unknown> {
  entityType: string;
  entityId: string;
  message: string;
  data?: T;
}

export interface RunOptions<T> {
  sheet: SpreadsheetKey;
  operationId: string;
  actorId: string;
  action: string;
  /** Isi permintaan untuk sidik jari operasi. Jangan masukkan password atau rahasia lain. */
  fingerprint: unknown;
  tables: readonly string[];
  newId?(prefix: string): string;
  apply(tables: Tables, ctx: OperationContext): OperationOutcome<T>;
}

export interface RunResult<T> {
  replayed: boolean;
  outcome: OperationOutcome<T> | StoredOutcome<T>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function requestHash(action: string, actorId: string, fingerprint: unknown): string {
  return createHash("sha256").update(canonical({ action, actorId, fingerprint })).digest("hex");
}

/** Membuang kolom rahasia sebelum disimpan sebagai jejak audit. */
export function redact(row: Row | null | undefined): Row | null {
  if (!row) return null;
  return Object.fromEntries(Object.entries(row).filter(([key]) => !/password|token|secret/i.test(key)));
}

/**
 * Menjalankan satu operasi tulis:
 * 1. mengambil gerbang penyimpanan untuk spreadsheet itu,
 * 2. membaca ulang data terbaru (tanpa cache),
 * 3. bila operation_id sudah tercatat dengan isi sama, mengembalikan hasil lama tanpa menulis ulang,
 * 4. menerapkan perubahan di memori, lalu menulis semuanya ditambah catatan operasi dalam satu batch.
 */
export async function runOperation<T>(deps: { store: Store; gate: Gate }, options: RunOptions<T>): Promise<RunResult<T>> {
  if (!UUID.test(options.operationId)) throw new AppError("ID operasi tidak valid. Muat ulang halaman.", "OPERATION_ID", 400);
  const operationTable = OPERATION_TABLE[options.sheet];
  const hash = requestHash(options.action, options.actorId, options.fingerprint);
  const lease = await deps.gate.acquire(options.sheet, options.operationId);
  try {
    const recorded = await deps.store.findOperation(options.sheet, options.operationId);
    if (recorded) {
      if (recorded.request_hash !== hash || recorded.actor_id !== options.actorId) {
        throw new AppError("ID operasi sudah dipakai untuk perubahan lain. Muat ulang halaman lalu ulangi.", "OPERATION_CONFLICT", 409);
      }
      return { replayed: true, outcome: JSON.parse(String(recorded.result_json)) as StoredOutcome<T> };
    }

    const tables = options.tables.filter((table) => table !== operationTable);
    const before = await deps.store.read(options.sheet, tables, { fresh: true });
    // Tab operasi diperlakukan sebagai log: tidak dibaca utuh, cukup ditambah satu baris.
    before[operationTable] = [];
    const after = cloneTables(before);
    const now = new Date().toISOString();
    const ctx: OperationContext = {
      actorId: options.actorId,
      now,
      operationId: options.operationId,
      newId: options.newId ?? ((prefix) => `${prefix}_${randomUUID().replace(/-/g, "")}`),
    };
    const outcome = options.apply(after, ctx);
    const stored: StoredOutcome<T> = { entityType: outcome.entityType, entityId: outcome.entityId, message: outcome.message, data: outcome.data };
    after[operationTable]!.push({
      operation_id: options.operationId,
      request_hash: hash,
      aksi: options.action,
      entity_type: outcome.entityType,
      entity_id: outcome.entityId,
      actor_id: options.actorId,
      committed_at: now,
      alasan: outcome.alasan ?? "",
      before_json: JSON.stringify(redact(outcome.before)),
      after_json: JSON.stringify(redact(outcome.after)),
      result_json: JSON.stringify(stored),
    });
    await deps.store.commit(options.sheet, before, after);
    return { replayed: false, outcome };
  } catch (error) {
    if (error instanceof StoreError && error.uncertain) {
      throw new AppError(
        "Belum bisa dipastikan apakah perubahan tersimpan. Tekan Simpan lagi tanpa mengubah isian; sistem tidak akan menyimpan dua kali.",
        "WRITE_UNCERTAIN",
        202,
      );
    }
    throw error;
  } finally {
    await deps.gate.release(lease).catch(() => {});
  }
}
