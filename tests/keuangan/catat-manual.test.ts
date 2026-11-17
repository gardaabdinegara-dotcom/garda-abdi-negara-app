// Keuangan catat manual (arah 17 Nov 2026): kategori lembaga siap laporan, serta ubah/hapus transaksi oleh owner.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildCommand } from "../../src/lib/keuangan/form-commands";
import { composeState } from "../../src/lib/keuangan/sumber";
import { financialStatements } from "../../src/lib/keuangan/reporting";
import { reversedIds } from "../../src/lib/keuangan/ringkasan";
import { financeFixture, run } from "./fixture";

async function started() {
  const f = await financeFixture();
  run(f, f.owner, "finance.bootstrap", { tanggal_saldo_awal: "2026-11-01" });
  const cash = String(f.keu.Akun![0]!.akun_id);
  return { ...f, cash };
}

const income = (f: Awaited<ReturnType<typeof started>>, nominal: string, deskripsi = "Pembayaran bimbel Andi") =>
  run(f, f.owner, "transaction.create", { jenis: "PENERIMAAN_LAIN", akun_id: f.cash, kategori_id: "KTG_bimbel", nominal, tanggal_transaksi: "2026-11-05", deskripsi });

describe("keuangan catat manual", () => {
  test("persiapan membuat kategori lembaga yang sudah dipetakan dan dasar laporan", async () => {
    const f = await started();
    const ids = f.keu.Kategori!.map((k) => String(k.kategori_id));
    for (const id of ["KTG_bimbel", "KTG_pendaftaran", "KTG_lain", "KTG_honor", "KTG_sewa", "KTG_operasional"]) assert.ok(ids.includes(id), id);
    const map = new Map(f.keu.Pemetaan_Laporan!.map((m) => [String(m.kategori_id), String(m.kelompok)]));
    assert.equal(map.get("KTG_bimbel"), "PENDAPATAN");
    assert.equal(map.get("KTG_honor"), "GAJI");
    assert.equal(map.size, ids.length, "setiap kategori bawaan sudah dipetakan");
    const settings = new Map(f.keu.Pengaturan_Keuangan!.map((r) => [String(r.key), String(r.value)]));
    assert.equal(settings.get("reporting_start"), "2026-11-01");
    assert.equal(settings.get("reporting_basis"), "KAS_DISESUAIKAN");
  });

  test("pemasukan manual langsung menjadi pendapatan jasa di laba rugi", async () => {
    const f = await started();
    income(f, "1500000");
    run(f, f.owner, "transaction.create", { jenis: "BIAYA", akun_id: f.cash, kategori_id: "KTG_sewa", nominal: "300000", tanggal_transaksi: "2026-11-06", deskripsi: "Sewa lapangan" });
    const report = financialStatements(composeState(f.inti, f.keu), "2026-11-01", "2026-11-30");
    assert.equal(report.period.PENDAPATAN, -1500000);
    assert.equal(report.period.SEWA, 300000);
    assert.equal(report.period.BELUM_DIPETAKAN, 0);
  });

  test("owner mengubah transaksi: lama dibalik di tanggal aslinya, versi baru dicatat", async () => {
    const f = await started();
    const created = String(income(f, "1500000").entityId);
    const original = f.keu.Transaksi!.find((t) => String(t.transaksi_id).length && t.deskripsi === "Pembayaran bimbel Andi")!;
    assert.ok(created);
    run(f, f.owner, "transaction.edit", { transaksi_id: original.transaksi_id, nominal: "1750000", akun_id: f.cash, kategori_id: "KTG_bimbel", tanggal_transaksi: "2026-11-05", deskripsi: "Pembayaran bimbel Andi (koreksi)", alasan: "Salah nominal" });
    const state = composeState(f.inti, f.keu);
    assert.ok(reversedIds(state).has(String(original.transaksi_id)));
    const reversal = state.Transaksi.find((t) => t.jenis === "PEMBALIK" && t.transaksi_rujukan_id === original.transaksi_id)!;
    assert.equal(reversal.tanggal_transaksi, "2026-11-05");
    const net = state.Transaksi.reduce((sum, t) => sum + Number(t.nominal) * (t.arah === "IN" ? 1 : -1), 0);
    assert.equal(net, 1750000);
    assert.equal(new Set(state.Transaksi.map((t) => t.transaksi_id)).size, state.Transaksi.length, "ID transaksi tidak ganda");
  });

  test("form Ubah dikenali dan nominal berformat rupiah dibaca benar", () => {
    const form = new FormData();
    for (const [k, v] of Object.entries({ aksi: "transaction.edit", transaksi_id: "TX_1", nominal: "1.750.000", akun_id: "AKN_cash", kategori_id: "KTG_bimbel", tanggal_transaksi: "2026-11-05", deskripsi: "x", alasan: "y" })) form.set(k, v);
    const command = buildCommand(form);
    assert.equal(command.action, "transaction.edit");
    assert.equal(String(command.data.nominal).replace(/\D/g, ""), "1750000");
  });

  test("hanya owner yang boleh mengubah; transaksi yang sudah dibalik tidak bisa diubah lagi", async () => {
    const f = await started();
    income(f, "1500000");
    const original = f.keu.Transaksi![0]!;
    const edit = { transaksi_id: original.transaksi_id, nominal: "1000000", akun_id: f.cash, kategori_id: "KTG_bimbel", tanggal_transaksi: "2026-11-05", deskripsi: "x", alasan: "uji" };
    assert.throws(() => run(f, f.recorder, "transaction.edit", edit), /pemilik/);
    run(f, f.owner, "transaction.reverse", { transaksi_id: original.transaksi_id, tanggal_transaksi: "2026-11-05", alasan: "Dihapus" });
    assert.throws(() => run(f, f.owner, "transaction.edit", edit), /sudah pernah dibalik/);
  });
});
