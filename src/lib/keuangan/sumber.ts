// Jembatan antara logika Keuangan lama (satu "State" berisi semua tabel) dan struktur dua spreadsheet Ruang Garda.
// - Siswa, Program, Pendaftaran, dan Pengguna dibaca dari spreadsheet Inti (hanya dibaca).
// - Tarif program dan ketentuan biaya disimpan di spreadsheet Keuangan sebagai riwayat (Tarif_Program, Ketentuan_Biaya).
// - Semua tabel keuangan lain dipakai apa adanya dengan kolom yang sama seperti aplikasi lama (struktur v2).
import type { OperationContext, OperationOutcome } from "../data/coordinator";
import { str } from "../data/rows";
import { AppError, type Row as StoreRow, type Tables } from "../data/types";
import { canCorrectFinance, canRecordFinance, financeAccess } from "../core/permissions";
import { toClass, toEnrollment, toProgram, toStudent, toUser, type Actor } from "../core/types";
import { applyCommand, DomainError, dueDate, emptyState, initialState, validateState, type Actor as LedgerActor, type Row, type State } from "./domain";

/** Tab spreadsheet Keuangan yang dibaca untuk menyusun State (tanpa tab operasi). */
export const FINANCE_TABLES = [
  "Pengaturan_Keuangan",
  "Tarif_Program",
  "Ketentuan_Biaya",
  "Tagihan",
  "Jadwal_Tagihan",
  "Penyesuaian_Tagihan",
  "Akun",
  "Kategori",
  "Transaksi",
  "Pemetaan_Laporan",
  "Aset",
  "Saldo_Neraca",
  "Jurnal_Laporan",
  "Tarif_Pajak",
  "Pembayaran_Pajak",
] as const;

/** Tab spreadsheet Inti yang dibutuhkan keuangan. */
export const CORE_TABLES = ["Pengaturan", "Pengguna", "Siswa", "Program", "Kelas", "Pendaftaran"] as const;

const DIRECT = [
  "Tagihan",
  "Jadwal_Tagihan",
  "Penyesuaian_Tagihan",
  "Akun",
  "Kategori",
  "Transaksi",
  "Pemetaan_Laporan",
  "Aset",
  "Saldo_Neraca",
  "Jurnal_Laporan",
  "Tarif_Pajak",
  "Pembayaran_Pajak",
] as const;

/** Kunci Pengaturan yang berasal dari spreadsheet Inti atau aturan aplikasi, bukan disimpan di Pengaturan_Keuangan. */
const DERIVED_SETTINGS = new Set(["schema_version", "business_name", "timezone"]);

const coreSetting = (inti: Tables, key: string, fallback: string) => str((inti.Pengaturan ?? []).find((r) => r.key === key)?.value) || fallback;

/** Baris terakhir per kunci (riwayat tarif/ketentuan ditambahkan berurutan; yang terbaru berlaku). */
function latestBy(rows: readonly StoreRow[], key: string): Map<string, StoreRow> {
  const out = new Map<string, StoreRow>();
  for (const row of rows) {
    const id = str(row[key]);
    const prev = out.get(id);
    if (!prev || str(row.berlaku_mulai) >= str(prev.berlaku_mulai)) out.set(id, row);
  }
  return out;
}

/** Menyusun State keuangan dari tab Inti dan Keuangan. */
export function composeState(inti: Tables, keu: Tables): State {
  const s = emptyState();
  s.Pengaturan = [
    ...(keu.Pengaturan_Keuangan ?? []).filter((r) => !DERIVED_SETTINGS.has(str(r.key))).map((r) => ({ ...r }) as Row),
    { key: "schema_version", value: "2" },
    { key: "business_name", value: coreSetting(inti, "nama_lembaga", "Garda Abdi Negara") },
    { key: "timezone", value: coreSetting(inti, "zona_waktu", "Asia/Jakarta") },
  ];
  if (!s.Pengaturan.some((r) => r.key === "closed_periods")) s.Pengaturan.push({ key: "closed_periods", value: "[]" });

  s.Pengguna = (inti.Pengguna ?? []).map(toUser).map((u) => ({
    user_id: u.user_id,
    google_sub: "",
    email: "",
    nama: u.nama,
    role: u.peran === "OWNER" ? "OWNER" : u.peran === "ADMIN" && u.akses_keuangan === "CATAT" ? "ADMIN" : "VIEWER",
    aktif: u.aktif,
  }));

  const tariffs = latestBy(keu.Tarif_Program ?? [], "program_id");
  s.Program = (inti.Program ?? []).map(toProgram).map((p) => {
    const tariff = tariffs.get(p.program_id);
    return {
      program_id: p.program_id,
      nama_program: p.nama_program,
      target_seleksi: p.target_seleksi,
      skema_default: tariff ? str(tariff.skema_default) || "PAKET" : "PAKET",
      tarif_default: tariff ? Number(tariff.tarif_default) || 0 : 0,
      aktif: p.aktif,
    };
  });
  const programById = new Map(s.Program.map((p) => [String(p.program_id), p]));

  s.Siswa = (inti.Siswa ?? []).map(toStudent).map((st) => ({
    siswa_id: st.siswa_id,
    nama: st.nama,
    no_wa: st.no_wa,
    nama_wali: st.nama_wali,
    no_wa_wali: st.no_wa_wali,
    tanggal_daftar: st.tanggal_daftar,
    aktif: st.aktif,
    catatan: "",
  }));

  const classes = new Map((inti.Kelas ?? []).map(toClass).map((c) => [c.kelas_id, c.nama_kelas]));
  const fees = latestBy(keu.Ketentuan_Biaya ?? [], "pendaftaran_id");
  s.Pendaftaran = (inti.Pendaftaran ?? []).map(toEnrollment).map((e) => {
    const fee = fees.get(e.pendaftaran_id);
    const program = programById.get(e.program_id);
    return {
      pendaftaran_id: e.pendaftaran_id,
      siswa_id: e.siswa_id,
      program_id: e.program_id,
      angkatan: classes.get(e.kelas_id) ?? "",
      tanggal_mulai: e.tanggal_mulai,
      tanggal_selesai: e.tanggal_selesai,
      skema_biaya: fee ? str(fee.skema_biaya) : String(program?.skema_default ?? "PAKET"),
      tarif_disepakati: fee ? Number(fee.tarif_disepakati) || 0 : Number(program?.tarif_default ?? 0),
      hari_jatuh_tempo: fee ? Number(fee.hari_jatuh_tempo) || 5 : 5,
      status: e.status,
      ketentuan_ada: Boolean(fee),
    };
  });

  for (const table of DIRECT) s[table] = (keu[table] ?? []).map((r) => ({ ...r }) as Row);
  s.Operasi = [];
  return s;
}

/** Peran pada logika keuangan lama: OWNER, ADMIN (boleh mencatat), atau VIEWER (hanya melihat). */
export function ledgerActor(actor: Actor): LedgerActor {
  const access = financeAccess(actor);
  return {
    id: actor.user.user_id,
    name: actor.user.nama,
    email: "",
    role: actor.user.peran === "OWNER" ? "OWNER" : access === "CATAT" ? "ADMIN" : "VIEWER",
  };
}

/** Perintah yang boleh dijalankan pencatat (admin dengan akses Catat). Sisanya khusus OWNER. */
export const RECORDER_ACTIONS = new Set(["invoice.create", "invoice.monthly", "payment.create", "transaction.create", "transfer.create", "fee.save", "enrollment.setup"]);
export const OWNER_ACTIONS = new Set([
  "transaction.edit",
  "tariff.save",
  "master.save",
  "finance.bootstrap",
  "invoice.adjust",
  "invoice.adjust.reverse",
  "invoice.refund",
  "transaction.reverse",
  "period.reconcile",
  "period.close",
  "period.open",
  "report.profile",
  "report.mapping",
  "report.asset",
  "report.opening",
  "report.journal",
  "report.journal.reverse",
  "report.tax.rate",
  "report.tax.payment",
]);

const MESSAGES: Record<string, string> = {
  "transaction.edit": "Transaksi diubah. Catatan lama dibalik dan versi barunya disimpan.",
  "invoice.create": "Tagihan diterbitkan.",
  "invoice.monthly": "Tagihan bulanan diterbitkan.",
  "payment.create": "Pembayaran dicatat.",
  "transaction.create": "Transaksi dicatat.",
  "transfer.create": "Transfer antar akun dicatat.",
  "fee.save": "Ketentuan biaya disimpan.",
  "enrollment.setup": "Ketentuan biaya disimpan.",
  "tariff.save": "Tarif program disimpan.",
  "master.save": "Data master disimpan.",
  "finance.bootstrap": "Akun kas/bank dan kategori awal dibuat.",
  "invoice.adjust": "Penyesuaian tagihan dicatat.",
  "invoice.adjust.reverse": "Penyesuaian tagihan dibatalkan dengan pembalik.",
  "invoice.refund": "Refund dicatat.",
  "transaction.reverse": "Transaksi dikoreksi dengan pembalik.",
  "period.reconcile": "Hasil pencocokan saldo disimpan.",
  "period.close": "Periode ditutup.",
  "period.open": "Periode dibuka kembali.",
  "report.profile": "Dasar laporan disimpan.",
  "report.mapping": "Pemetaan kategori disimpan.",
  "report.asset": "Aset disimpan.",
  "report.opening": "Saldo awal neraca diverifikasi.",
  "report.journal": "Jurnal nonkas dicatat.",
  "report.journal.reverse": "Jurnal nonkas dibalik.",
  "report.tax.rate": "Tarif pajak disimpan.",
  "report.tax.payment": "Pembayaran pajak ditautkan.",
};

export interface FinanceCommand {
  action: string;
  data: Record<string, unknown>;
}

/** Menerjemahkan perintah Ruang Garda ke perintah logika lama. */
function translate(state: State, command: FinanceCommand): FinanceCommand {
  const d = command.data;
  if (command.action === "fee.save") {
    const enrollment = state.Pendaftaran.find((r) => r.pendaftaran_id === d.pendaftaran_id);
    if (!enrollment) throw new AppError("Pendaftaran tidak ditemukan.", "NOT_FOUND", 404);
    return {
      action: "enrollment.save",
      data: {
        id: enrollment.pendaftaran_id,
        siswa_id: enrollment.siswa_id,
        program_id: enrollment.program_id,
        angkatan: enrollment.angkatan,
        tanggal_mulai: enrollment.tanggal_mulai,
        tanggal_selesai: enrollment.tanggal_selesai,
        status: enrollment.status,
        skema_biaya: d.skema_biaya,
        tarif_disepakati: d.tarif_disepakati,
        hari_jatuh_tempo: d.hari_jatuh_tempo,
      },
    };
  }
  if (command.action === "tariff.save") {
    const program = state.Program.find((r) => r.program_id === d.program_id);
    if (!program) throw new AppError("Program tidak ditemukan.", "NOT_FOUND", 404);
    return {
      action: "master.save",
      data: {
        table: "Program",
        id: program.program_id,
        nama_program: program.nama_program,
        target_seleksi: program.target_seleksi || "Umum",
        skema_default: d.skema_default,
        tarif_default: d.tarif_default,
        aktif: program.aktif === true,
      },
    };
  }
  if (command.action === "invoice.create") {
    const { cicilan, jatuh_tempo_pertama, ...data } = d;
    const enrollment = state.Pendaftaran.find((r) => r.pendaftaran_id === d.pendaftaran_id);
    const count = Number(cicilan || 1);
    const first = String(jatuh_tempo_pertama || "");
    if (enrollment && enrollment.skema_biaya === "PAKET" && (count > 1 || first)) {
      if (!Number.isInteger(count) || count < 1 || count > 24) throw new AppError("Jumlah cicilan harus 1–24.");
      const face = Number(enrollment.tarif_disepakati) - Number(d.diskon_awal || 0);
      const start = first || String(d.tanggal_terbit);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new AppError("Tanggal jatuh tempo pertama tidak valid.");
      const part = Math.floor(face / count);
      data.jadwal = Array.from({ length: count }, (_, i) => ({ date: addMonths(start, i), amount: i === count - 1 ? face - part * (count - 1) : part }));
    } else if (count > 1) {
      throw new AppError("Cicilan hanya untuk tagihan paket. Tagihan bulanan diterbitkan per bulan.");
    }
    return { action: command.action, data };
  }
  if (command.action === "master.save" && !["Akun", "Kategori"].includes(String(d.table))) {
    throw new AppError("Program dan tarif dikelola dari Pengaturan dan halaman Tarif.", "FORBIDDEN", 403);
  }
  return command;
}

/** Tanggal yang sama pada bulan ke-n berikutnya (dibatasi akhir bulan). */
function addMonths(date: string, months: number): string {
  const [y, m, day] = date.split("-").map(Number) as [number, number, number];
  const index = y * 12 + (m - 1) + months;
  return dueDate(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`, day);
}

/**
 * Kategori bawaan lembaga dan kelompok laporannya. Karena sudah dipetakan sejak awal, pemasukan dan
 * pengeluaran yang dicatat manual langsung masuk laba rugi tanpa langkah pemetaan tambahan.
 * ID honor/operasional/sewa/lain sama dengan aplikasi lama agar data dan tes lama tetap cocok.
 */
const KATEGORI_LEMBAGA: [id: string, nama: string, jenis: "PENERIMAAN_LAIN" | "BIAYA", kelompok: string][] = [
  ["bimbel", "Pembayaran bimbel siswa", "PENERIMAAN_LAIN", "PENDAPATAN"],
  ["pendaftaran", "Biaya pendaftaran & formulir", "PENERIMAAN_LAIN", "PENDAPATAN"],
  ["lain", "Pemasukan lain", "PENERIMAAN_LAIN", "PENDAPATAN_LAIN"],
  ["honor", "Honor pelatih & pengajar", "BIAYA", "GAJI"],
  ["sewa", "Sewa tempat & lapangan", "BIAYA", "SEWA"],
  ["operasional", "Operasional latihan", "BIAYA", "BIAYA_LAIN"],
  ["atk", "Cetak, ATK & modul", "BIAYA", "ADMINISTRASI"],
  ["utilitas", "Listrik, internet & pulsa", "BIAYA", "UTILITAS"],
  ["promosi", "Promosi", "BIAYA", "PEMASARAN"],
  ["konsumsi", "Konsumsi", "BIAYA", "BIAYA_LAIN"],
];

/**
 * Memulai pembukuan, hanya bila belum ada akun maupun kategori: akun kas & bank, kategori lembaga yang
 * sudah dipetakan ke laporan, serta dasar laporan (kas dengan penyesuaian nonkas) mulai bulan itu.
 */
function bootstrap(state: State, date: string, actorId: string, now: string): Row {
  if (state.Akun.length || state.Kategori.length) throw new AppError("Akun atau kategori sudah ada. Tambahkan dari halaman Master.");
  const seed = initialState("", date);
  const stamp = { created_at: now, created_by: actorId, updated_at: now, updated_by: actorId };
  const start = `${date.slice(0, 7)}-01`;
  state.Akun = seed.Akun.map((a) => ({ ...a, akun_id: `AKN_${a.akun_id}`, ...stamp }));
  state.Kategori = KATEGORI_LEMBAGA.map(([id, nama, jenis]) => ({ kategori_id: `KTG_${id}`, nama_kategori: nama, jenis_yang_diizinkan: jenis, kelompok_arus: "OPERASIONAL", aktif: true, ...stamp }));
  if (state.Pemetaan_Laporan.length === 0) {
    state.Pemetaan_Laporan = KATEGORI_LEMBAGA.map(([id, , , kelompok]) => ({ pemetaan_id: `MAP_${id}`, kategori_id: `KTG_${id}`, kelompok, berlaku_mulai: start, operation_id: "", ...stamp }));
  }
  const put = (key: string, value: string) => {
    if (state.Pengaturan.some((r) => r.key === key && String(r.value ?? "") !== "")) return;
    state.Pengaturan = [...state.Pengaturan.filter((r) => r.key !== key), { key, value, updated_at: now, updated_by: actorId }];
  };
  put("reporting_start", start);
  put("reporting_basis", "KAS_DISESUAIKAN");
  validateState(state);
  return { id: "awal", akun: state.Akun.length, kategori: state.Kategori.length };
}

const FEE_FIELDS = ["skema_biaya", "tarif_disepakati", "hari_jatuh_tempo"] as const;
const TARIFF_FIELDS = ["skema_default", "tarif_default"] as const;
const same = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "");

/** Menulis perubahan State ke tab Keuangan. Data Inti tidak boleh berubah lewat keuangan. */
function writeBack(before: State, after: State, keu: Tables, ctx: OperationContext): void {
  const audit = { created_at: ctx.now, created_by: ctx.actorId, updated_at: ctx.now, updated_by: ctx.actorId };
  const date = ctx.now.slice(0, 10);

  for (const table of DIRECT) keu[table] = after[table].map((r) => ({ ...r }) as StoreRow);

  const settings = keu.Pengaturan_Keuangan!;
  for (const row of after.Pengaturan) {
    const key = String(row.key);
    if (DERIVED_SETTINGS.has(key)) continue;
    const old = before.Pengaturan.find((r) => r.key === key);
    if (old && same(old.value, row.value)) continue;
    const index = settings.findIndex((r) => r.key === key);
    const next = { key, value: String(row.value ?? ""), updated_at: ctx.now, updated_by: ctx.actorId };
    if (index >= 0) settings[index] = next;
    else settings.push(next);
  }

  const guard = (table: "Program" | "Pendaftaran" | "Siswa" | "Pengguna", key: string, allowed: readonly string[]) => {
    if (after[table].length !== before[table].length) throw new AppError(`Data ${table} dikelola dari menu inti, bukan dari keuangan.`, "FORBIDDEN", 403);
    const changed: Row[] = [];
    after[table].forEach((row, i) => {
      const old = before[table][i]!;
      if (String(old[key]) !== String(row[key])) throw new AppError(`Urutan data ${table} berubah.`, "DATA_INTEGRITY", 409);
      const diff = Object.keys({ ...old, ...row }).filter((k) => !["updated_at", "updated_by", "created_at", "created_by"].includes(k) && !same(old[k], row[k]));
      if (diff.some((k) => !allowed.includes(k))) throw new AppError(`Data ${table} dikelola dari menu inti, bukan dari keuangan.`, "FORBIDDEN", 403);
      if (diff.length) changed.push(row);
    });
    return changed;
  };

  for (const row of guard("Program", "program_id", TARIFF_FIELDS)) {
    keu.Tarif_Program!.push({
      tarif_id: ctx.newId("TRF"),
      program_id: String(row.program_id),
      skema_default: String(row.skema_default),
      tarif_default: Number(row.tarif_default),
      berlaku_mulai: date,
      ...audit,
    });
  }
  for (const row of guard("Pendaftaran", "pendaftaran_id", [...FEE_FIELDS, "ketentuan_ada"])) {
    keu.Ketentuan_Biaya!.push({
      ketentuan_id: ctx.newId("KTB"),
      pendaftaran_id: String(row.pendaftaran_id),
      skema_biaya: String(row.skema_biaya),
      tarif_disepakati: Number(row.tarif_disepakati),
      hari_jatuh_tempo: Number(row.hari_jatuh_tempo),
      berlaku_mulai: date,
      ...audit,
    });
  }
  guard("Siswa", "siswa_id", []);
  guard("Pengguna", "user_id", []);
}

/**
 * Menjalankan satu perintah keuangan di dalam koordinator penyimpanan spreadsheet Keuangan.
 * `inti` dibaca terpisah (hanya dibaca); `keu` adalah salinan tab Keuangan yang akan ditulis.
 */
export function applyFinanceCommand(inti: Tables, keu: Tables, command: FinanceCommand, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!canRecordFinance(actor)) throw new AppError("Akses keuangan Anda hanya untuk melihat.", "FORBIDDEN", 403);
  if (!RECORDER_ACTIONS.has(command.action) && !OWNER_ACTIONS.has(command.action)) throw new AppError("Tindakan keuangan tidak dikenali.", "VALIDATION", 400);
  if (OWNER_ACTIONS.has(command.action) && !canCorrectFinance(actor)) throw new AppError("Tindakan ini hanya untuk pemilik.", "FORBIDDEN", 403);
  try {
    const before = composeState(inti, keu);
    let after: State;
    let result: Row;
    if (command.action === "finance.bootstrap") {
      after = structuredClone(before);
      result = bootstrap(after, String(command.data.tanggal_saldo_awal || ctx.now.slice(0, 10)), ctx.actorId, ctx.now);
    } else if (command.action === "enrollment.setup") {
      ({ after, result } = setupEnrollment(before, command.data, ctx, actor));
    } else if (command.action === "transaction.edit") {
      ({ after, result } = editTransaction(before, command.data, ctx, actor));
    } else {
      const translated = translate(before, command);
      if (translated.action === "invoice.create" || translated.action === "invoice.monthly") requireFees(before, translated);
      ({ state: after, result } = applyCommand(before, { operationId: ctx.operationId, action: translated.action, data: translated.data }, ledgerActor(actor), ctx.now));
      // Menyimpan ketentuan biaya selalu dicatat, walau nilainya sama dengan tarif program.
      if (command.action === "fee.save") {
        const row = after.Pendaftaran.find((r) => r.pendaftaran_id === command.data.pendaftaran_id);
        if (row) row.ketentuan_ada = true;
      }
    }
    writeBack(before, after, keu, ctx);
    const count = typeof result.count === "number" ? result.count : null;
    return {
      entityType: "Keuangan",
      entityId: String(result.id ?? command.action),
      message:
        command.action === "invoice.monthly"
          ? `${count ?? 0} tagihan bulanan diterbitkan.`
          : command.action === "enrollment.setup" && result.tagihan_id
            ? "Ketentuan biaya disimpan dan tagihan pertama diterbitkan."
            : (MESSAGES[command.action] ?? "Perubahan disimpan."),
      data: result,
      alasan: String(command.data.alasan ?? ""),
    };
  } catch (error) {
    if (error instanceof DomainError) throw new AppError(error.message, error.code, error.status === 422 ? 400 : error.status);
    throw error;
  }
}

/**
 * Pendaftaran terpadu (PRD 4.4): ketentuan biaya pendaftaran lalu, bila diminta, tagihan pertamanya —
 * dalam satu operasi spreadsheet Keuangan. Aturan tarif khusus dan tagihan tetap dari logika keuangan.
 */
function setupEnrollment(before: State, d: Record<string, unknown>, ctx: OperationContext, actor: Actor): { after: State; result: Row } {
  const id = String(d.pendaftaran_id ?? "");
  const fee = translate(before, { action: "fee.save", data: { pendaftaran_id: id, skema_biaya: d.skema_biaya, tarif_disepakati: d.tarif_disepakati, hari_jatuh_tempo: d.hari_jatuh_tempo } });
  let step = applyCommand(before, { operationId: ctx.operationId, action: fee.action, data: fee.data }, ledgerActor(actor), ctx.now);
  let after = step.state;
  // Catatan operasi langkah pertama dibuang agar langkah kedua tidak dianggap pengulangan.
  after.Operasi = [];
  const enrollment = after.Pendaftaran.find((r) => r.pendaftaran_id === id);
  if (enrollment) enrollment.ketentuan_ada = true;
  let result: Row = { id };
  if (d.terbitkan === true) {
    const monthly = enrollment?.skema_biaya === "BULANAN";
    const start = String(enrollment?.tanggal_mulai ?? "").slice(0, 7);
    const issued = String(d.tanggal_terbit ?? "");
    const period = monthly ? String(d.periode_layanan || [issued.slice(0, 7), start].sort().reverse()[0]) : "";
    const invoice = translate(after, {
      action: "invoice.create",
      data: { pendaftaran_id: id, tanggal_terbit: issued, periode_layanan: period, diskon_awal: "0", cicilan: d.cicilan, jatuh_tempo_pertama: d.jatuh_tempo_pertama },
    });
    step = applyCommand(after, { operationId: ctx.operationId, action: invoice.action, data: invoice.data }, ledgerActor(actor), ctx.now);
    after = step.state;
    result = { id, tagihan_id: String(step.result.id ?? "") };
  }
  return { after, result };
}

/** Jenis yang dicatat manual dan boleh diubah langsung oleh owner. */
export const EDITABLE_KINDS = ["PENERIMAAN_LAIN", "BIAYA", "MODAL_MASUK", "PRIVE", "PINJAMAN_MASUK", "POKOK_PINJAMAN_KELUAR"];

/**
 * Mengubah transaksi manual dalam satu operasi: transaksi lama dibalik pada tanggal aslinya (jadi saldo dan
 * laporan bulan itu kembali seperti sebelum dicatat), lalu versi barunya dicatat. Jejak keduanya tetap ada.
 */
function editTransaction(before: State, d: Record<string, unknown>, ctx: OperationContext, actor: Actor): { after: State; result: Row } {
  const original = before.Transaksi.find((t) => t.transaksi_id === d.transaksi_id);
  if (!original) throw new AppError("Transaksi tidak ditemukan.", "NOT_FOUND", 404);
  if (!EDITABLE_KINDS.includes(String(original.jenis)) || original.tagihan_id) throw new AppError("Transaksi ini tidak bisa diubah dari sini. Gunakan koreksi.");
  const alasan = String(d.alasan ?? "").trim().slice(0, 400) || "Salah catat";
  const reverse = translate(before, { action: "transaction.reverse", data: { transaksi_id: original.transaksi_id, tanggal_transaksi: original.tanggal_transaksi, alasan: `Diubah (${alasan})` } });
  const first = applyCommand(before, { operationId: ctx.operationId, action: reverse.action, data: reverse.data }, ledgerActor(actor), ctx.now);
  const create = translate(first.state, {
    action: "transaction.create",
    data: {
      jenis: original.jenis,
      akun_id: d.akun_id ?? original.akun_id,
      nominal: d.nominal,
      tanggal_transaksi: d.tanggal_transaksi ?? original.tanggal_transaksi,
      kategori_id: d.kategori_id ?? "",
      deskripsi: d.deskripsi,
      bukti_url: d.bukti_url ?? original.bukti_url ?? "",
      program_id_opsional: original.program_id_opsional ?? "",
      referensi_eksternal: original.referensi_eksternal ?? "",
      alasan,
    },
  });
  // ID transaksi dibentuk dari ID operasi + nomor urut, jadi langkah kedua memakai ID turunan agar tidak bentrok.
  const second = applyCommand(first.state, { operationId: `${ctx.operationId}-ubah`, action: create.action, data: create.data }, ledgerActor(actor), ctx.now);
  return { after: second.state, result: { id: String(second.result.id ?? original.transaksi_id) } };
}

/** Tagihan hanya diterbitkan untuk pendaftaran yang sudah punya ketentuan biaya. */
function requireFees(state: State, command: FinanceCommand) {
  const ids = command.action === "invoice.monthly" ? ((command.data.pendaftaran_ids as unknown[]) ?? []).map(String) : [String(command.data.pendaftaran_id ?? "")];
  for (const id of ids) {
    const enrollment = state.Pendaftaran.find((r) => r.pendaftaran_id === id);
    if (enrollment && (!Number(enrollment.tarif_disepakati) || enrollment.ketentuan_ada !== true)) {
      const student = state.Siswa.find((r) => r.siswa_id === enrollment.siswa_id);
      throw new AppError(`Atur ketentuan biaya untuk ${student?.nama ?? "pendaftaran ini"} sebelum menerbitkan tagihan.`);
    }
  }
}
