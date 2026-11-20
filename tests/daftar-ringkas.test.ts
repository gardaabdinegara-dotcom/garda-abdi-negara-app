// Saringan daftar siswa dan daftar akun ringkas (dipakai di server dan klien).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alamatSaring, cocokAkun, cocokCari, cocokSaring, saringDariAlamat, type AkunCari, type SiswaCari } from "../src/lib/core/saring-daftar";

const siswa: (SiswaCari & { id: string })[] = [
  { id: "a", nama: "ARIF PRATAMA", kode: "GAN-0001", noWa: "6281200001000", noWaWali: "6281344552100", aktif: true, jalur: "TNI" },
  { id: "b", nama: "BAYU SAPUTRA", kode: "GAN-0010", noWa: "6281200001009", noWaWali: "", aktif: true, jalur: "Polri" },
  { id: "c", nama: "DEDI SETIADI", kode: "GAN-0012", noWa: "", noWaWali: "", aktif: false, jalur: "TNI" },
];
const ids = (list: { id: string }[]) => list.map((s) => s.id);

describe("daftar siswa ringkas", () => {
  test("cari nama, kode GAN, atau nomor WA siswa/wali (awalan 0 boleh)", () => {
    assert.deepEqual(ids(siswa.filter((s) => cocokCari(s, "saputra"))), ["b"]);
    assert.deepEqual(ids(siswa.filter((s) => cocokCari(s, "gan-001"))), ["b", "c"]);
    assert.deepEqual(ids(siswa.filter((s) => cocokCari(s, "0813 4455"))), ["a"]);
    assert.deepEqual(ids(siswa.filter((s) => cocokCari(s, "  "))), ["a", "b", "c"]);
    // Dua angka terlalu pendek untuk dicocokkan ke nomor.
    assert.deepEqual(ids(siswa.filter((s) => cocokCari(s, "34"))), []);
  });

  test("chip status dan jalur", () => {
    assert.deepEqual(ids(siswa.filter((s) => cocokSaring(s, "semua"))), ["a", "b", "c"]);
    assert.deepEqual(ids(siswa.filter((s) => cocokSaring(s, "aktif"))), ["a", "b"]);
    assert.deepEqual(ids(siswa.filter((s) => cocokSaring(s, "nonaktif"))), ["c"]);
    assert.deepEqual(ids(siswa.filter((s) => cocokSaring(s, "TNI"))), ["a", "c"]);
    assert.deepEqual(ids(siswa.filter((s) => cocokSaring(s, "Kedinasan"))), []);
  });

  test("saringan dari alamat tetap berlaku tanpa JavaScript, dan alamat dibentuk ulang sama", () => {
    assert.equal(saringDariAlamat({}), "semua");
    assert.equal(saringDariAlamat({ status: "aktif" }), "aktif");
    assert.equal(saringDariAlamat({ status: "nonaktif" }), "nonaktif");
    assert.equal(saringDariAlamat({ status: "semua" }), "semua");
    assert.equal(saringDariAlamat({ status: "aneh" }), "semua");
    assert.equal(saringDariAlamat({ jalur: "polri", status: "aktif" }), "Polri");
    assert.equal(alamatSaring("semua", ""), "/siswa");
    assert.equal(alamatSaring("aktif", " arif "), "/siswa?q=arif&status=aktif");
    assert.equal(alamatSaring("Kedinasan", ""), "/siswa?jalur=Kedinasan");
  });
});

describe("daftar akun ringkas", () => {
  const akun: (AkunCari & { id: string })[] = [
    { id: "o", nama: "Pemilik Garda", username: "pemilik", peran: "OWNER", pin: null },
    { id: "s1", nama: "ARIF PRATAMA", username: "gan-0001", peran: "SISWA", pin: "aktif" },
    { id: "s2", nama: "BAGUS SETIAWAN", username: "gan-0002", peran: "SISWA", pin: "belum" },
  ];

  test("chip peran dan PIN belum dibuat; cari nama atau @username", () => {
    assert.deepEqual(ids(akun.filter((a) => cocokAkun(a, "", "semua"))), ["o", "s1", "s2"]);
    assert.deepEqual(ids(akun.filter((a) => cocokAkun(a, "", "SISWA"))), ["s1", "s2"]);
    assert.deepEqual(ids(akun.filter((a) => cocokAkun(a, "", "pin-belum"))), ["s2"]);
    assert.deepEqual(ids(akun.filter((a) => cocokAkun(a, "@gan-0001", "semua"))), ["s1"]);
    assert.deepEqual(ids(akun.filter((a) => cocokAkun(a, "bagus", "pin-belum"))), ["s2"]);
    assert.deepEqual(ids(akun.filter((a) => cocokAkun(a, "arif", "pin-belum"))), []);
  });
});
