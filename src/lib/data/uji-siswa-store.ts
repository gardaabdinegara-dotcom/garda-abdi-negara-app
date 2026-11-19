import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { signFor } from "../auth/session";
import { MemoryStore } from "./memory-store";
import { diffTable } from "./rows";
import { tableDef, type SpreadsheetKey } from "./schema";
import { AppError, type Row, type Tables } from "./types";

// Sisakan ruang untuk cookie login dan header lainnya. Satu perubahan disimpan per operasi.
const MAX_CHANGE = 3600;
const MAX_JOURNAL = 6500;
const MAX_INFLATED = 32_000;
const EDITABLE = new Set(["Operasi", "Pengguna", "Presensi", "Pengumpulan", "Latihan_Psikotes"]);

type Entry = { name: string; value: string };

function seal(key: Buffer, name: string, change: Tables): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv).setAAD(Buffer.from(name));
  const payload = cipher.update(deflateRawSync(JSON.stringify(change)));
  return Buffer.concat([iv, payload, cipher.final(), cipher.getAuthTag()]).toString("base64url");
}

function open(key: Buffer, entry: Entry): Tables | null {
  try {
    if (entry.value.length > MAX_CHANGE) return null;
    const raw = Buffer.from(entry.value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12))
      .setAAD(Buffer.from(entry.name)).setAuthTag(raw.subarray(-16));
    const payload = Buffer.concat([decipher.update(raw.subarray(12, -16)), decipher.final()]);
    return JSON.parse(inflateRawSync(payload, { maxOutputLength: MAX_INFLATED }).toString()) as Tables;
  } catch {
    return null;
  }
}

export class UjiSiswaStore extends MemoryStore {
  private readonly key: Buffer;

  constructor(
    data: Record<SpreadsheetKey, Tables>,
    scope: string,
    private readonly prefix: string,
    private readonly entries: Entry[],
    private readonly write: (entry: Entry) => void,
  ) {
    const key = Buffer.from(signFor("uji-siswa-cookie", scope), "base64url");
    const changes = entries.map((entry) => open(key, entry));
    if (changes.some((change) => !change)) {
      throw new AppError("Data uji tidak dapat dibaca. Atur ulang mode uji untuk melanjutkan.", "UJI_SISWA_INVALID");
    }
    const applied = (changes as Tables[]).sort((a, b) =>
      String(a.Operasi![0]!.committed_at).localeCompare(String(b.Operasi![0]!.committed_at)) ||
      String(a.Operasi![0]!.operation_id).localeCompare(String(b.Operasi![0]!.operation_id)),
    );
    for (const change of applied) {
      for (const [table, rows] of Object.entries(change)) {
        const def = tableDef("inti", table);
        const target = data.inti[table]!;
        for (const row of rows) {
          const index = target.findIndex((existing) => existing[def.key] === row[def.key]);
          if (index === -1) target.push(row);
          else target[index] = row;
        }
      }
    }
    super({ initial: data });
    this.key = key;
  }

  override async commit(sheet: SpreadsheetKey, before: Tables, after: Tables): Promise<void> {
    const operation = after.Operasi?.[0];
    if (sheet !== "inti" || !operation) {
      throw new AppError("Perubahan ini tidak tersedia di Mode Uji Siswa.", "UJI_SISWA_ONLY");
    }
    const changes: Tables = {};
    for (const [table, rows] of Object.entries(after)) {
      const { updates, appends } = diffTable(tableDef(sheet, table), before[table] ?? [], rows);
      const changed: Row[] = [...updates.map((update) => update.row), ...appends];
      if (!changed.length) continue;
      if (!EDITABLE.has(table)) throw new AppError("Perubahan ini tidak tersedia di Mode Uji Siswa.", "UJI_SISWA_ONLY");
      changes[table] = changed;
    }
    changes.Operasi = [{ ...operation, before_json: "", after_json: "" }];
    const name = this.prefix + String(operation.operation_id);
    const value = seal(this.key, name, changes);
    const used = this.entries.reduce((sum, entry) => sum + entry.name.length + entry.value.length + 3, 0);
    if (value.length > MAX_CHANGE || used + name.length + value.length + 3 > MAX_JOURNAL) {
      throw new AppError("Penyimpanan sementara penuh. Atur ulang Mode Uji untuk melanjutkan.", "UJI_SISWA_FULL");
    }
    this.write({ name, value });
    this.entries.push({ name, value });
    await super.commit(sheet, before, { ...after, Operasi: changes.Operasi });
  }
}
