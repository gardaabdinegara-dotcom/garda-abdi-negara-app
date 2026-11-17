import { Redis } from "@upstash/redis";
import { dataMode, localDataFile, redisConfigured, sheetsConfig } from "./config";
import { MemoryGate, MemoryLimiter, RedisGate, RedisLimiter } from "./data/gate";
import { MemoryStore } from "./data/memory-store";
import { SheetsLimiter } from "./data/sheet-limiter";
import { SheetsStore } from "./data/sheets-store";
import { AppError, type Gate, type Limiter, type Store } from "./data/types";

export interface Deps {
  store: Store;
  gate: Gate;
  limiter: Limiter;
}

// Disimpan di globalThis agar satu instance dipakai bersama (termasuk saat dev server memuat ulang modul).
const holder = globalThis as unknown as { __ruangGardaDeps?: Deps };

export function createDeps(): Deps {
  const mode = dataMode();
  if (mode === "lokal") {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_DATA !== "1") {
      throw new AppError("Mode data lokal tidak boleh dipakai di produksi. Isi konfigurasi Google Sheets.", "CONFIG", 503);
    }
    return { store: new MemoryStore({ file: localDataFile() }), gate: new MemoryGate(), limiter: new MemoryLimiter() };
  }
  const store = new SheetsStore(sheetsConfig());
  if (redisConfigured()) {
    const redis = Redis.fromEnv();
    return { store, gate: new RedisGate(redis), limiter: new RedisLimiter(redis) };
  }
  // Murni spreadsheet (tanpa Redis): batas salah PIN/password disimpan di tab Batas_Masuk, antrean penyimpanan
  // di memori. Aman bila aplikasi berjalan di satu server; di layanan serverless yang memakai banyak instance,
  // dua penyimpanan pada detik yang sama bisa saling menimpa.
  return { store, gate: new MemoryGate(), limiter: new SheetsLimiter(store) };
}

export function deps(): Deps {
  holder.__ruangGardaDeps ??= createDeps();
  return holder.__ruangGardaDeps;
}
