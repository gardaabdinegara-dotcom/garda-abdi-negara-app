// Ringkasan tampilan keuangan yang murni (tanpa akses penyimpanan), dipakai halaman dan tes.
import { baseTransaction, invoiceSummary, text, type Row, type State } from "./domain";

export type InvoiceSummary = ReturnType<typeof invoiceSummary>;

export function studentOf(state: State, pendaftaranId: string) {
  const enrollment = state.Pendaftaran.find((p) => p.pendaftaran_id === pendaftaranId);
  const student = enrollment ? state.Siswa.find((s) => s.siswa_id === enrollment.siswa_id) : undefined;
  const program = enrollment ? state.Program.find((p) => p.program_id === enrollment.program_id) : undefined;
  return {
    enrollment,
    siswa_id: text(student, "siswa_id"),
    nama: text(student, "nama") || "Siswa tidak dikenal",
    program: text(program, "nama_program") || "-",
    kelas: text(enrollment, "angkatan"),
  };
}

export type InvoiceStatus = "BATAL" | "LUNAS" | "JATUH_TEMPO" | "BELUM_LUNAS";

export interface InvoiceItem {
  invoice: Row;
  summary: InvoiceSummary;
  status: InvoiceStatus;
  student: ReturnType<typeof studentOf>;
  nextDue: { date: string; amount: number } | null;
}

export function invoiceItem(state: State, invoice: Row, asOf: string): InvoiceItem {
  const summary = invoiceSummary(state, invoice, asOf);
  const status: InvoiceStatus = summary.cancelled ? "BATAL" : summary.remaining === 0 ? "LUNAS" : summary.overdue > 0 ? "JATUH_TEMPO" : "BELUM_LUNAS";
  const next = summary.schedules.find((j) => j.remaining > 0);
  return {
    invoice,
    summary,
    status,
    student: studentOf(state, text(invoice, "pendaftaran_id")),
    nextDue: next ? { date: text(next, "jatuh_tempo"), amount: next.remaining } : null,
  };
}

export function invoiceList(state: State, asOf: string): InvoiceItem[] {
  return state.Tagihan.map((i) => invoiceItem(state, i, asOf)).sort(
    (a, b) => text(b.invoice, "tanggal_terbit").localeCompare(text(a.invoice, "tanggal_terbit")) || text(b.invoice, "nomor_tagihan").localeCompare(text(a.invoice, "nomor_tagihan")),
  );
}

/** Transaksi yang sudah dibalik atau merupakan pembalik. */
export function reversedIds(state: State): Set<string> {
  return new Set(state.Transaksi.filter((t) => t.jenis === "PEMBALIK").map((t) => text(t, "transaksi_rujukan_id")));
}

export function paymentsOf(state: State, tagihanId: string) {
  const reversed = reversedIds(state);
  return state.Transaksi.filter((t) => t.tagihan_id === tagihanId)
    .map((t) => ({ tx: t, base: baseTransaction(state, t), reversed: reversed.has(text(t, "transaksi_id")) }))
    .sort((a, b) => text(a.tx, "tanggal_transaksi").localeCompare(text(b.tx, "tanggal_transaksi")));
}

export const accountName = (state: State, id: unknown) => text(state.Akun.find((a) => a.akun_id === id), "nama_akun") || "-";
export const categoryName = (state: State, id: unknown) => text(state.Kategori.find((k) => k.kategori_id === id), "nama_kategori");
export const userName = (state: State, id: unknown) => text(state.Pengguna.find((u) => u.user_id === id), "nama") || String(id ?? "");


/** Tagihan anak untuk wali: hanya tagihan dan pembayaran siswa yang ditautkan, tanpa angka keuangan lembaga. */
export function familyBills(state: State, siswaIds: readonly string[], asOf: string) {
  const children = new Set(siswaIds);
  return state.Siswa.filter((s) => children.has(text(s, "siswa_id"))).map((student) => {
    const enrollments = new Set(state.Pendaftaran.filter((p) => p.siswa_id === student.siswa_id).map((p) => text(p, "pendaftaran_id")));
    const invoices = state.Tagihan.filter((i) => enrollments.has(text(i, "pendaftaran_id"))).map((i) => ({
      ...invoiceItem(state, i, asOf),
      payments: paymentsOf(state, text(i, "tagihan_id")).filter((p) => p.tx.jenis === "PEMBAYARAN_SISWA" && !p.reversed),
    }));
    return { siswa_id: text(student, "siswa_id"), nama: text(student, "nama"), invoices };
  });
}

/** Terbilang rupiah untuk kuitansi, mis. 1.500.000 → "satu juta lima ratus ribu rupiah". */
export function terbilang(value: number): string {
  const words = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
  const say = (n: number): string => {
    if (n < 12) return words[n]!;
    if (n < 20) return `${say(n - 10)} belas`;
    if (n < 100) return `${say(Math.floor(n / 10))} puluh ${say(n % 10)}`.trim();
    if (n < 200) return `seratus ${say(n - 100)}`.trim();
    if (n < 1000) return `${say(Math.floor(n / 100))} ratus ${say(n % 100)}`.trim();
    if (n < 2000) return `seribu ${say(n - 1000)}`.trim();
    if (n < 1_000_000) return `${say(Math.floor(n / 1000))} ribu ${say(n % 1000)}`.trim();
    if (n < 1_000_000_000) return `${say(Math.floor(n / 1_000_000))} juta ${say(n % 1_000_000)}`.trim();
    if (n < 1_000_000_000_000) return `${say(Math.floor(n / 1_000_000_000))} miliar ${say(n % 1_000_000_000)}`.trim();
    return `${say(Math.floor(n / 1_000_000_000_000))} triliun ${say(n % 1_000_000_000_000)}`.trim();
  };
  const n = Math.round(Math.abs(value));
  return `${n === 0 ? "nol" : say(n).replace(/\s+/g, " ")} rupiah`;
}
