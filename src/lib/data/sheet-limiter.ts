// Pembatas percobaan masuk yang disimpan di spreadsheet (tab Batas_Masuk), pengganti Redis.
// Satu baris per kunci; baris yang kedaluwarsa dipakai ulang, jadi jumlah baris tetap kecil.
import { createHash } from "node:crypto";
import type { SpreadsheetKey } from "./schema";
import { num, str } from "./rows";
import { cloneTables, type Limiter, type Row, type Store } from "./types";

const TABLE = "Batas_Masuk";

/** Alamat IP tidak disimpan apa adanya, cukup sidik jarinya. */
function storedKey(key: string): string {
  const ip = /^login:ip:(.+)$/.exec(key);
  return ip ? `login:ip:${createHash("sha256").update(ip[1]!).digest("hex").slice(0, 16)}` : key;
}

export class SheetsLimiter implements Limiter {
  constructor(
    private readonly store: Store,
    private readonly sheet: SpreadsheetKey = "inti",
    private readonly clock: () => number = Date.now,
  ) {}

  private async load() {
    const before = await this.store.read(this.sheet, [TABLE], { fresh: true });
    const after = cloneTables(before);
    return { before, after, rows: (after[TABLE] ??= []) as Row[] };
  }

  async hit(key: string, windowSeconds: number): Promise<number> {
    const { before, after, rows } = await this.load();
    const now = this.clock();
    const k = storedKey(key);
    const iso = new Date(now).toISOString();
    let row = rows.find((r) => str(r.kunci) === k);
    if (row && Date.parse(str(row.kedaluwarsa)) > now) {
      row.jumlah = num(row.jumlah, 0) + 1;
    } else {
      const fresh = { kunci: k, jumlah: 1, kedaluwarsa: new Date(now + windowSeconds * 1000).toISOString(), updated_at: iso };
      if (row) Object.assign(row, fresh);
      else rows.push((row = fresh));
    }
    row.updated_at = iso;
    await this.store.commit(this.sheet, before, after);
    return num(row.jumlah, 0);
  }

  async count(key: string): Promise<number> {
    const tables = await this.store.read(this.sheet, [TABLE], { fresh: true });
    const row = (tables[TABLE] ?? []).find((r) => str(r.kunci) === storedKey(key));
    return row && Date.parse(str(row.kedaluwarsa)) > this.clock() ? num(row.jumlah, 0) : 0;
  }

  async reset(key: string): Promise<void> {
    const { before, after, rows } = await this.load();
    const row = rows.find((r) => str(r.kunci) === storedKey(key));
    if (!row || num(row.jumlah, 0) === 0) return;
    row.jumlah = 0;
    row.updated_at = new Date(this.clock()).toISOString();
    await this.store.commit(this.sheet, before, after);
  }
}
