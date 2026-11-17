// Mengubah isian form menjadi data perintah keuangan. Nominal ditulis bebas ("Rp1.500.000", "1500000")
// lalu dibersihkan menjadi rupiah bulat; pemeriksaan isi tetap dilakukan oleh logika keuangan.
import { AppError } from "../data/types";
import { OPENING_ACCOUNTS } from "./reporting";

export interface FormLike {
  get(name: string): FormDataEntryValue | null;
  getAll(name: string): FormDataEntryValue[];
  keys(): IterableIterator<string>;
}

const s = (f: FormLike, name: string) => String(f.get(name) ?? "").trim();
const on = (f: FormLike, name: string) => ["on", "true", "1"].includes(s(f, name));

/** "Rp1.500.000" → "1500000"; tanda minus di depan dipertahankan untuk saldo. Kosong tetap kosong. */
export function rupiah(value: string, allowNegative = false): string {
  const negative = allowNegative && /^\s*-/.test(value);
  const digits = value.replace(/[^\d]/g, "");
  return digits ? `${negative ? "-" : ""}${digits.replace(/^0+(?=\d)/, "")}` : "";
}
const money = (f: FormLike, name: string) => rupiah(s(f, name));
const prefixed = (f: FormLike, prefix: string) => [...new Set(f.keys())].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));

type Builder = (f: FormLike) => Record<string, unknown>;

export const BUILDERS: Record<string, Builder> = {
  "invoice.create": (f) => ({
    pendaftaran_id: s(f, "pendaftaran_id"),
    tanggal_terbit: s(f, "tanggal_terbit"),
    periode_layanan: s(f, "periode_layanan"),
    diskon_awal: money(f, "diskon_awal") || "0",
    cicilan: Number(s(f, "cicilan") || 1),
    jatuh_tempo_pertama: s(f, "jatuh_tempo_pertama"),
  }),
  "invoice.monthly": (f) => ({
    periode_layanan: s(f, "periode_layanan"),
    tanggal_terbit: s(f, "tanggal_terbit"),
    pendaftaran_ids: f.getAll("pendaftaran_ids").map(String),
  }),
  "payment.create": (f) => ({
    tagihan_id: s(f, "tagihan_id"),
    akun_id: s(f, "akun_id"),
    tanggal_transaksi: s(f, "tanggal_transaksi"),
    nominal: money(f, "nominal"),
    metode_pembayaran: s(f, "metode_pembayaran") || "Transfer",
    referensi_eksternal: s(f, "referensi_eksternal"),
    deskripsi: s(f, "deskripsi") || "Pembayaran siswa",
    bukti_url: s(f, "bukti_url"),
  }),
  "transaction.create": (f) => ({
    jenis: s(f, "jenis"),
    akun_id: s(f, "akun_id"),
    tanggal_transaksi: s(f, "tanggal_transaksi"),
    nominal: money(f, "nominal"),
    kategori_id: s(f, "kategori_id"),
    program_id_opsional: s(f, "program_id_opsional"),
    deskripsi: s(f, "deskripsi"),
    bukti_url: s(f, "bukti_url"),
    referensi_eksternal: s(f, "referensi_eksternal"),
    alasan: s(f, "alasan"),
  }),
  "transfer.create": (f) => ({
    dari_akun_id: s(f, "dari_akun_id"),
    ke_akun_id: s(f, "ke_akun_id"),
    tanggal_transaksi: s(f, "tanggal_transaksi"),
    nominal: money(f, "nominal"),
    deskripsi: s(f, "deskripsi") || "Transfer antar akun",
    alasan: s(f, "alasan"),
  }),
  "transaction.reverse": (f) => ({ transaksi_id: s(f, "transaksi_id"), tanggal_transaksi: s(f, "tanggal_transaksi"), alasan: s(f, "alasan") }),
  "transaction.edit": (f) => ({
    transaksi_id: s(f, "transaksi_id"),
    akun_id: s(f, "akun_id"),
    tanggal_transaksi: s(f, "tanggal_transaksi"),
    nominal: money(f, "nominal"),
    kategori_id: s(f, "kategori_id"),
    deskripsi: s(f, "deskripsi"),
    alasan: s(f, "alasan"),
  }),
  "invoice.adjust": (f) => ({
    tagihan_id: s(f, "tagihan_id"),
    nominal: money(f, "nominal"),
    alasan: s(f, "alasan"),
    tanggal_efektif: s(f, "tanggal_efektif"),
    batalkan: on(f, "batalkan"),
  }),
  "invoice.adjust.reverse": (f) => ({ penyesuaian_id: s(f, "penyesuaian_id"), tanggal_efektif: s(f, "tanggal_efektif"), alasan: s(f, "alasan") }),
  "invoice.refund": (f) => ({
    tagihan_id: s(f, "tagihan_id"),
    transaksi_rujukan_id: s(f, "transaksi_rujukan_id"),
    akun_id: s(f, "akun_id"),
    nominal: money(f, "nominal"),
    tanggal_transaksi: s(f, "tanggal_transaksi"),
    alasan: s(f, "alasan"),
    pengurangan: money(f, "pengurangan") || "0",
    batalkan: on(f, "batalkan"),
  }),
  "fee.save": (f) => ({
    pendaftaran_id: s(f, "pendaftaran_id"),
    skema_biaya: s(f, "skema_biaya"),
    tarif_disepakati: money(f, "tarif_disepakati"),
    hari_jatuh_tempo: s(f, "hari_jatuh_tempo") || "5",
  }),
  "tariff.save": (f) => ({ program_id: s(f, "program_id"), skema_default: s(f, "skema_default"), tarif_default: money(f, "tarif_default") || "0" }),
  "master.save": (f) => {
    const table = s(f, "table");
    const base = { table, id: s(f, "id"), aktif: s(f, "id") ? on(f, "aktif") : true };
    if (table === "Akun") {
      return { ...base, nama_akun: s(f, "nama_akun"), jenis_akun: s(f, "jenis_akun"), saldo_awal: money(f, "saldo_awal") || "0", tanggal_saldo_awal: s(f, "tanggal_saldo_awal") };
    }
    return { ...base, nama_kategori: s(f, "nama_kategori"), jenis_yang_diizinkan: f.getAll("jenis_yang_diizinkan").map(String).join(","), kelompok_arus: s(f, "kelompok_arus") || "OPERASIONAL" };
  },
  "finance.bootstrap": (f) => ({ tanggal_saldo_awal: s(f, "tanggal_saldo_awal") }),
  "period.reconcile": (f) => periodCheck(f),
  "period.close": (f) => periodCheck(f),
  "period.open": (f) => ({ bulan: s(f, "bulan"), alasan: s(f, "alasan") }),
  "report.profile": (f) => ({
    tanggal_mulai: s(f, "tanggal_mulai"),
    basis: "KAS_DISESUAIKAN",
    confirmed: on(f, "confirmed"),
    dasar_pajak: s(f, "dasar_pajak"),
    report_location: s(f, "report_location"),
    report_signer: s(f, "report_signer"),
    report_position: s(f, "report_position"),
  }),
  "report.mapping": (f) => ({
    berlaku_mulai: s(f, "berlaku_mulai"),
    mappings: prefixed(f, "map:")
      .map((kategori_id) => ({ kategori_id, kelompok: s(f, `map:${kategori_id}`) }))
      .filter((m) => m.kelompok),
  }),
  "report.tax.rate": (f) => {
    const percent = Number(s(f, "tarif_persen").replace(",", "."));
    if (!Number.isFinite(percent) || percent < 0) throw new AppError("Tarif pajak tidak valid. Contoh: 0,5 untuk 0,5%.");
    return { berlaku_mulai: s(f, "berlaku_mulai"), tarif_basis_poin: Math.round(percent * 100), catatan: s(f, "catatan") };
  },
  "report.tax.payment": (f) => ({ transaksi_id: s(f, "transaksi_id"), periode_pajak: s(f, "periode_pajak"), perlakuan: s(f, "perlakuan"), catatan: s(f, "catatan") }),
  "report.asset": (f) => ({
    id: s(f, "id"),
    sumber: s(f, "sumber"),
    transaksi_id: s(f, "transaksi_id"),
    nama_aset: s(f, "nama_aset"),
    tanggal_perolehan: s(f, "tanggal_perolehan"),
    tanggal_mulai: s(f, "tanggal_mulai") || s(f, "tanggal_perolehan"),
    harga_perolehan: money(f, "harga_perolehan"),
    umur_bulan: s(f, "umur_bulan"),
    nilai_residu: money(f, "nilai_residu") || "0",
    akumulasi_awal: money(f, "akumulasi_awal") || "0",
    catatan: s(f, "catatan"),
  }),
  "report.opening": (f) => ({
    verified: on(f, "verified"),
    sumber: s(f, "sumber"),
    balances: Object.fromEntries(OPENING_ACCOUNTS.map((key) => [key, money(f, `open:${key}`) || "0"])),
  }),
  "report.journal": (f) => ({
    tanggal: s(f, "tanggal"),
    deskripsi: s(f, "deskripsi"),
    rujukan: s(f, "rujukan"),
    lines: [1, 2, 3, 4]
      .map((i) => ({ akun_laporan: s(f, `akun_${i}`), debit: money(f, `debit_${i}`) || "0", kredit: money(f, `kredit_${i}`) || "0" }))
      .filter((l) => l.akun_laporan),
  }),
  "report.journal.reverse": (f) => ({ jurnal_id: s(f, "jurnal_id"), tanggal: s(f, "tanggal"), deskripsi: s(f, "deskripsi") }),
};

function periodCheck(f: FormLike) {
  return {
    bulan: s(f, "bulan"),
    alasan: s(f, "alasan"),
    saldo_nyata: prefixed(f, "saldo:").map((akun_id) => ({ akun_id, nominal: rupiah(s(f, `saldo:${akun_id}`), true) })),
  };
}

export function buildCommand(f: FormLike): { action: string; data: Record<string, unknown> } {
  const action = s(f, "aksi");
  const builder = BUILDERS[action];
  if (!builder) throw new AppError("Tindakan keuangan tidak dikenali.");
  return { action, data: builder(f) };
}
