import "server-only";
import { notFound } from "next/navigation";
import { canCorrectFinance, canRecordFinance, canSeeChildBills, canViewFinance, financeAccess, ownStudentIds } from "../core/permissions";
import { toStudent, type Actor } from "../core/types";
import { finance, invoiceSummary, num, setting, text, today } from "../keuangan/domain";
import { accountName, familyBills, reversedIds, studentOf, userName } from "../keuangan/ringkasan";
import { pembayaranSiswa, terakhirBayarPerSiswa } from "../keuangan/pembayaran-siswa";
import { composeState, CORE_TABLES, FINANCE_TABLES, ledgerActor } from "../keuangan/sumber";
import { AppError, type Tables } from "../data/types";
import { buildReportDocument, PDF_REPORT_TITLES, validReportRange, type PdfReportKind, type PdfReportOptions } from "../keuangan/report-document";
import { dataMode } from "../config";
import { dataDeps } from "./data";

/** Isi lengkap keuangan untuk pengguna yang berhak melihat keuangan (404 untuk yang lain). */
export async function loadFinance(actor: Actor) {
  if (!canViewFinance(actor)) notFound();
  return financeData(actor);
}

async function financeData(actor: Actor) {
  const source = await dataDeps();
  const [inti, keu] = await Promise.all([source.store.read("inti", CORE_TABLES), source.store.read("keuangan", FINANCE_TABLES)]);
  const state = composeState(inti, keu);
  const tz = setting(state, "timezone", "Asia/Jakarta");
  const date = today(tz);
  return {
    state,
    today: date,
    month: date.slice(0, 7),
    access: financeAccess(actor),
    owner: canCorrectFinance(actor),
    recorder: canRecordFinance(actor),
    closed: JSON.parse(setting(state, "closed_periods", "[]")) as string[],
    business: setting(state, "business_name", "Garda Abdi Negara"),
    /** Siswa aktif untuk pilihan "Dari siswa" di Uang masuk: kode, nama, kelas/jalur, dan tanggal terakhir bayar. */
    students: pilihanSiswa(inti, state),
  };
}

function pilihanSiswa(inti: Tables, state: ReturnType<typeof composeState>) {
  const terakhir = terakhirBayarPerSiswa(state);
  const kelas = new Map<string, string>();
  for (const p of state.Pendaftaran) {
    const id = String(p.siswa_id ?? "");
    const nama = String(p.angkatan ?? "");
    if (nama && (!kelas.has(id) || p.status === "AKTIF")) kelas.set(id, nama);
  }
  return (inti.Siswa ?? [])
    .map(toStudent)
    .filter((st) => st.aktif && !st.dihapus_pada && st.kode_siswa)
    .map((st) => ({
      id: st.siswa_id,
      kode: st.kode_siswa,
      nama: st.nama,
      info: kelas.get(st.siswa_id) || st.jalur_target || "",
      terakhir: terakhir.get(st.siswa_id) ?? "",
    }))
    .sort((a, b) => a.kode.localeCompare(b.kode));
}

export type FinanceData = Awaited<ReturnType<typeof financeData>>;

export function overview(data: FinanceData) {
  const from = `${data.month}-01`;
  return finance(data.state, from, data.today);
}

/** Tagihan milik sendiri (siswa) atau anak (wali). Hanya data tagihan dan pembayaran siswa yang ditautkan. */
export async function loadFamilyBills(actor: Actor) {
  if (!canSeeChildBills(actor)) notFound();
  const data = await financeData(actor);
  return { today: data.today, business: data.business, children: familyBills(data.state, ownStudentIds(actor), data.today) };
}

/** Kuitansi satu pembayaran: staf keuangan, atau wali dari siswa yang bersangkutan. */
export async function loadReceipt(actor: Actor, transaksiId: string) {
  if (!canViewFinance(actor) && !canSeeChildBills(actor)) notFound();
  const data = await financeData(actor);
  const tx = data.state.Transaksi.find((t) => t.transaksi_id === transaksiId);
  if (!tx || tx.jenis !== "PEMBAYARAN_SISWA") notFound();
  const invoice = data.state.Tagihan.find((i) => i.tagihan_id === tx.tagihan_id);
  if (!invoice) notFound();
  const student = studentOf(data.state, text(invoice, "pendaftaran_id"));
  if (!canViewFinance(actor) && !ownStudentIds(actor).includes(student.siswa_id)) notFound();
  const after = invoiceSummary(data.state, invoice, text(tx, "tanggal_transaksi"));
  return {
    business: data.business,
    tx,
    invoice,
    student,
    remaining: after.remaining,
    reversed: reversedIds(data.state).has(transaksiId),
    officer: userName(data.state, tx.created_by),
    account: accountName(data.state, tx.akun_id),
    nominal: num(tx, "nominal"),
  };
}

/** Pilihan laporan dari parameter alamat; nilai tidak sah diganti bawaan (bulan berjalan). */
export function reportRequest(data: FinanceData, actor: Actor, params: Record<string, string | string[] | undefined>): PdfReportOptions {
  const pick = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const kind = (Object.keys(PDF_REPORT_TITLES) as PdfReportKind[]).includes(pick("jenis") as PdfReportKind) ? (pick("jenis") as PdfReportKind) : "profit";
  let from = pick("dari") || `${data.month}-01`;
  let to = pick("sampai") || data.today;
  if (!validReportRange(from, to)) {
    from = `${data.month}-01`;
    to = data.today;
  }
  return { kind, from, to, accountId: pick("akun"), role: ledgerActor(actor).role, simulation: dataMode() === "lokal", dataAsOf: new Date().toISOString() };
}

export function reportModel(data: FinanceData, options: PdfReportOptions) {
  return buildReportDocument(data.state, options);
}

/** Ringkasan keuangan untuk beranda; null bila pengguna tidak punya akses keuangan (tidak ada data yang dibaca). */
export async function loadFinanceHome(actor: Actor) {
  if (canViewFinance(actor)) {
    const data = await financeData(actor);
    const sum = overview(data);
    return { kind: "staff" as const, ready: data.state.Akun.length > 0, balance: sum.balance, incoming: sum.incoming, outgoing: sum.outgoing, outstanding: sum.outstanding, overdue: sum.overdue };
  }
  if (canSeeChildBills(actor)) {
    const data = await financeData(actor);
    const children = familyBills(data.state, ownStudentIds(actor), data.today).map((child) => {
      const open = child.invoices.filter((i) => !i.summary.cancelled && i.summary.remaining > 0);
      const next = open.filter((i) => i.nextDue).sort((a, b) => a.nextDue!.date.localeCompare(b.nextDue!.date))[0];
      return {
        siswa_id: child.siswa_id,
        remaining: open.reduce((sum, i) => sum + i.summary.remaining, 0),
        overdue: open.reduce((sum, i) => sum + i.summary.overdue, 0),
        next: next ? { date: next.nextDue!.date, amount: next.nextDue!.amount } : null,
      };
    });
    return { kind: "family" as const, children };
  }
  return null;
}

/** Tagihan seorang siswa untuk profilnya: staf keuangan, atau wali dari siswa itu. Null bila tidak berhak. */
export async function loadStudentBills(actor: Actor, siswaId: string) {
  const allowed = canViewFinance(actor) || (canSeeChildBills(actor) && ownStudentIds(actor).includes(siswaId));
  if (!allowed) return null;
  const data = await financeData(actor);
  return familyBills(data.state, [siswaId], data.today)[0]?.invoices ?? [];
}

/** Tarif program untuk isian pendaftaran terpadu; null bila pengguna tidak boleh mencatat keuangan. */
export async function loadTariffs(actor: Actor) {
  if (!canRecordFinance(actor)) return null;
  const data = await financeData(actor);
  return {
    owner: data.owner,
    tariffs: new Map(data.state.Program.map((p) => [String(p.program_id), { skema: String(p.skema_default), tarif: Number(p.tarif_default) || 0 }])),
  };
}

/** Owner/admin dengan akses lihat keuangan; kartu Pembayaran di profil siswa hanya untuk mereka. */
export const canSeePembayaranSiswa = (actor: Actor) => (actor.user.peran === "OWNER" || actor.user.peran === "ADMIN") && canViewFinance(actor);

/**
 * Riwayat uang masuk yang ditautkan ke satu siswa ("Dari siswa"), tanpa yang sudah dihapus/diubah.
 * Null bila pengguna tidak berhak, siswa tidak ada, atau spreadsheet Keuangan belum siap (profil tetap tampil).
 */
export async function loadPembayaranSiswa(actor: Actor, siswaId: string) {
  if (!canSeePembayaranSiswa(actor)) return null;
  const source = await dataDeps();
  let inti: Tables;
  let keu: Tables;
  try {
    [inti, keu] = await Promise.all([source.store.read("inti", ["Siswa"]), source.store.read("keuangan", ["Akun", "Kategori", "Transaksi"])]);
  } catch (error) {
    if (error instanceof AppError && (error.code === "SCHEMA_INCOMPLETE" || error.code === "CONFIG")) return null;
    throw error;
  }
  const siswa = (inti.Siswa ?? []).map(toStudent).find((st) => st.siswa_id === siswaId && !st.dihapus_pada);
  if (!siswa) return null;
  const rows = (name: string) => (keu[name] ?? []) as Parameters<typeof pembayaranSiswa>[0]["Transaksi"];
  return pembayaranSiswa({ Transaksi: rows("Transaksi"), Akun: rows("Akun"), Kategori: rows("Kategori") }, siswaId, siswa.nama);
}
