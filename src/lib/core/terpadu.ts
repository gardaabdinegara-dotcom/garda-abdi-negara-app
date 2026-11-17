// Pendaftaran terpadu (PRD 4.4 & 5.3): satu isian untuk siswa, pendaftaran program/kelas, ketentuan biaya,
// dan tagihan pertama. Dua spreadsheet tidak bisa ditulis atomik, jadi dijalankan dua langkah dengan
// operation_id yang sama: Inti dulu, lalu Keuangan. Mengirim ulang dengan ID yang sama aman —
// langkah yang sudah tersimpan dikenali dan tidak ditulis dua kali.
import { runOperation } from "../data/coordinator";
import { AppError, type Gate, type Store } from "../data/types";
import { applyFinanceCommand, CORE_TABLES, FINANCE_TABLES } from "../keuangan/sumber";
import { createEnrollment, createStudent } from "./domain";
import { canManageAccount, canRecordFinance } from "./permissions";
import { createStudentAccount } from "./pin";
import type { Actor } from "./types";
import type { StudentInput } from "./validation";

export interface EnrollmentDraft {
  program_id: string;
  kelas_id: string;
  tanggal_mulai: string;
}

export interface FinanceDraft {
  skema_biaya: string;
  tarif_disepakati: string;
  hari_jatuh_tempo: string;
  terbitkan: boolean;
  tanggal_terbit: string;
  periode_layanan: string;
  cicilan: number;
  jatuh_tempo_pertama: string;
}

export interface IntegratedInput {
  operationId: string;
  /** Siswa baru, atau `siswa_id` untuk siswa yang sudah ada. */
  student?: StudentInput;
  siswa_id?: string;
  enrollment?: EnrollmentDraft | null;
  finance?: FinanceDraft | null;
}

export interface IntegratedResult {
  siswa_id: string;
  kode_siswa: string;
  pendaftaran_id: string;
  tagihan_id: string;
  message: string;
}

/** Kegagalan langkah keuangan setelah data inti tersimpan. Pesannya menjelaskan apa yang sudah aman. */
export class PartialSaveError extends AppError {
  constructor(message: string) {
    super(message, "PARTIAL", 409);
  }
}

export async function registerIntegrated(deps: { store: Store; gate: Gate }, actor: Actor, input: IntegratedInput): Promise<IntegratedResult> {
  if (input.finance && !canRecordFinance(actor)) throw new AppError("Ketentuan biaya dan tagihan memerlukan akses keuangan Catat.", "FORBIDDEN", 403);
  if (input.finance && !input.enrollment) throw new AppError("Pilih program dan kelas sebelum mengatur biaya.");
  if (!input.student && !input.siswa_id) throw new AppError("Data siswa wajib diisi.");
  if (input.finance && !(Number(input.finance.tarif_disepakati) > 0)) {
    throw new AppError("Isi tarif biaya, atau minta pemilik mengatur tarif program terlebih dahulu.");
  }

  // Langkah 1 — spreadsheet Inti: siswa (bila baru) dan pendaftaran.
  const core = await runOperation<{ siswa_id: string; kode_siswa: string; pendaftaran_id: string }>(deps, {
    sheet: "inti",
    operationId: input.operationId,
    actorId: actor.user.user_id,
    action: input.student ? "daftarSiswaTerpadu" : "tambahPendaftaran",
    fingerprint: { student: input.student ?? null, siswa_id: input.siswa_id ?? null, enrollment: input.enrollment ?? null },
    tables: ["Pengaturan", "Siswa", "Program", "Kelas", "Pendaftaran", "Pengguna", "Tautan_Akun"],
    apply: (t, ctx) => {
      let siswaId = input.siswa_id ?? "";
      let kode = "";
      let message = "";
      if (input.student) {
        const created = createStudent(t, input.student, ctx, actor);
        siswaId = created.entityId;
        kode = String((created.data as { kode_siswa?: string } | undefined)?.kode_siswa ?? "");
        // Siswa baru langsung punya akun login: username = kode siswa, PIN dibuat sendiri saat masuk pertama.
        const account = canManageAccount(actor, "SISWA") ? createStudentAccount(t, siswaId, ctx, actor) : null;
        message = account ? `${created.message} Akun login ${account.data!.username} siap; siswa membuat PIN saat masuk pertama.` : created.message;
      }
      let pendaftaranId = "";
      if (input.enrollment) {
        const enrolled = createEnrollment(t, { siswa_id: siswaId, ...input.enrollment }, ctx, actor);
        pendaftaranId = enrolled.entityId;
        message = message ? `${message} Pendaftaran program ditambahkan.` : enrolled.message;
      }
      return { entityType: "Siswa", entityId: siswaId, message, data: { siswa_id: siswaId, kode_siswa: kode, pendaftaran_id: pendaftaranId } };
    },
  });
  const saved = core.outcome.data!;
  const result: IntegratedResult = { ...saved, tagihan_id: "", message: core.outcome.message };
  if (!input.finance || !saved.pendaftaran_id) return result;

  // Langkah 2 — spreadsheet Keuangan: ketentuan biaya dan (opsional) tagihan pertama.
  try {
    const inti = await deps.store.read("inti", CORE_TABLES, { fresh: true });
    const data = { pendaftaran_id: saved.pendaftaran_id, ...input.finance };
    const finance = await runOperation(deps, {
      sheet: "keuangan",
      operationId: input.operationId,
      actorId: actor.user.user_id,
      action: "enrollment.setup",
      fingerprint: data,
      tables: FINANCE_TABLES,
      apply: (t, ctx) => applyFinanceCommand(inti, t, { action: "enrollment.setup", data }, ctx, actor),
    });
    const tagihan = (finance.outcome.data as { tagihan_id?: string } | undefined)?.tagihan_id ?? "";
    return { ...result, tagihan_id: tagihan, message: `${result.message} ${finance.outcome.message}` };
  } catch (error) {
    const reason = error instanceof AppError ? error.message : "Penyimpanan keuangan gagal.";
    const who = saved.kode_siswa ? `Siswa ${saved.kode_siswa} dan pendaftarannya` : "Pendaftaran";
    throw new PartialSaveError(`${who} sudah tersimpan, tetapi biaya/tagihan belum: ${reason} Perbaiki isian biaya lalu tekan Simpan lagi; data siswa tidak akan tersimpan dua kali.`);
  }
}
