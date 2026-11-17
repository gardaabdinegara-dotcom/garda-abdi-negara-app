// Pengganti 4 tes infrastruktur aplikasi Keuangan lama (penolakan di Redis, migrasi Sheets, dan pemulihan
// perintah di browser) untuk infrastruktur Ruang Garda: koordinator operasi dan SheetsStore.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { JWT } from "google-auth-library";
import type { Actor } from "../../src/lib/core/types";
import { runOperation } from "../../src/lib/data/coordinator";
import { KEUANGAN } from "../../src/lib/data/schema";
import { SheetsStore } from "../../src/lib/data/sheets-store";
import { AppError, type Cell, type Tables } from "../../src/lib/data/types";
import { applyFinanceCommand, FINANCE_TABLES } from "../../src/lib/keuangan/sumber";
import { INTI_TABLES } from "../helpers";
import { persisted, readyFixture } from "./fixture";

type Store = Awaited<ReturnType<typeof readyFixture>>["deps"];

const finance = (deps: Store, actor: Actor, operationId: string, action: string, data: Record<string, unknown>) =>
  deps.store.read("inti", ["Pengaturan", "Pengguna", "Siswa", "Program", "Kelas", "Pendaftaran"]).then((inti) =>
    runOperation(deps, {
      sheet: "keuangan",
      operationId,
      actorId: actor.user.user_id,
      action,
      fingerprint: { action, data },
      tables: FINANCE_TABLES,
      apply: (t, ctx) => applyFinanceCommand(inti, t, { action, data }, ctx, actor),
    }),
  );

const operations = async (deps: Store) => (await deps.store.read("keuangan", ["Operasi_Keuangan"])).Operasi_Keuangan!.length;

test("penolakan tidak menulis apa pun; kirim ulang dengan ID sama dievaluasi ulang dan tetap ditolak", async () => {
  const f = await persisted();
  const invoice = { pendaftaran_id: f.dafAndi, tanggal_terbit: "2026-11-05", periode_layanan: "", diskon_awal: "0" };
  await finance(f.deps, f.recorder, randomUUID(), "invoice.create", invoice);
  const tagihan = String((await f.deps.store.read("keuangan", ["Tagihan"])).Tagihan![0]!.tagihan_id);
  const before = await operations(f.deps);
  const id = randomUUID();
  const tooMuch = { tagihan_id: tagihan, akun_id: f.akun, tanggal_transaksi: "2026-11-06", nominal: "2000000" };
  for (let i = 0; i < 2; i += 1) {
    await assert.rejects(finance(f.deps, f.recorder, id, "payment.create", tooMuch), (e: AppError) => /melebihi sisa/.test(e.message));
  }
  assert.equal(await operations(f.deps), before, "tidak ada jejak operasi untuk perintah yang ditolak");
  assert.equal((await f.deps.store.read("keuangan", ["Transaksi"])).Transaksi!.length, 0);
});

test("gerbang: sibuk saat operasi lain berjalan, lalu kirim ulang aman setelah selesai", async () => {
  const f = await persisted();
  const invoice = { pendaftaran_id: f.dafAndi, tanggal_terbit: "2026-11-05", periode_layanan: "", diskon_awal: "0" };
  const lease = await f.deps.gate.acquire("keuangan", "operasi-lain");
  const id = randomUUID();
  await assert.rejects(finance(f.deps, f.recorder, id, "invoice.create", invoice), (e: AppError) => e.code === "WRITE_PENDING");
  await f.deps.gate.release(lease);
  const first = await finance(f.deps, f.recorder, id, "invoice.create", invoice);
  const again = await finance(f.deps, f.recorder, id, "invoice.create", invoice);
  assert.equal(first.replayed, false);
  assert.equal(again.replayed, true, "operasi yang sudah tersimpan dikenali, bukan ditulis ulang");
  assert.equal((await f.deps.store.read("keuangan", ["Tagihan"])).Tagihan!.length, 1);
});

test("kirim ulang mempertahankan ID dan isi asli; akun atau isi berbeda ditolak", async () => {
  const f = await persisted();
  const invoice = { pendaftaran_id: f.dafAndi, tanggal_terbit: "2026-11-05", periode_layanan: "", diskon_awal: "0" };
  const id = randomUUID();
  await finance(f.deps, f.recorder, id, "invoice.create", invoice);
  await assert.rejects(finance(f.deps, f.owner, id, "invoice.create", invoice), (e: AppError) => e.code === "OPERATION_CONFLICT");
  await assert.rejects(finance(f.deps, f.recorder, id, "invoice.create", { ...invoice, tanggal_terbit: "2026-11-06" }), (e: AppError) => e.code === "OPERATION_CONFLICT");
  await assert.rejects(finance(f.deps, f.recorder, "bukan-uuid", "invoice.create", invoice), (e: AppError) => e.code === "OPERATION_ID");
  assert.equal((await f.deps.store.read("keuangan", ["Tagihan"])).Tagihan!.length, 1);
});

test("penyiapan spreadsheet Keuangan menambah tab yang kurang, mempertahankan data lama, dan dapat diulang (API tiruan)", async (context) => {
  context.mock.method(JWT.prototype, "getAccessToken", async () => ({ token: "token-uji" }));
  type FakeSheet = { id: number; title: string; rows: Cell[][] };
  const existing = ["Pengaturan_Keuangan", "Akun", "Transaksi"] as const;
  const sheets: FakeSheet[] = existing.map((title, id) => ({ id, title, rows: [[...KEUANGAN[title].columns]] }));
  sheets.find((s) => s.title === "Akun")!.rows.push(["AKN_kas", "Kas tunai", "KAS", 250000, "2026-01-01", true]);
  sheets.push({ id: 50, title: "Sheet1", rows: [["Catatan lama", 123]] });
  const preserved = JSON.stringify(sheets.filter((s) => ["Akun", "Sheet1"].includes(s.title)).map((s) => s.rows));
  let writes = 0;
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request, options?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://sheets.googleapis.com");
    const reply = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.pathname.endsWith("/values:batchGet")) {
      return reply({ valueRanges: url.searchParams.getAll("ranges").map((range) => ({ values: sheets.find((s) => s.title === range.split("'")[1])!.rows })) });
    }
    if (url.pathname.endsWith(":batchUpdate")) {
      writes += 1;
      const body = JSON.parse(String(options?.body)) as { requests: Record<string, any>[] };
      const decode = (row: { values: { userEnteredValue: Record<string, Cell> }[] }) => row.values.map((cell) => Object.values(cell.userEnteredValue)[0]!);
      for (const request of body.requests) {
        if (request.addSheet) sheets.push({ id: request.addSheet.properties.sheetId, title: request.addSheet.properties.title, rows: [] });
        if (request.updateCells) {
          const sheet = sheets.find((s) => s.id === request.updateCells.start.sheetId)!;
          request.updateCells.rows.forEach((row: never, i: number) => (sheet.rows[request.updateCells.start.rowIndex + i] = decode(row)));
        }
        if (request.appendCells) sheets.find((s) => s.id === request.appendCells.sheetId)!.rows.push(...request.appendCells.rows.map(decode));
      }
      return reply({});
    }
    return reply({ sheets: sheets.map((s) => ({ properties: { sheetId: s.id, title: s.title, gridProperties: { rowCount: 1000, columnCount: 26 } } })) });
  });
  const store = new SheetsStore({ clientEmail: "uji@example.invalid", privateKey: "HANYA-UJI", spreadsheetIds: { inti: "inti-uji", keuangan: "keuangan-uji" }, timeZone: "Asia/Jakarta" });
  const defs = Object.values(KEUANGAN);
  const added = await store.ensureTables("keuangan", defs, { Pengaturan_Keuangan: [{ key: "schema_version", value: "1" }] });
  await store.read("keuangan", Object.keys(KEUANGAN), { fresh: true });
  assert.equal(writes, 1);
  assert.deepEqual(new Set(added), new Set(Object.keys(KEUANGAN).filter((name) => !existing.includes(name as never))));
  assert.equal(JSON.stringify(sheets.filter((s) => ["Akun", "Sheet1"].includes(s.title)).map((s) => s.rows)), preserved, "data lama dan tab lain tidak tersentuh");
  assert.deepEqual(await store.ensureTables("keuangan", defs, {}), []);
  assert.equal(writes, 1, "mengulang penyiapan tidak menulis apa pun");
  const akun = (await store.read("keuangan", ["Akun"], { fresh: true })).Akun!;
  assert.equal(akun[0]!.saldo_awal, 250000);
  sheets.find((s) => s.title === "Akun")!.rows[0]![0] = "header-berubah";
  await assert.rejects(store.read("keuangan", ["Akun"], { fresh: true }), /Header tab Akun berubah/);
});

