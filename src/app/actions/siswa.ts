"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { setStudentActive, updateEnrollmentStatus, updateStudent } from "@/lib/core/domain";
import { enrollmentInput, enrollmentStatusInput, studentInput } from "@/lib/core/validation";
import { failure, formObject, mutate, operationIdFrom, parse, success } from "@/lib/server/mutate";
import { canRecordFinance } from "@/lib/core/permissions";
import { registerIntegrated, type EnrollmentDraft, type FinanceDraft } from "@/lib/core/terpadu";
import type { Actor } from "@/lib/core/types";
import { AppError } from "@/lib/data/types";
import { deps } from "@/lib/deps";
import { rupiah } from "@/lib/keuangan/form-commands";
import { requireActor } from "@/lib/server/session";

const STUDENT_TABLES = ["Pengaturan", "Siswa", "Pengguna", "Tautan_Akun"] as const;

/** Isian biaya pendaftaran terpadu; hanya dibaca bila bagian biaya ditampilkan (akses keuangan Catat). */
function financeDraft(formData: FormData, actor: Actor): FinanceDraft | null {
  if (formData.get("atur_biaya") !== "1" || !canRecordFinance(actor)) return null;
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  return {
    skema_biaya: text("skema_biaya"),
    tarif_disepakati: rupiah(text("tarif_disepakati")),
    hari_jatuh_tempo: text("hari_jatuh_tempo") || "10",
    terbitkan: formData.get("terbitkan") === "on",
    tanggal_terbit: text("tanggal_terbit"),
    periode_layanan: text("periode_layanan"),
    cicilan: Number(text("cicilan") || 1),
    jatuh_tempo_pertama: text("jatuh_tempo_pertama"),
  };
}

function enrollmentDraft(formData: FormData): EnrollmentDraft | null {
  if (!formData.get("program_id")) return null;
  const input = parse(enrollmentInput, { ...formObject(formData), siswa_id: "-" });
  return { program_id: input.program_id, kelas_id: input.kelas_id, tanggal_mulai: input.tanggal_mulai };
}

/** Siswa baru, sekaligus (opsional) pendaftaran program, ketentuan biaya, dan tagihan pertama. */
export async function tambahSiswa(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let target: string;
  try {
    const result = await registerIntegrated(deps(), actor, {
      operationId: operationIdFrom(formData),
      student: parse(studentInput, formObject(formData)),
      enrollment: enrollmentDraft(formData),
      finance: financeDraft(formData, actor),
    });
    target = `/siswa/${result.siswa_id}?baru=1${result.tagihan_id ? "&tagihan=1" : ""}`;
  } catch (error) {
    return failure(error);
  }
  redirect(target);
}

export async function ubahSiswa(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const siswaId = String(formData.get("siswa_id") ?? "");
    const input = parse(studentInput, formObject(formData));
    const result = await mutate(actor, {
      formData,
      action: "ubahSiswa",
      fingerprint: { siswaId, input },
      tables: ["Siswa", "Pengguna", "Tautan_Akun"],
      apply: (t, ctx) => updateStudent(t, siswaId, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

export async function ubahStatusSiswa(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const siswaId = String(formData.get("siswa_id") ?? "");
    const aktif = formData.get("aktif") === "true";
    const result = await mutate(actor, {
      formData,
      action: "ubahStatusSiswa",
      fingerprint: { siswaId, aktif },
      tables: STUDENT_TABLES,
      apply: (t, ctx) => setStudentActive(t, siswaId, aktif, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

export async function tambahPendaftaran(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const siswaId = String(formData.get("siswa_id") ?? "");
    const enrollment = enrollmentDraft(formData);
    if (!enrollment) return failure(new AppError("Pilih program dan kelas."));
    const result = await registerIntegrated(deps(), actor, { operationId: operationIdFrom(formData), siswa_id: siswaId, enrollment, finance: financeDraft(formData, actor) });
    refresh();
    return success(result.message);
  } catch (error) {
    return failure(error);
  }
}

export async function ubahStatusPendaftaran(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = parse(enrollmentStatusInput, formObject(formData));
    const result = await mutate(actor, {
      formData,
      action: "ubahStatusPendaftaran",
      fingerprint: input,
      tables: ["Pendaftaran"],
      apply: (t, ctx) => updateEnrollmentStatus(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}
