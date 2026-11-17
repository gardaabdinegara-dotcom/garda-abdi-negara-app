// Riwayat dompet Keuangan (opsi A): transfer jadi satu baris, koreksi tersembunyi, hak ubah/hapus, dan label tanggal.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { composeState } from "../../src/lib/keuangan/sumber";
import { dayLabel, kelompokHari, riwayatDompet, shiftMonth, shortAccount, splitDescription } from "../../src/lib/keuangan/dompet";
import { financeFixture, run } from "./fixture";

const LABELS = { PENERIMAAN_LAIN: "Pemasukan", BIAYA: "Pengeluaran", PEMBALIK: "Pembalik (koreksi)" };

async function setup() {
  const f = await financeFixture();
  run(f, f.owner, "finance.bootstrap", { tanggal_saldo_awal: "2026-11-01" });
  const [cash, bank] = f.keu.Akun!.map((a) => String(a.akun_id));
  run(f, f.owner, "transaction.create", { jenis: "PENERIMAAN_LAIN", akun_id: cash, kategori_id: "KTG_bimbel", nominal: "1500000", tanggal_transaksi: "2026-11-05", deskripsi: "Cicilan 2 - GAN-0005 Arif Pratama" });
  run(f, f.owner, "transaction.create", { jenis: "BIAYA", akun_id: cash, kategori_id: "KTG_operasional", nominal: "600000", tanggal_transaksi: "2026-11-16", deskripsi: "Matras & cone latihan" });
  run(f, f.owner, "transfer.create", { dari_akun_id: cash, ke_akun_id: bank, nominal: "500000", tanggal_transaksi: "2026-11-12", deskripsi: "Setor tunai ke bank" });
  return { f, cash: cash!, bank: bank! };
}

describe("riwayat dompet", () => {
  test("keterangan siswa dipecah jadi nama dan rincian", () => {
    assert.deepEqual(splitDescription("Cicilan 2 - GAN-0005 Arif Pratama"), { title: "Arif Pratama", meta: ["Cicilan 2", "GAN-0005"] });
    assert.equal(splitDescription("Sewa lapangan latihan"), null);
    assert.equal(shortAccount("Rekening BRI", "BANK"), "BRI");
    assert.equal(shortAccount("Kas tunai", "KAS"), "Kas");
    assert.equal(shiftMonth("2026-01", -1), "2025-12");
    assert.equal(shiftMonth("2026-12", 1), "2027-01");
  });

  test("transfer tampil satu baris, urut terbaru, hak ubah hanya untuk pemilik", async () => {
    const { f, cash } = await setup();
    const state = composeState(f.inti, f.keu);
    const rows = riwayatDompet(state, { month: "2026-11", owner: true, labels: LABELS });
    assert.deepEqual(rows.map((r) => r.date), ["2026-11-16", "2026-11-12", "2026-11-05"]);
    const transfer = rows.find((r) => r.arah === "tr")!;
    assert.equal(transfer.title, "Setor tunai ke bank");
    assert.equal(transfer.edit, null, "transfer hanya bisa dihapus");
    assert.ok(transfer.hapus);
    const income = rows.find((r) => r.arah === "in")!;
    assert.equal(income.title, "Arif Pratama");
    assert.deepEqual(income.meta, ["Cicilan 2", "GAN-0005"]);
    assert.equal(income.edit?.nominal, 1500000);
    const viewer = riwayatDompet(state, { month: "2026-11", owner: false, labels: LABELS });
    assert.ok(viewer.every((r) => !r.edit && !r.hapus));
    const onlyCash = riwayatDompet(state, { month: "2026-11", akun: cash, owner: true, labels: LABELS });
    assert.equal(onlyCash.find((r) => r.arah === "tr")?.sign, "−");
  });

  test("catatan yang dihapus tersembunyi kecuali koreksi diminta", async () => {
    const { f } = await setup();
    const before = composeState(f.inti, f.keu);
    const target = riwayatDompet(before, { month: "2026-11", owner: true, labels: LABELS }).find((r) => r.arah === "out")!;
    run(f, f.owner, "transaction.reverse", { transaksi_id: target.hapus!.transaksi_id, tanggal_transaksi: target.hapus!.tanggal, alasan: "Tercatat dua kali" });
    const state = composeState(f.inti, f.keu);
    const rows = riwayatDompet(state, { month: "2026-11", owner: true, labels: LABELS });
    assert.equal(rows.some((r) => r.id === target.id), false);
    const all = riwayatDompet(state, { month: "2026-11", corrections: true, owner: true, labels: LABELS });
    assert.equal(all.find((r) => r.id === target.id)?.status, "dikoreksi");
    assert.ok(all.some((r) => r.status === "koreksi"));
  });

  test("label hari ini, kemarin, dan tanggal biasa", async () => {
    assert.equal(dayLabel("2026-11-17", "2026-11-17"), "Hari ini · Selasa, 17 Nov");
    assert.equal(dayLabel("2026-11-16", "2026-11-17"), "Kemarin · Senin, 16 Nov");
    assert.equal(dayLabel("2026-11-15", "2026-11-17"), "Minggu, 15 Nov");
    const { f } = await setup();
    const days = kelompokHari(riwayatDompet(composeState(f.inti, f.keu), { month: "2026-11", owner: true, labels: LABELS }), "2026-11-17");
    assert.equal(days.length, 3);
    assert.ok(days[0]!.label.startsWith("Kemarin"));
  });
});
