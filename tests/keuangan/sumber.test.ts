// Jembatan logika Keuangan lama ke struktur dua spreadsheet Ruang Garda.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AppError, type Tables } from "../../src/lib/data/types";
import { invoiceSummary } from "../../src/lib/keuangan/domain";
import { buildCommand, rupiah } from "../../src/lib/keuangan/form-commands";
import { familyBills, terbilang } from "../../src/lib/keuangan/ringkasan";
import { composeState } from "../../src/lib/keuangan/sumber";
import { actor } from "../helpers";
import { financeFixture, readyFixture, run } from "./fixture";

function rejects(fn: () => unknown, pattern: RegExp) {
  assert.throws(fn, (error: unknown) => error instanceof AppError && pattern.test(error.message));
}

describe("susunan data keuangan dari dua spreadsheet", () => {
  test("siswa, program, dan pendaftaran dari Inti; tarif dan ketentuan terbaru dari Keuangan", async () => {
    const f = await financeFixture();
    let state = composeState(f.inti, f.keu);
    assert.equal(state.Siswa.length, 2);
    assert.equal(state.Program[0]!.tarif_default, 0, "belum ada tarif");
    assert.equal(state.Pendaftaran[0]!.ketentuan_ada, false);
    assert.equal(state.Pengaturan.find((r) => r.key === "business_name")!.value, "Garda Abdi Negara");
    f.keu.Tarif_Program!.push(
      { tarif_id: "T1", program_id: f.program, skema_default: "PAKET", tarif_default: 1000000, berlaku_mulai: "2026-10-01" },
      { tarif_id: "T2", program_id: f.program, skema_default: "BULANAN", tarif_default: 400000, berlaku_mulai: "2026-11-01" },
    );
    state = composeState(f.inti, f.keu);
    assert.equal(state.Program[0]!.skema_default, "BULANAN");
    assert.equal(state.Program[0]!.tarif_default, 400000);
    assert.equal(state.Pendaftaran[0]!.tarif_disepakati, 400000, "pendaftaran tanpa ketentuan mengikuti tarif program");
  });
});

describe("ketentuan biaya dan tarif", () => {
  test("pencatat boleh memakai tarif program; tarif khusus hanya pemilik; tersimpan sebagai riwayat di Keuangan", async () => {
    const f = await financeFixture();
    run(f, f.owner, "tariff.save", { program_id: f.program, skema_default: "PAKET", tarif_default: "1500000" });
    rejects(() => run(f, f.recorder, "tariff.save", { program_id: f.program, skema_default: "PAKET", tarif_default: "1" }), /pemilik/);
    run(f, f.recorder, "fee.save", { pendaftaran_id: f.dafAndi, skema_biaya: "PAKET", tarif_disepakati: "1500000", hari_jatuh_tempo: "5" });
    rejects(() => run(f, f.recorder, "fee.save", { pendaftaran_id: f.dafBudi, skema_biaya: "PAKET", tarif_disepakati: "1200000", hari_jatuh_tempo: "5" }), /Tarif khusus/);
    run(f, f.owner, "fee.save", { pendaftaran_id: f.dafBudi, skema_biaya: "PAKET", tarif_disepakati: "1200000", hari_jatuh_tempo: "5" });
    assert.equal(f.keu.Tarif_Program!.length, 1);
    assert.deepEqual(
      f.keu.Ketentuan_Biaya!.map((r) => [r.pendaftaran_id, r.tarif_disepakati]),
      [
        [f.dafAndi, 1500000],
        [f.dafBudi, 1200000],
      ],
    );
    assert.equal(f.inti.Pendaftaran!.some((r) => "tarif_disepakati" in r), false, "spreadsheet Inti tidak berisi angka biaya");
  });

  test("tagihan hanya untuk pendaftaran yang sudah punya ketentuan biaya", async () => {
    const f = await readyFixture();
    rejects(() => run(f, f.recorder, "invoice.create", { pendaftaran_id: f.dafBudi, tanggal_terbit: "2026-11-05", periode_layanan: "", diskon_awal: "0" }), /ketentuan biaya untuk Budi/);
  });
});

describe("tagihan dan pembayaran", () => {
  test("tagihan paket tiga cicilan, pembayaran sebagian, sisa dan jatuh tempo", async () => {
    const f = await readyFixture();
    run(f, f.recorder, "invoice.create", { pendaftaran_id: f.dafAndi, tanggal_terbit: "2026-11-05", periode_layanan: "", diskon_awal: "0", cicilan: 3, jatuh_tempo_pertama: "2026-11-10" });
    const invoice = f.keu.Tagihan![0]!;
    assert.deepEqual(
      f.keu.Jadwal_Tagihan!.map((j) => [j.jatuh_tempo, j.nominal]),
      [
        ["2026-11-10", 500000],
        ["2026-12-10", 500000],
        ["2027-01-10", 500000],
      ],
    );
    const bank = f.keu.Akun!.find((a) => a.jenis_akun === "BANK")!;
    run(f, f.recorder, "payment.create", { tagihan_id: invoice.tagihan_id, akun_id: bank.akun_id, tanggal_transaksi: "2026-11-11", nominal: "600000", metode_pembayaran: "Transfer" });
    const state = composeState(f.inti, f.keu);
    const summary = invoiceSummary(state, state.Tagihan[0]!, "2026-12-15");
    assert.equal(summary.paid, 600000);
    assert.equal(summary.remaining, 900000);
    assert.equal(summary.overdue, 400000, "cicilan kedua baru dibayar 100.000");
    rejects(() => run(f, f.recorder, "payment.create", { tagihan_id: invoice.tagihan_id, akun_id: bank.akun_id, tanggal_transaksi: "2026-11-12", nominal: "1000000" }), /melebihi sisa/);
    rejects(() => run(f, f.recorder, "invoice.create", { pendaftaran_id: f.dafAndi, tanggal_terbit: "2026-11-06", periode_layanan: "", diskon_awal: "0" }), /sudah ada/);
  });

  test("diskon awal dan koreksi hanya pemilik; pembalik menjaga riwayat", async () => {
    const f = await readyFixture();
    rejects(() => run(f, f.recorder, "invoice.create", { pendaftaran_id: f.dafAndi, tanggal_terbit: "2026-11-05", periode_layanan: "", diskon_awal: "100000" }), /pemilik/);
    run(f, f.owner, "invoice.create", { pendaftaran_id: f.dafAndi, tanggal_terbit: "2026-11-05", periode_layanan: "", diskon_awal: "100000" });
    const invoice = f.keu.Tagihan![0]!;
    const cash = f.keu.Akun!.find((a) => a.jenis_akun === "KAS")!;
    run(f, f.recorder, "payment.create", { tagihan_id: invoice.tagihan_id, akun_id: cash.akun_id, tanggal_transaksi: "2026-11-05", nominal: "400000" });
    const payment = f.keu.Transaksi![0]!;
    rejects(() => run(f, f.recorder, "transaction.reverse", { transaksi_id: payment.transaksi_id, tanggal_transaksi: "2026-11-06", alasan: "Salah input" }), /pemilik/);
    run(f, f.owner, "transaction.reverse", { transaksi_id: payment.transaksi_id, tanggal_transaksi: "2026-11-06", alasan: "Salah input" });
    assert.equal(f.keu.Transaksi!.length, 2, "transaksi asal tetap ada, pembalik ditambahkan");
    const state = composeState(f.inti, f.keu);
    assert.equal(invoiceSummary(state, state.Tagihan[0]!).paid, 0);
  });
});

describe("hak akses keuangan", () => {
  test("akses lihat tidak bisa mencatat; pencatat tidak bisa master/koreksi; peran lain ditolak", async () => {
    const f = await readyFixture();
    rejects(() => run(f, f.viewer, "transaction.create", {}), /hanya untuk melihat/);
    rejects(() => run(f, f.recorder, "master.save", { table: "Akun", nama_akun: "Kas kecil", jenis_akun: "KAS", saldo_awal: "0", tanggal_saldo_awal: "2026-11-01" }), /pemilik/);
    rejects(() => run(f, f.recorder, "period.open", { bulan: "2026-11", alasan: "x" }), /pemilik/);
    for (const role of ["PENGAJAR", "SISWA", "WALI"] as const) rejects(() => run(f, actor(role, { akses: "CATAT" }), "transaction.create", {}), /hanya untuk melihat/);
  });

  test("data inti tidak bisa diubah lewat keuangan", async () => {
    const f = await readyFixture();
    rejects(() => run(f, f.owner, "student.save", { nama: "Siswa Baru" }), /tidak dikenali/);
    rejects(() => run(f, f.owner, "user.save", { email: "a@b.c" }), /tidak dikenali/);
    rejects(() => run(f, f.owner, "master.save", { table: "Program", nama_program: "Baru" }), /dikelola/);
  });
});

describe("portal wali", () => {
  test("wali hanya melihat tagihan dan pembayaran anak yang ditautkan", async () => {
    const f = await readyFixture();
    run(f, f.owner, "fee.save", { pendaftaran_id: f.dafBudi, skema_biaya: "PAKET", tarif_disepakati: "1500000", hari_jatuh_tempo: "5" });
    for (const daf of [f.dafAndi, f.dafBudi]) run(f, f.recorder, "invoice.create", { pendaftaran_id: daf, tanggal_terbit: "2026-11-05", periode_layanan: "", diskon_awal: "0" });
    const bank = f.keu.Akun!.find((a) => a.jenis_akun === "BANK")!;
    run(f, f.recorder, "payment.create", { tagihan_id: f.keu.Tagihan![0]!.tagihan_id, akun_id: bank.akun_id, tanggal_transaksi: "2026-11-06", nominal: "500000" });
    const view = familyBills(composeState(f.inti, f.keu), [f.andi], "2026-11-13");
    assert.equal(view.length, 1);
    assert.equal(view[0]!.nama, "Andi Saputra");
    assert.equal(view[0]!.invoices.length, 1);
    assert.equal(view[0]!.invoices[0]!.summary.remaining, 1000000);
    assert.equal(view[0]!.invoices[0]!.payments.length, 1);
    assert.ok(!JSON.stringify(view).includes("Budi"), "tidak ada data anak lain");
    assert.ok(!JSON.stringify(view).includes("saldo_awal"), "tidak ada saldo kas lembaga");
  });
});

describe("isian form keuangan", () => {
  test("nominal ditulis bebas lalu dibersihkan", () => {
    assert.equal(rupiah("Rp1.500.000"), "1500000");
    assert.equal(rupiah(" 250 000 "), "250000");
    assert.equal(rupiah("-50.000", true), "-50000");
    assert.equal(rupiah("-50.000"), "50000");
    assert.equal(rupiah(""), "");
  });

  test("perintah dibangun dari isian dan tindakan asing ditolak", () => {
    const form = new FormData();
    form.set("aksi", "period.close");
    form.set("bulan", "2026-11");
    form.set("alasan", "Tutup");
    form.set("saldo:AKN_cash", "1.000.000");
    form.set("saldo:AKN_bank", "-5.000");
    assert.deepEqual(buildCommand(form).data.saldo_nyata, [
      { akun_id: "AKN_cash", nominal: "1000000" },
      { akun_id: "AKN_bank", nominal: "-5000" },
    ]);
    const bad = new FormData();
    bad.set("aksi", "student.save");
    assert.throws(() => buildCommand(bad), /tidak dikenali/);
  });

  test("tarif pajak persen menjadi basis poin", () => {
    const form = new FormData();
    form.set("aksi", "report.tax.rate");
    form.set("tarif_persen", "0,5");
    assert.equal(buildCommand(form).data.tarif_basis_poin, 50);
  });
});

describe("kuitansi", () => {
  test("terbilang rupiah", () => {
    assert.equal(terbilang(0), "nol rupiah");
    assert.equal(terbilang(11), "sebelas rupiah");
    assert.equal(terbilang(115), "seratus lima belas rupiah");
    assert.equal(terbilang(1000), "seribu rupiah");
    assert.equal(terbilang(1500000), "satu juta lima ratus ribu rupiah");
    assert.equal(terbilang(650000), "enam ratus lima puluh ribu rupiah");
    assert.equal(terbilang(2_100_001), "dua juta seratus ribu satu rupiah");
  });
});
