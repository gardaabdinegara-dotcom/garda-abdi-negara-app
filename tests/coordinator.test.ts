import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import { createStudent, createUser } from "../src/lib/core/domain";
import { studentInput } from "../src/lib/core/validation";
import { runOperation, type RunOptions } from "../src/lib/data/coordinator";
import { MemoryGate } from "../src/lib/data/gate";
import { MemoryStore } from "../src/lib/data/memory-store";
import { AppError, StoreError, type Tables } from "../src/lib/data/types";
import { setupSheets } from "../src/lib/setup";
import { actor, freshDeps } from "./helpers";

const admin = actor("ADMIN");
const input = (nama: string) => studentInput.parse({ nama, jenis_kelamin: "P", jalur_target: "Polri" });

function addStudent(operationId: string, nama: string, actorId = admin.user.user_id): RunOptions<unknown> {
  return {
    sheet: "inti",
    operationId,
    actorId,
    action: "tambahSiswa",
    fingerprint: { nama },
    tables: ["Pengaturan", "Siswa"],
    apply: (t, ctx) => createStudent(t, input(nama), ctx, admin),
  };
}

const students = async (deps: { store: MemoryStore }) => (await deps.store.read("inti", ["Siswa"])).Siswa!;
const operations = async (deps: { store: MemoryStore }) => (await deps.store.read("inti", ["Operasi"])).Operasi!;

describe("koordinator penyimpanan", () => {
  test("kirim ulang dengan operation_id sama tidak menyimpan dua kali", async () => {
    const deps = await freshDeps();
    const id = randomUUID();
    const first = await runOperation(deps, addStudent(id, "Andi"));
    const again = await runOperation(deps, addStudent(id, "Andi"));
    assert.equal(first.replayed, false);
    assert.equal(again.replayed, true);
    assert.equal(again.outcome.entityId, first.outcome.entityId);
    assert.equal((await students(deps)).length, 1);
    assert.equal((await operations(deps)).length, 1);
  });

  test("operation_id yang dipakai ulang untuk isi lain atau pengguna lain ditolak", async () => {
    const deps = await freshDeps();
    const id = randomUUID();
    await runOperation(deps, addStudent(id, "Andi"));
    await assert.rejects(runOperation(deps, addStudent(id, "Budi")), (error: AppError) => error.code === "OPERATION_CONFLICT");
    await assert.rejects(runOperation(deps, addStudent(id, "Andi", "USR_lain")), (error: AppError) => error.code === "OPERATION_CONFLICT");
    assert.equal((await students(deps)).length, 1);
  });

  test("operation_id harus UUID", async () => {
    const deps = await freshDeps();
    await assert.rejects(runOperation(deps, addStudent("123", "Andi")), (error: AppError) => error.code === "OPERATION_ID");
  });

  test("operasi bersamaan diantrikan sehingga kode siswa tetap unik", async () => {
    const deps = await freshDeps();
    const names = Array.from({ length: 8 }, (_, i) => `Siswa ${i + 1}`);
    await Promise.all(names.map((nama) => runOperation(deps, addStudent(randomUUID(), nama))));
    const codes = (await students(deps)).map((row) => row.kode_siswa).sort();
    assert.deepEqual(codes, names.map((_, i) => `GAN-${String(i + 1).padStart(4, "0")}`));
  });

  test("gagal di tengah perintah tidak menulis apa pun", async () => {
    const deps = await freshDeps();
    await assert.rejects(
      runOperation(deps, {
        ...addStudent(randomUUID(), "Andi"),
        apply: (t, ctx) => {
          createStudent(t, input("Andi"), ctx, admin);
          throw new AppError("batal");
        },
      }),
      /batal/,
    );
    assert.equal((await students(deps)).length, 0);
    assert.equal((await operations(deps)).length, 0);
  });

  test("tulis tidak pasti: pesan aman, lalu kirim ulang tidak menggandakan", async () => {
    class FlakyStore extends MemoryStore {
      failNext = true;
      override async commit(sheet: "inti" | "keuangan", before: Tables, after: Tables) {
        await super.commit(sheet, before, after);
        if (this.failNext) {
          this.failNext = false;
          // Data sampai ke spreadsheet tetapi jawabannya hilang di jalan.
          throw new StoreError("timeout", true);
        }
      }
    }
    const deps = { store: new FlakyStore(), gate: new MemoryGate() };
    await setupSheets(deps, true);
    const id = randomUUID();
    await assert.rejects(runOperation(deps, addStudent(id, "Andi")), (error: AppError) => error.code === "WRITE_UNCERTAIN" && error.status === 202);
    const retry = await runOperation(deps, addStudent(id, "Andi"));
    assert.equal(retry.replayed, true);
    assert.equal((await students(deps)).length, 1);
  });

  test("gerbang dilepas walau operasi gagal", async () => {
    const deps = await freshDeps();
    await assert.rejects(runOperation(deps, { ...addStudent(randomUUID(), "X"), apply: () => { throw new AppError("gagal"); } }));
    const started = Date.now();
    await runOperation(deps, addStudent(randomUUID(), "Andi"));
    assert.ok(Date.now() - started < 1000);
  });

  test("gerbang yang terus dipegang menghasilkan pesan coba lagi", async () => {
    const deps = await freshDeps();
    await deps.gate.acquire("inti", "lain");
    await assert.rejects(runOperation(deps, addStudent(randomUUID(), "Andi")), (error: AppError) => error.code === "WRITE_PENDING");
  });

  test("jejak operasi tidak menyimpan hash password atau password sementara", async () => {
    const deps = await freshDeps();
    const owner = actor("OWNER");
    await runOperation(deps, {
      sheet: "inti",
      operationId: randomUUID(),
      actorId: owner.user.user_id,
      action: "buatAkun",
      fingerprint: { username: "guru" },
      tables: ["Pengguna"],
      apply: (t, ctx) => ({ ...createUser(t, { username: "guru", nama: "Guru", peran: "PENGAJAR", akses_keuangan: "TIDAK" }, "scrypt$HASHRAHASIA", ctx, owner), secret: "PasswordSementara9" }),
    });
    const [op] = await operations(deps);
    const text = JSON.stringify(op);
    assert.ok(!text.includes("HASHRAHASIA"));
    assert.ok(!text.includes("PasswordSementara9"));
    assert.match(String(op!.after_json), /"username":"guru"/);
  });
});
