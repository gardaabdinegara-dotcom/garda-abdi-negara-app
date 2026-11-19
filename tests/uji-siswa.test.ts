import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { verifyPassword } from "../src/lib/auth/password";
import { createQrToken, readQrToken } from "../src/lib/auth/qr";
import { canTestAsStudent, createUjiSiswaToken, readUjiSiswaToken } from "../src/lib/auth/uji-siswa";
import { changeOwnPassword } from "../src/lib/core/domain";
import { buatKiriman, isiForm } from "../src/lib/core/latihan-soal";
import { saveLatihan } from "../src/lib/core/latihan-simpan";
import { toLink, toUser, type Actor } from "../src/lib/core/types";
import { runOperation } from "../src/lib/data/coordinator";
import { MemoryGate } from "../src/lib/data/gate";
import { UjiSiswaStore } from "../src/lib/data/uji-siswa-store";
import { buildSiswaUji, PIN_SISWA_UJI } from "../src/lib/demo/siswa-uji";

process.env.AUTH_SECRET = "kunci-semata-untuk-unit-test-uji-siswa";
const START = Date.parse("2026-11-19T08:00:00+07:00");
const prefix = "rg_us_sesi_uji_";

describe("Mode Uji Siswa", () => {
  it("terikat ke login staf dan kedaluwarsa setelah empat jam", async () => {
    const { data, userId } = await buildSiswaUji(START);
    const student = toUser(data.inti.Pengguna!.find((row) => row.user_id === userId)!);
    assert.equal(canTestAsStudent(student), false);
    assert.equal(canTestAsStudent({ ...student, peran: "OWNER" }), true);
    assert.equal(canTestAsStudent({ ...student, peran: "ADMIN" }), true);
    assert.equal(canTestAsStudent({ ...student, peran: "ADMIN", wajib_ganti_password: true }), false);
    assert.equal(await verifyPassword(PIN_SISWA_UJI, student.password_hash), true);
    const token = createUjiSiswaToken("login-staf", START);
    assert.ok(readUjiSiswaToken(token, "login-staf", START));
    assert.equal(readUjiSiswaToken(token, "login-lain", START), null);
    assert.equal(readUjiSiswaToken(token, "login-staf", START + 4 * 3600_000), null);
  });

  it("memisahkan token QR asli dari QR masing-masing sesi uji", () => {
    const live = createQrToken("sesi-1", START).token;
    const demo = createQrToken("sesi-1", START, "uji-1").token;
    assert.equal(readQrToken(live, START), "sesi-1");
    assert.equal(readQrToken(demo, START, "uji-1"), "sesi-1");
    assert.equal(readQrToken(live, START, "uji-1"), null);
    assert.equal(readQrToken(demo, START), null);
    assert.equal(readQrToken(demo, START, "uji-2"), null);
  });

  it("memuat hasil dan PIN uji pada instance berikutnya serta mencegah duplikasi kiriman", async () => {
    const journal: { name: string; value: string }[] = [];
    const scope = createUjiSiswaToken("login-staf", START);
    async function storeFor(entries = [...journal], token = scope) {
      const { data, userId } = await buildSiswaUji(START);
      const store = new UjiSiswaStore(data, token, prefix, entries, (entry) => journal.push(entry));
      const { Pengguna, Tautan_Akun } = await store.read("inti", ["Pengguna", "Tautan_Akun"]);
      const actor: Actor = {
        user: toUser(Pengguna!.find((row) => row.user_id === userId)!),
        links: Tautan_Akun!.map(toLink).filter((link) => link.user_id === userId),
      };
      return { store, actor, gate: new MemoryGate() };
    }
    const workerOne = await storeFor();
    const workerTwo = await storeFor();
    const input = {
      jenis: "kraepelin", durasi: "singkat", mulai: new Date(START).toISOString(),
      detik: 15, seri: [{ benar: 4, jawab: 5 }],
    };
    const practice = {
      sheet: "inti" as const, action: "simpanLatihan", operationId: randomUUID(),
      actorId: workerOne.actor.user.user_id, fingerprint: input, tables: ["Pengaturan", "Siswa"],
      apply: (tables: Parameters<typeof saveLatihan>[0], ctx: Parameters<typeof saveLatihan>[2]) =>
        saveLatihan(tables, input, ctx, workerOne.actor),
    };
    // Dua permintaan dengan snapshot cookie yang sama tetap menghasilkan perubahan yang terpisah.
    const { outcome } = await runOperation(workerOne, practice);
    await runOperation(workerTwo, {
      sheet: "inti", operationId: randomUUID(), actorId: workerTwo.actor.user.user_id,
      action: "gantiPassword", fingerprint: {}, tables: ["Pengguna"],
      apply: (tables, ctx) => changeOwnPassword(tables, "hash-pin-baru", ctx, workerTwo.actor),
    });
    assert.equal(journal.length, 2);
    assert.ok(journal.every((entry) => !entry.value.includes("hash-pin-baru")));

    const reloaded = await storeFor();
    assert.equal(reloaded.actor.user.password_hash, "hash-pin-baru");
    const replay = await runOperation(reloaded, practice);
    assert.equal(replay.replayed, true);
    assert.equal(replay.outcome.entityId, outcome.entityId);
    const results = (await reloaded.store.read("inti", ["Latihan_Psikotes"])).Latihan_Psikotes!;
    assert.equal(results.filter((row) => row.latihan_id === outcome.entityId).length, 1);

    await assert.rejects(storeFor(journal, createUjiSiswaToken("login-staf", START)), { code: "UJI_SISWA_INVALID" });
    const reset = await storeFor([]);
    assert.equal(await reset.store.findOperation("inti", practice.operationId), null);
    assert.equal(await verifyPassword(PIN_SISWA_UJI, reset.actor.user.password_hash), true);
  });

  it("membawa penanda sesi pada hasil tertunda tanpa mengubah format kiriman reguler", () => {
    const input = {
      operationId: randomUUID(), jenis: "kraepelin" as const, durasi: "singkat" as const,
      mulai: new Date(START).toISOString(), dibuat: new Date(START + 8000).toISOString(), pemilik: "SIS_UJI",
      ringkas: { seri: [{ benar: 4, jawab: 5 }], detik: 8 },
    };
    const scope = "0123456789abcdef0123456789abcdef";
    assert.equal(Object.fromEntries(isiForm(buatKiriman(input))).uji_siswa, undefined);
    assert.equal(Object.fromEntries(isiForm(buatKiriman({ ...input, ujiSiswa: scope }))).uji_siswa, scope);
  });
});
