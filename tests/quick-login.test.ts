import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { quickLoginAllowed, quickLoginUsers } from "../src/lib/auth/quick-login";
import type { User } from "../src/lib/core/types";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe("masuk cepat (khusus uji coba lokal)", () => {
  test("aktif hanya saat development dengan data lokal", () => {
    assert.equal(quickLoginAllowed(env({ NODE_ENV: "development", DATA_MODE: "lokal" })), true);
    assert.equal(quickLoginAllowed(env({ NODE_ENV: "development" })), true, "tanpa konfigurasi Sheets berarti lokal");
  });

  test("mati di produksi, di Google Sheets, saat tes, atau bila dimatikan", () => {
    assert.equal(quickLoginAllowed(env({ NODE_ENV: "production", DATA_MODE: "lokal" })), false);
    assert.equal(quickLoginAllowed(env({ NODE_ENV: "production", DATA_MODE: "lokal", ALLOW_LOCAL_DATA: "1" })), false);
    assert.equal(quickLoginAllowed(env({ NODE_ENV: "development", DATA_MODE: "sheets" })), false);
    assert.equal(quickLoginAllowed(env({ NODE_ENV: "development", GOOGLE_SERVICE_ACCOUNT_JSON: "{}" })), false);
    assert.equal(quickLoginAllowed(env({ NODE_ENV: "test", DATA_MODE: "lokal" })), false);
    assert.equal(quickLoginAllowed(env({ DATA_MODE: "lokal" })), false);
    assert.equal(quickLoginAllowed(env({ NODE_ENV: "development", DATA_MODE: "lokal", MASUK_CEPAT: "0" })), false);
  });

  test("hanya akun aktif, urut peran lalu nama", () => {
    const user = (user_id: string, nama: string, peran: User["peran"], aktif = true): User => ({
      user_id,
      username: user_id,
      nama,
      peran,
      aktif,
      password_hash: "",
      wajib_ganti_password: false,
      versi_otorisasi: 1,
      akses_keuangan: "TIDAK",
      terakhir_masuk: "",
    });
    const list = quickLoginUsers([
      user("w", "Wulan", "WALI"),
      user("s2", "Zaki", "SISWA"),
      user("o", "Pemilik", "OWNER"),
      user("s1", "Arif", "SISWA"),
      user("x", "Nonaktif", "ADMIN", false),
    ]);
    assert.deepEqual(
      list.map((u) => u.user_id),
      ["o", "s1", "s2", "w"],
    );
  });
});
