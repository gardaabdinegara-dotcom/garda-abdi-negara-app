// Riwayat bayar per siswa (opsional): uang masuk "Dari siswa" disimpan di Transaksi.siswa_id, tetap tertaut saat
// diubah, hilang dari riwayat saat dihapus, dan tidak mengubah laporan. Keuangan tetap catat manual tanpa tagihan.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { COLUMNS } from "../../src/lib/keuangan/domain";
import { riwayatDompet } from "../../src/lib/keuangan/dompet";
import { buildCommand } from "../../src/lib/keuangan/form-commands";
import { judulBayar, pembayaranSiswa, terakhirBayarPerSiswa } from "../../src/lib/keuangan/pembayaran-siswa";
import { financialStatements } from "../../src/lib/keuangan/reporting";
import { reversedIds } from "../../src/lib/keuangan/ringkasan";
import { composeState } from "../../src/lib/keuangan/sumber";
import { KEUANGAN } from "../../src/lib/data/schema";
import { financeFixture, run } from "./fixture";

async function started() {
  const f = await financeFixture();
  run(f, f.owner, "finance.bootstrap", { tanggal_saldo_awal: "2026-11-01" });
  const cash = String(f.keu.Akun!.find((a) => a.jenis_akun === "KAS")!.akun_id);
  const bank = String(f.keu.Akun!.find((a) => a.jenis_akun === "BANK")!.akun_id);
  return { ...f, cash, bank };
}

type F = Awaited<ReturnType<typeof started>>;

const masuk = (f: F, data: Record<string, unknown>) =>
  run(f, f.owner, "transaction.create", { jenis: "PENERIMAAN_LAIN", akun_id: f.cash, kategori_id: "KTG_bimbel", nominal: "1500000", tanggal_transaksi: "2026-11-05", deskripsi: "Pembayaran bimbel · ANDI SAPUTRA", ...data });

const tx = (f: F, deskripsi: string) => f.keu.Transaksi!.find((t) => t.deskripsi === deskripsi && t.jenis !== "PEMBALIK")!;

describe("uang masuk dari siswa", () => {
  test("kolom siswa_id ada di daftar kolom keuangan dan di spreadsheet (kolom paling akhir)", () => {
    assert.equal(COLUMNS.Transaksi.at(-1), "siswa_id");
    const sheet = KEUANGAN.Transaksi;
    assert.equal(sheet.columns.at(-1), "siswa_id");
  });

  test("dicatat dengan siswa: siswa_id tersimpan; tanpa siswa: kosong", async () => {
    const f = await started();
    masuk(f, { siswa_id: f.andi });
    masuk(f, { deskripsi: "Infaq alumni", kategori_id: "KTG_lain", siswa_id: "" });
    assert.equal(tx(f, "Pembayaran bimbel · ANDI SAPUTRA").siswa_id, f.andi);
    assert.equal(tx(f, "Infaq alumni").siswa_id, "");
  });

  test("siswa harus ada, dan hanya untuk penerimaan (bukan modal atau pengeluaran)", async () => {
    const f = await started();
    assert.throws(() => masuk(f, { siswa_id: "SIS_tidak_ada" }), /tidak ditemukan/);
    assert.throws(() => masuk(f, { jenis: "MODAL_MASUK", kategori_id: "", siswa_id: f.andi }), /Dari siswa/);
    assert.throws(
      () => run(f, f.owner, "transaction.create", { jenis: "BIAYA", akun_id: f.cash, kategori_id: "KTG_sewa", nominal: "1000", tanggal_transaksi: "2026-11-05", deskripsi: "x", siswa_id: f.andi, alasan: "uji" }),
      /Dari siswa/,
    );
  });

  test("diubah: versi baru tetap tertaut ke siswa; form boleh mengganti atau melepasnya", async () => {
    const f = await started();
    masuk(f, { siswa_id: f.andi });
    const asal = tx(f, "Pembayaran bimbel · ANDI SAPUTRA");
    // Form Ubah tanpa isian siswa_id: tautan lama dipertahankan.
    run(f, f.owner, "transaction.edit", { transaksi_id: asal.transaksi_id, nominal: "1750000", akun_id: f.bank, kategori_id: "KTG_bimbel", tanggal_transaksi: "2026-11-05", deskripsi: "Cicilan 2", alasan: "Salah nominal" });
    const baru = tx(f, "Cicilan 2");
    assert.equal(baru.siswa_id, f.andi);
    assert.equal(Number(baru.nominal), 1750000);
    const state = composeState(f.inti, f.keu);
    assert.ok(reversedIds(state).has(String(asal.transaksi_id)));
    // Ganti ke siswa lain lewat form.
    run(f, f.owner, "transaction.edit", { transaksi_id: baru.transaksi_id, nominal: "1750000", akun_id: f.bank, kategori_id: "KTG_bimbel", tanggal_transaksi: "2026-11-05", deskripsi: "Cicilan 2 Budi", siswa_id: f.budi, alasan: "Salah siswa" });
    assert.equal(tx(f, "Cicilan 2 Budi").siswa_id, f.budi);
    // Lepas siswa ("Tanpa siswa").
    run(f, f.owner, "transaction.edit", { transaksi_id: tx(f, "Cicilan 2 Budi").transaksi_id, nominal: "1750000", akun_id: f.bank, kategori_id: "KTG_bimbel", tanggal_transaksi: "2026-11-05", deskripsi: "Pemasukan umum", siswa_id: "", alasan: "Bukan dari siswa" });
    assert.equal(tx(f, "Pemasukan umum").siswa_id, "");
  });

  test("riwayat bayar siswa: total dan daftar tanpa yang sudah dihapus atau diubah", async () => {
    const f = await started();
    masuk(f, { siswa_id: f.andi, deskripsi: "Biaya pendaftaran & formulir · ANDI SAPUTRA", kategori_id: "KTG_pendaftaran", nominal: "500000", tanggal_transaksi: "2026-11-02" });
    masuk(f, { siswa_id: f.andi, deskripsi: "Cicilan 1", tanggal_transaksi: "2026-11-05", akun_id: f.bank });
    masuk(f, { siswa_id: f.andi, deskripsi: "Tercatat dua kali", tanggal_transaksi: "2026-11-06" });
    masuk(f, { siswa_id: f.budi, deskripsi: "Cicilan Budi", tanggal_transaksi: "2026-11-07" });
    run(f, f.owner, "transaction.reverse", { transaksi_id: tx(f, "Tercatat dua kali").transaksi_id, tanggal_transaksi: "2026-11-06", alasan: "Ganda" });
    const state = composeState(f.inti, f.keu);
    const andi = pembayaranSiswa(state, f.andi, "ANDI SAPUTRA");
    assert.equal(andi.jumlah, 2);
    assert.equal(andi.total, 2000000);
    assert.equal(andi.terakhir, "2026-11-05");
    assert.deepEqual(andi.items.map((i) => [i.tanggal, i.judul, i.akun]), [
      ["2026-11-05", "Cicilan 1", "bank"],
      ["2026-11-02", "Biaya pendaftaran & formulir", "Kas"],
    ]);
    assert.equal(pembayaranSiswa(state, f.budi).total, 1500000);
    assert.equal(pembayaranSiswa(state, "").jumlah, 0);
    const terakhir = terakhirBayarPerSiswa(state);
    assert.equal(terakhir.get(f.andi), "2026-11-05");
    assert.equal(terakhir.get(f.budi), "2026-11-07");
  });

  test("laporan tidak berubah karena tautan siswa", async () => {
    const a = await started();
    const b = await started();
    masuk(a, { siswa_id: a.andi });
    masuk(b, {});
    const ra = financialStatements(composeState(a.inti, a.keu), "2026-11-01", "2026-11-30");
    const rb = financialStatements(composeState(b.inti, b.keu), "2026-11-01", "2026-11-30");
    assert.deepEqual(ra.period, rb.period);
    assert.equal(ra.period.PENDAPATAN, -1500000);
  });

  test("form: Uang masuk membawa siswa_id; form Ubah tanpa isian siswa tidak mengirim siswa_id", () => {
    const create = new FormData();
    for (const [k, v] of Object.entries({ aksi: "transaction.create", jenis: "PENERIMAAN_LAIN", nominal: "1.500.000", siswa_id: "SIS_1" })) create.set(k, v);
    assert.equal(buildCommand(create).data.siswa_id, "SIS_1");
    const edit = new FormData();
    for (const [k, v] of Object.entries({ aksi: "transaction.edit", transaksi_id: "TX_1", nominal: "1" })) edit.set(k, v);
    assert.equal("siswa_id" in buildCommand(edit).data, false);
    edit.set("siswa_id", "");
    assert.equal(buildCommand(edit).data.siswa_id, "");
  });

  test("lembar Ubah di riwayat menerima siswa_id transaksi", async () => {
    const f = await started();
    masuk(f, { siswa_id: f.andi });
    const rows = riwayatDompet(composeState(f.inti, f.keu), { month: "2026-11", owner: true, labels: {} });
    assert.equal(rows[0]!.edit!.siswa_id, f.andi);
  });

  test("judul riwayat: nama siswa di akhir keterangan dibuang", () => {
    assert.equal(judulBayar("Pembayaran bimbel · ANDI SAPUTRA", "Andi Saputra", "x"), "Pembayaran bimbel");
    assert.equal(judulBayar("Cicilan 2", "ANDI SAPUTRA", "x"), "Cicilan 2");
    assert.equal(judulBayar("", "ANDI SAPUTRA", "Pembayaran bimbel siswa"), "Pembayaran bimbel siswa");
  });
});
