import { actor, ctx, emptyTables, freshDeps } from "./helpers";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import {
  canManagePengumuman,
  daftarPengumuman,
  hapusPengumuman,
  hariIniLembaga,
  PENGUMUMAN_ISI_MAX,
  pengumumanInput,
  pengumumanLewat,
  pengumumanTampil,
  simpanPengumuman,
  teksWaPengumuman,
  toPengumuman,
  type Pengumuman,
} from "../src/lib/core/pengumuman";
import { ROLES } from "../src/lib/core/types";
import { runOperation } from "../src/lib/data/coordinator";
import { AppError } from "../src/lib/data/types";

const TODAY = "2026-11-20";
const owner = actor("OWNER");
const input = (over: Partial<Record<string, unknown>> = {}) =>
  pengumumanInput.parse({ judul: "Tes Samapta III", isi: "Minggu, 29 Nov 06.00 di lapangan. Bawa sepatu lari.", tampil_sampai: "2026-11-29", disematkan: false, ...over });

const info = (id: string, over: Partial<Pengumuman> = {}): Pengumuman => ({
  pengumuman_id: id,
  judul: id,
  isi: "isi",
  tampil_sampai: "2026-11-30",
  disematkan: false,
  status: "AKTIF",
  created_at: "2026-11-10T01:00:00.000Z",
  created_by: "USR_1",
  updated_at: "",
  ...over,
});

describe("pengumuman dari pelatih", () => {
  test("hanya owner dan admin yang boleh mengelola", () => {
    assert.deepEqual(
      ROLES.filter((role) => canManagePengumuman(actor(role))),
      ["OWNER", "ADMIN"],
    );
  });

  test("owner menerbitkan pengumuman baru dengan status AKTIF", async () => {
    const t = await emptyTables();
    const result = simpanPengumuman(t, input({ disematkan: true }), TODAY, ctx(owner.user.user_id), owner);
    assert.equal(t.Pengumuman!.length, 1);
    const p = toPengumuman(t.Pengumuman![0]!);
    assert.equal(p.pengumuman_id, result.entityId);
    assert.match(p.pengumuman_id, /^PNG_/);
    assert.deepEqual([p.judul, p.tampil_sampai, p.disematkan, p.status, p.created_by], ["Tes Samapta III", "2026-11-29", true, "AKTIF", owner.user.user_id]);
  });

  test("siswa, wali, dan pengajar ditolak", async () => {
    const t = await emptyTables();
    for (const role of ["SISWA", "WALI", "PENGAJAR"] as const) {
      assert.throws(() => simpanPengumuman(t, input(), TODAY, ctx(), actor(role)), (e: unknown) => e instanceof AppError && e.status === 403, role);
    }
    simpanPengumuman(t, input(), TODAY, ctx(), owner);
    const id = String(t.Pengumuman![0]!.pengumuman_id);
    assert.throws(() => hapusPengumuman(t, id, ctx(), actor("SISWA")), (e: unknown) => e instanceof AppError && e.status === 403);
  });

  test("tanggal tampil sampai: boleh hari ini, tidak boleh lewat, paling lama setahun", async () => {
    const t = await emptyTables();
    assert.doesNotThrow(() => simpanPengumuman(t, input({ tampil_sampai: TODAY }), TODAY, ctx(), owner));
    assert.throws(() => simpanPengumuman(t, input({ tampil_sampai: "2026-11-19" }), TODAY, ctx(), owner), /sebelum hari ini/);
    assert.throws(() => simpanPengumuman(t, input({ tampil_sampai: "2027-12-01" }), TODAY, ctx(), owner), /satu tahun/);
  });

  test("validasi isian: judul dan isi wajib, isi paling banyak 500 karakter", () => {
    assert.equal(pengumumanInput.safeParse({ judul: " ", isi: "x", tampil_sampai: TODAY }).success, false);
    assert.equal(pengumumanInput.safeParse({ judul: "A", isi: "", tampil_sampai: TODAY }).success, false);
    assert.equal(pengumumanInput.safeParse({ judul: "A", isi: "x".repeat(PENGUMUMAN_ISI_MAX), tampil_sampai: TODAY }).success, true);
    assert.equal(pengumumanInput.safeParse({ judul: "A", isi: "x".repeat(PENGUMUMAN_ISI_MAX + 1), tampil_sampai: TODAY }).success, false);
    assert.equal(pengumumanInput.safeParse({ judul: "A", isi: "x", tampil_sampai: "29/11/2026" }).success, false);
    assert.equal(input({ isi: "Baris satu\r\nBaris dua  " }).isi, "Baris satu\nBaris dua");
  });

  test("ubah mempertahankan waktu terbit; pengumuman terhapus tidak bisa diubah", async () => {
    const t = await emptyTables();
    const first = simpanPengumuman(t, input(), TODAY, { ...ctx(owner.user.user_id), now: "2026-11-19T02:00:00.000Z" }, owner);
    const created = String(t.Pengumuman![0]!.created_at);
    simpanPengumuman(t, input({ pengumuman_id: first.entityId, judul: "Tes Samapta III (diundur)", disematkan: true }), TODAY, ctx(owner.user.user_id), owner);
    assert.equal(t.Pengumuman!.length, 1);
    const p = toPengumuman(t.Pengumuman![0]!);
    assert.equal(p.judul, "Tes Samapta III (diundur)");
    assert.equal(p.disematkan, true);
    assert.equal(p.created_at, created);
    hapusPengumuman(t, first.entityId, ctx(), owner);
    assert.throws(() => simpanPengumuman(t, input({ pengumuman_id: first.entityId }), TODAY, ctx(), owner), (e: unknown) => e instanceof AppError && e.status === 404);
  });

  test("hapus hanya menandai DIHAPUS, baris tetap ada, dan tidak tampil lagi", async () => {
    const t = await emptyTables();
    const a = simpanPengumuman(t, input({ judul: "A" }), TODAY, ctx(), owner);
    simpanPengumuman(t, input({ judul: "B" }), TODAY, ctx(), owner);
    hapusPengumuman(t, a.entityId, ctx(), owner);
    assert.equal(t.Pengumuman!.length, 2);
    assert.equal(t.Pengumuman!.find((r) => r.pengumuman_id === a.entityId)!.status, "DIHAPUS");
    const list = daftarPengumuman(t);
    assert.deepEqual(pengumumanTampil(list, TODAY).map((p) => p.judul), ["B"]);
    assert.deepEqual(pengumumanLewat(list, "2026-12-31").map((p) => p.judul), ["B"]);
    // Menghapus dua kali tidak galat.
    assert.match(hapusPengumuman(t, a.entityId, ctx(), owner).message, /sudah dihapus/);
  });

  test("urutan tampil: disematkan dulu, lalu terbaru; yang lewat hilang sendiri", () => {
    const list = [
      info("lama", { created_at: "2026-11-01T01:00:00.000Z" }),
      info("baru", { created_at: "2026-11-18T01:00:00.000Z" }),
      info("sematan", { created_at: "2026-11-05T01:00:00.000Z", disematkan: true }),
      info("habis-kemarin", { tampil_sampai: "2026-11-19", created_at: "2026-11-19T01:00:00.000Z" }),
      info("habis-hari-ini", { tampil_sampai: TODAY, created_at: "2026-11-12T01:00:00.000Z" }),
      info("dihapus", { status: "DIHAPUS", created_at: "2026-11-19T05:00:00.000Z" }),
    ];
    assert.deepEqual(pengumumanTampil(list, TODAY).map((p) => p.pengumuman_id), ["sematan", "baru", "habis-hari-ini", "lama"]);
    assert.deepEqual(pengumumanLewat(list, TODAY).map((p) => p.pengumuman_id), ["habis-kemarin"]);
  });

  test("hari ini mengikuti zona waktu lembaga", () => {
    const now = "2026-11-19T16:30:00.000Z"; // 23.30 WIB, 00.30 WITA
    assert.equal(hariIniLembaga({ Pengaturan: [{ key: "zona_waktu", value: "Asia/Jakarta" }] }, now), "2026-11-19");
    assert.equal(hariIniLembaga({ Pengaturan: [{ key: "zona_waktu", value: "Asia/Makassar" }] }, now), "2026-11-20");
    assert.equal(hariIniLembaga({ Pengaturan: [] }, now), "2026-11-19");
  });

  test("teks WA berisi judul tebal lalu isi", () => {
    assert.equal(teksWaPengumuman({ judul: " Libur sesi ", isi: "Sesi Senin dipindah ke Selasa. " }), "*Libur sesi*\nSesi Senin dipindah ke Selasa.");
  });

  test("lewat koordinator: tersimpan, hapus tidak mencabut baris spreadsheet", async () => {
    const deps = await freshDeps();
    const run = (action: string, apply: Parameters<typeof runOperation>[1]["apply"]) =>
      runOperation(deps, { sheet: "inti", operationId: randomUUID(), actorId: owner.user.user_id, action, fingerprint: { action }, tables: ["Pengaturan", "Pengumuman"], apply });
    const made = await run("simpan", (t, c) => {
      const today = hariIniLembaga(t, c.now);
      return simpanPengumuman(t, input({ tampil_sampai: today }), today, c, owner);
    });
    await run("hapus", (t, c) => hapusPengumuman(t, made.outcome.entityId, c, owner));
    const t = await deps.store.read("inti", ["Pengumuman"]);
    assert.equal(t.Pengumuman!.length, 1);
    assert.equal(t.Pengumuman![0]!.status, "DIHAPUS");
  });
});
