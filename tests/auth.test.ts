import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import { resolveActor } from "../src/lib/auth/actor";
import { attemptLogin, MAX_FAILS_PER_ACCOUNT } from "../src/lib/auth/login";
import { hashPassword, temporaryPassword, verifyPassword } from "../src/lib/auth/password";
import { createSessionToken, readSessionToken } from "../src/lib/auth/session";
import { changeOwnPassword, createUser, resetPassword, revokeSessions, updateUser } from "../src/lib/core/domain";
import { toUser, type Actor } from "../src/lib/core/types";
import { passwordProblem } from "../src/lib/core/validation";
import { runOperation } from "../src/lib/data/coordinator";
import { AppError } from "../src/lib/data/types";
import { createFirstOwner } from "../src/lib/setup";
import { freshDeps } from "./helpers";

describe("password", () => {
  test("hash dan verifikasi", async () => {
    const hash = await hashPassword("Rahasia-panjang-123");
    assert.match(hash, /^scrypt\$\d+\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    assert.equal(await verifyPassword("Rahasia-panjang-123", hash), true);
    assert.equal(await verifyPassword("rahasia-panjang-123", hash), false);
    assert.equal(await verifyPassword("x", "bukan-hash"), false);
    assert.notEqual(await hashPassword("sama"), await hashPassword("sama"), "garam berbeda");
  });

  test("password sementara: 16 karakter, huruf dan angka, tanpa huruf mirip", () => {
    for (let i = 0; i < 200; i += 1) {
      const pw = temporaryPassword();
      assert.equal(pw.length, 16);
      assert.match(pw, /\d/);
      assert.match(pw, /[a-zA-Z]/);
      assert.doesNotMatch(pw, /[lIO01]/);
    }
  });

  test("aturan password baru", () => {
    assert.match(passwordProblem("pendek12", "budi", false)!, /minimal 12/);
    assert.equal(passwordProblem("belajartiap1hari", "budi", false), null);
    assert.equal(passwordProblem("belajarrajin1", "budi", false), null);
    assert.match(passwordProblem("belajarrajin1", "budi", true)!, /minimal 14/, "akun keuangan butuh 14");
    assert.match(passwordProblem("budi12345678xyz", "budi", false)!, /username/);
    assert.match(passwordProblem("hanyahurufsaja", "budi", false)!, /huruf dan angka/);
  });
});

describe("token sesi", () => {
  test("ditandatangani dan kedaluwarsa", () => {
    const now = Date.now();
    const { token } = createSessionToken("USR_1", 3, now);
    assert.deepEqual(readSessionToken(token, now)?.u, "USR_1");
    assert.equal(readSessionToken(token, now)?.v, 3);
    assert.equal(readSessionToken(token, now + 9 * 3600_000), null, "lewat 8 jam");
  });

  test("token yang diubah ditolak", () => {
    const { token } = createSessionToken("USR_1", 1);
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "USR_owner", v: 1, e: Date.now() + 3600_000 })).toString("base64url");
    assert.equal(readSessionToken(`${forged}.${signature}`), null);
    assert.equal(readSessionToken(`${payload}.${signature!.slice(0, -2)}xx`), null);
    assert.equal(readSessionToken("sampah"), null);
    assert.equal(readSessionToken(undefined), null);
  });
});

async function withUsers() {
  const deps = await freshDeps();
  const owner = await createFirstOwner(deps, { username: "pemilik", nama: "Pemilik" });
  const ownerActor = async (): Promise<Actor> => {
    const t = await deps.store.read("inti", ["Pengguna"]);
    return { user: toUser(t.Pengguna!.find((row) => row.user_id === owner.userId)!), links: [] };
  };
  const hash = await hashPassword("Belajar-setiap-hari-1");
  const actor = await ownerActor();
  const created = await runOperation(deps, {
    sheet: "inti",
    operationId: randomUUID(),
    actorId: owner.userId,
    action: "buatAkun",
    fingerprint: { username: "guru.budi" },
    tables: ["Pengguna"],
    apply: (t, ctx) => createUser(t, { username: "guru.budi", nama: "Budi", peran: "PENGAJAR", akses_keuangan: "TIDAK" }, hash, ctx, actor),
  });
  return { deps, owner, ownerActor, guruId: created.outcome.entityId };
}

describe("login", () => {
  test("berhasil dengan username tanpa beda huruf besar/kecil", async () => {
    const { deps } = await withUsers();
    const user = await attemptLogin(deps, { username: "  Guru.Budi ", password: "Belajar-setiap-hari-1", ip: "1.1.1.1" });
    assert.equal(user.username, "guru.budi");
  });

  test("pesan gagal selalu sama", async () => {
    const { deps } = await withUsers();
    const messages = new Set<string>();
    for (const username of ["guru.budi", "tidak.ada"]) {
      await assert.rejects(attemptLogin(deps, { username, password: "salah-123", ip: "2.2.2.2" }), (error: AppError) => {
        messages.add(error.message);
        return error.code === "LOGIN_FAILED";
      });
    }
    assert.equal(messages.size, 1);
  });

  test("dikunci setelah 5 kali salah per akun, walau password lalu benar", async () => {
    const { deps } = await withUsers();
    for (let i = 0; i < MAX_FAILS_PER_ACCOUNT; i += 1) {
      await assert.rejects(attemptLogin(deps, { username: "guru.budi", password: `salah-${i}`, ip: `10.0.0.${i}` }));
    }
    await assert.rejects(attemptLogin(deps, { username: "guru.budi", password: "Belajar-setiap-hari-1", ip: "10.0.0.99" }), (error: AppError) => error.code === "RATE_LIMIT");
  });

  test("dikunci per alamat IP setelah 25 kali salah", async () => {
    const { deps } = await withUsers();
    for (let i = 0; i < 25; i += 1) await assert.rejects(attemptLogin(deps, { username: `acak${i}`, password: "salah-123", ip: "9.9.9.9" }));
    await assert.rejects(attemptLogin(deps, { username: "guru.budi", password: "Belajar-setiap-hari-1", ip: "9.9.9.9" }), (error: AppError) => error.code === "RATE_LIMIT");
    await attemptLogin(deps, { username: "guru.budi", password: "Belajar-setiap-hari-1", ip: "8.8.8.8" });
  });

  test("berhasil masuk menghapus hitungan gagal akun", async () => {
    const { deps } = await withUsers();
    for (let i = 0; i < 4; i += 1) await assert.rejects(attemptLogin(deps, { username: "guru.budi", password: "salah-1", ip: "3.3.3.3" }));
    await attemptLogin(deps, { username: "guru.budi", password: "Belajar-setiap-hari-1", ip: "3.3.3.3" });
    for (let i = 0; i < 4; i += 1) await assert.rejects(attemptLogin(deps, { username: "guru.budi", password: "salah-1", ip: "4.4.4.4" }));
    await attemptLogin(deps, { username: "guru.budi", password: "Belajar-setiap-hari-1", ip: "4.4.4.4" });
  });

  test("akun owner pertama wajib ganti password dan tidak bisa dibuat dua kali", async () => {
    const { deps, owner } = await withUsers();
    assert.equal(owner.password.length, 16);
    const user = await attemptLogin(deps, { username: "pemilik", password: owner.password, ip: "5.5.5.5" });
    assert.equal(user.wajib_ganti_password, true);
    await assert.rejects(createFirstOwner(deps, { username: "pemilik2", nama: "Lain" }), /Sudah ada OWNER/);
  });
});

describe("pencabutan sesi", () => {
  async function sessionFor(deps: Awaited<ReturnType<typeof freshDeps>>, userId: string) {
    const t = await deps.store.read("inti", ["Pengguna", "Tautan_Akun"]);
    const user = toUser(t.Pengguna!.find((row) => row.user_id === userId)!);
    return readSessionToken(createSessionToken(user.user_id, user.versi_otorisasi).token);
  }
  const resolve = async (deps: Awaited<ReturnType<typeof freshDeps>>, claims: ReturnType<typeof readSessionToken>) =>
    resolveActor(await deps.store.read("inti", ["Pengguna", "Tautan_Akun"]), claims);

  const change = async (
    deps: Awaited<ReturnType<typeof freshDeps>>,
    actorId: string,
    apply: Parameters<typeof runOperation>[1]["apply"],
  ) => runOperation(deps, { sheet: "inti", operationId: randomUUID(), actorId, action: "uji", fingerprint: randomUUID(), tables: ["Pengguna"], apply });

  test("sesi sah sampai owner mencabutnya", async () => {
    const { deps, owner, ownerActor, guruId } = await withUsers();
    const claims = await sessionFor(deps, guruId);
    assert.equal((await resolve(deps, claims))?.user.user_id, guruId);
    const actor = await ownerActor();
    await change(deps, owner.userId, (t, ctx) => revokeSessions(t, guruId, ctx, actor));
    assert.equal(await resolve(deps, claims), null);
    assert.ok(await resolve(deps, await sessionFor(deps, guruId)), "masuk ulang mendapat sesi baru");
  });

  test("password sementara baru, ganti peran, dan nonaktif mengakhiri sesi", async () => {
    const { deps, owner, ownerActor, guruId } = await withUsers();
    const actor = await ownerActor();

    let claims = await sessionFor(deps, guruId);
    await change(deps, owner.userId, (t, ctx) => resetPassword(t, guruId, "hash-baru", ctx, actor));
    assert.equal(await resolve(deps, claims), null, "password sementara baru");

    claims = await sessionFor(deps, guruId);
    await change(deps, owner.userId, (t, ctx) => updateUser(t, { user_id: guruId, nama: "Budi", peran: "WALI", aktif: true, akses_keuangan: "TIDAK" }, ctx, actor));
    assert.equal(await resolve(deps, claims), null, "ganti peran");

    claims = await sessionFor(deps, guruId);
    await change(deps, owner.userId, (t, ctx) => updateUser(t, { user_id: guruId, nama: "Budi Baru", peran: "WALI", aktif: true, akses_keuangan: "TIDAK" }, ctx, actor));
    assert.ok(await resolve(deps, claims), "ganti nama saja tidak mengakhiri sesi");

    await change(deps, owner.userId, (t, ctx) => updateUser(t, { user_id: guruId, nama: "Budi Baru", peran: "WALI", aktif: false, akses_keuangan: "TIDAK" }, ctx, actor));
    assert.equal(await resolve(deps, claims), null, "akun nonaktif");
  });

  test("ganti password sendiri mengakhiri sesi lain", async () => {
    const { deps, guruId } = await withUsers();
    const otherDevice = await sessionFor(deps, guruId);
    const t = await deps.store.read("inti", ["Pengguna"]);
    const self: Actor = { user: toUser(t.Pengguna!.find((row) => row.user_id === guruId)!), links: [] };
    const result = await change(deps, guruId, (tables, ctx) => changeOwnPassword(tables, "hash-baru", ctx, self));
    assert.equal(await resolve(deps, otherDevice), null);
    const versi = (result.outcome.data as { versi: number }).versi;
    assert.ok(resolveActor(await deps.store.read("inti", ["Pengguna", "Tautan_Akun"]), readSessionToken(createSessionToken(guruId, versi).token)));
  });
});

describe("password awal owner (aktivasi)", () => {
  test("owner masuk dengan password awal lalu wajib menggantinya", async () => {
    const { setInitialOwnerPassword, createFirstOwner } = await import("../src/lib/setup");
    const { attemptLogin } = await import("../src/lib/auth/login");
    const deps = await freshDeps();
    await createFirstOwner(deps, { username: "admin", nama: "Admin" });
    await setInitialOwnerPassword(deps, "admin");
    const user = await attemptLogin(deps, { username: "admin", password: "admin", ip: "9.9.9.9" });
    assert.equal(user.wajib_ganti_password, true);
    await assert.rejects(setInitialOwnerPassword(deps, "tidak-ada"), /tidak ditemukan/);
  });
});
