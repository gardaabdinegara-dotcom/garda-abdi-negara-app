import { actor, ctx, emptyTables, freshDeps } from "./helpers";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { attemptLogin } from "../src/lib/auth/login";
import { hashPassword } from "../src/lib/auth/password";
import { importStudents, parseNameList } from "../src/lib/core/impor";
import { createStudentAccount, needsPin, pinProblem, resetPin, setFirstPin } from "../src/lib/core/pin";
import { toLink, toUser } from "../src/lib/core/types";
import { runOperation } from "../src/lib/data/coordinator";
import { SheetsLimiter } from "../src/lib/data/sheet-limiter";
import { AppError } from "../src/lib/data/types";
import { randomUUID } from "node:crypto";

describe("daftar nama untuk impor siswa", () => {
  test("nomor urut dan karakter tak terlihat dibuang, huruf dibiarkan", () => {
    const text = "1.FAIZ KHAZIM\n12. Muh Dzaki An Nur\n15. ⁠MUH SULTAN\n\n 7.MUH.WAHYU  HIDAYAT \r\n";
    assert.deepEqual(parseNameList(text), ["FAIZ KHAZIM", "Muh Dzaki An Nur", "MUH SULTAN", "MUH.WAHYU HIDAYAT"]);
  });
});

describe("akun siswa dengan PIN", () => {
  test("aturan PIN: 6 angka, tidak sama semua, tidak berurutan", () => {
    assert.equal(pinProblem("482915"), null);
    assert.match(pinProblem("12345") ?? "", /6 angka/);
    assert.match(pinProblem("12a456") ?? "", /6 angka/);
    assert.match(pinProblem("777777") ?? "", /sama semua/);
    assert.match(pinProblem("123456") ?? "", /berurutan/);
    assert.match(pinProblem("987654") ?? "", /berurutan/);
  });

  test("impor membuat siswa + akun (username = kode, tanpa PIN), perempuan sesuai nomor, nama ganda dilewati", async () => {
    const t = await emptyTables();
    const owner = actor("OWNER");
    const first = importStudents(t, ["FAIZ KHAZIM", "ILUH ALYANI SAPUTRI"], { jalur_target: "TNI", perempuan: [2] }, ctx(), owner);
    assert.deepEqual(first.data!.added.map((s) => s.kode_siswa), ["GAN-0001", "GAN-0002"]);
    const siswa = t.Siswa!;
    assert.deepEqual(siswa.map((s) => [s.nama, s.jenis_kelamin, s.jalur_target]), [
      ["FAIZ KHAZIM", "L", "TNI"],
      ["ILUH ALYANI SAPUTRI", "P", "TNI"],
    ]);
    const users = t.Pengguna!.map(toUser);
    assert.deepEqual(users.map((u) => [u.username, u.peran, u.password_hash, u.wajib_ganti_password]), [
      ["gan-0001", "SISWA", "", false],
      ["gan-0002", "SISWA", "", false],
    ]);
    const links = t.Tautan_Akun!.map(toLink);
    assert.equal(links.length, 2);
    assert.ok(links.every((l) => l.jenis === "SISWA" && l.aktif));
    assert.ok(users.every(needsPin));

    const again = importStudents(t, ["faiz khazim", "RAGIL"], { jalur_target: "TNI" }, ctx(), owner);
    assert.deepEqual(again.data!.skipped, ["faiz khazim"]);
    assert.deepEqual(again.data!.added.map((s) => s.kode_siswa), ["GAN-0003"]);
  });

  test("akun siswa tidak dibuat dua kali, dan hanya pengelola akun yang boleh", async () => {
    const t = await emptyTables();
    const owner = actor("OWNER");
    importStudents(t, ["FAIZ KHAZIM"], { jalur_target: "TNI" }, ctx(), owner);
    const siswaId = String(t.Siswa![0]!.siswa_id);
    const again = createStudentAccount(t, siswaId, ctx(), owner);
    assert.equal(again.data!.created, false);
    assert.equal(t.Pengguna!.length, 1);
    assert.throws(() => createStudentAccount(t, siswaId, ctx(), actor("SISWA")), (e: unknown) => e instanceof AppError && e.status === 403);
  });

  test("PIN pertama hanya bisa dibuat sekali; reset oleh owner mengosongkan PIN dan mengakhiri sesi", async () => {
    const t = await emptyTables();
    const owner = actor("OWNER");
    importStudents(t, ["FAIZ KHAZIM"], { jalur_target: "TNI" }, ctx(), owner);
    const hash = await hashPassword("482915");
    const made = setFirstPin(t, "GAN-0001", hash, ctx());
    const after = toUser(t.Pengguna![0]!);
    assert.equal(after.password_hash, hash);
    assert.equal(made.data!.versi, 2);
    assert.throws(() => setFirstPin(t, "gan-0001", hash, ctx()), (e: unknown) => e instanceof AppError && e.code === "PIN_EXISTS");

    resetPin(t, after.user_id, ctx(), owner);
    const reset = toUser(t.Pengguna![0]!);
    assert.equal(reset.password_hash, "");
    assert.equal(reset.versi_otorisasi, 3);
    assert.ok(needsPin(reset));
    assert.throws(() => resetPin(t, after.user_id, ctx(), actor("SISWA")), (e: unknown) => e instanceof AppError && e.status === 403);
  });

  test("siswa masuk dengan kode siswa + PIN; PIN kosong atau salah ditolak", async () => {
    const deps = await freshDeps();
    const owner = actor("OWNER");
    await runOperation(deps, {
      sheet: "inti",
      operationId: randomUUID(),
      actorId: owner.user.user_id,
      action: "imporSiswa",
      fingerprint: {},
      tables: ["Pengaturan", "Siswa", "Pengguna", "Tautan_Akun"],
      apply: (t, c) => importStudents(t, ["FAIZ KHAZIM"], { jalur_target: "TNI" }, c, owner),
    });
    const hash = await hashPassword("482915");
    await runOperation(deps, { sheet: "inti", operationId: randomUUID(), actorId: "PIN:gan-0001", action: "buatPin", fingerprint: {}, tables: ["Pengguna"], apply: (t, c) => setFirstPin(t, "gan-0001", hash, c) });
    const user = await attemptLogin(deps, { username: "GAN-0001", password: "482915", ip: "1.1.1.1" });
    assert.equal(user.username, "gan-0001");
    await assert.rejects(attemptLogin(deps, { username: "gan-0001", password: "", ip: "1.1.1.1" }), (e: unknown) => e instanceof AppError && e.code === "LOGIN_FAILED");
    await assert.rejects(attemptLogin(deps, { username: "gan-0001", password: "111222", ip: "1.1.1.1" }), (e: unknown) => e instanceof AppError && e.code === "LOGIN_FAILED");
  });
});

describe("batas salah masuk di spreadsheet (tanpa Redis)", () => {
  test("hitungan bertambah, kedaluwarsa setelah jendela waktu, dan bisa direset", async () => {
    const deps = await freshDeps();
    let now = Date.parse("2026-11-17T01:00:00Z");
    const limiter = new SheetsLimiter(deps.store, "inti", () => now);
    assert.equal(await limiter.hit("login:akun:gan-0001", 900), 1);
    assert.equal(await limiter.hit("login:akun:gan-0001", 900), 2);
    assert.equal(await limiter.count("login:akun:gan-0001"), 2);
    now += 901_000;
    assert.equal(await limiter.count("login:akun:gan-0001"), 0);
    assert.equal(await limiter.hit("login:akun:gan-0001", 900), 1, "baris lama dipakai ulang");
    await limiter.reset("login:akun:gan-0001");
    assert.equal(await limiter.count("login:akun:gan-0001"), 0);
    const rows = (await deps.store.read("inti", ["Batas_Masuk"])).Batas_Masuk!;
    assert.equal(rows.length, 1);
  });

  test("alamat IP disimpan sebagai sidik jari, bukan apa adanya", async () => {
    const deps = await freshDeps();
    const limiter = new SheetsLimiter(deps.store);
    await limiter.hit("login:ip:203.0.113.7", 900);
    const rows = (await deps.store.read("inti", ["Batas_Masuk"])).Batas_Masuk!;
    assert.ok(!JSON.stringify(rows).includes("203.0.113.7"));
    assert.equal(await limiter.count("login:ip:203.0.113.7"), 1);
  });
});
