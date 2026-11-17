"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { readQrToken } from "@/lib/auth/qr";
import {
  approveAttendance,
  archiveTest,
  publishReport,
  recordAttendance,
  REPORT_TABLES,
  reviewSubmission,
  reviseReport,
  saveAssignment,
  saveHealth,
  saveReportNote,
  saveSession,
  saveTest,
  setSessionStatus,
  submitAssignment,
  submitAttendance,
} from "@/lib/core/akademik";
import {
  approveInput,
  assignmentInput,
  healthInput,
  reportActionInput,
  reportNoteInput,
  reviewInput,
  selfMarkInput,
  sessionInput,
  sessionStatusInput,
  submissionInput,
  teacherMarkInput,
  testInput,
} from "@/lib/core/akademik-input";
import { AppError } from "@/lib/data/types";
import { failure, formObject, mutate, parse, success } from "@/lib/server/mutate";
import { requireActor } from "@/lib/server/session";

const SESSION_TABLES = ["Pengaturan", "Siswa", "Pendaftaran", "Sesi", "Presensi"] as const;
const TASK_TABLES = ["Pengaturan", "Siswa", "Pendaftaran", "Tugas", "Pengumpulan"] as const;

export async function simpanSesi(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let createdId = "";
  try {
    const input = parse(sessionInput, formObject(formData));
    const result = await mutate(actor, {
      formData,
      action: "simpanSesi",
      fingerprint: input,
      tables: ["Pengaturan", "Pengguna", "Tautan_Akun", "Kelas", "Sesi"],
      apply: (t, ctx) => saveSession(t, input, ctx, actor),
    });
    if (input.sesi_id) {
      refresh();
      return success(result.outcome.message);
    }
    createdId = result.outcome.entityId;
  } catch (error) {
    return failure(error);
  }
  redirect(`/akademik/sesi/${createdId}`);
}

export async function ubahStatusSesi(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = parse(sessionStatusInput, formObject(formData));
    const result = await mutate(actor, {
      formData,
      action: "ubahStatusSesi",
      fingerprint: input,
      tables: SESSION_TABLES,
      apply: (t, ctx) => setSessionStatus(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

export async function catatPresensi(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = parse(teacherMarkInput, formObject(formData));
    const result = await mutate(actor, {
      formData,
      action: "catatPresensi",
      fingerprint: input,
      tables: SESSION_TABLES,
      apply: (t, ctx) => recordAttendance(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

export async function sahkanPresensi(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = parse(approveInput, formObject(formData));
    const result = await mutate(actor, {
      formData,
      action: "sahkanPresensi",
      fingerprint: input,
      tables: SESSION_TABLES,
      apply: (t, ctx) => approveAttendance(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

export async function ajukanPresensi(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = parse(selfMarkInput, formObject(formData));
    const result = await mutate(actor, {
      formData,
      action: "ajukanPresensi",
      fingerprint: input,
      tables: SESSION_TABLES,
      apply: (t, ctx) => submitAttendance(t, input, ctx, actor, "MANDIRI"),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

/** Presensi lewat QR: ID sesi diambil dari token bertanda tangan, bukan dari isian form. */
export async function ajukanPresensiQr(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const sesiId = readQrToken(String(formData.get("qr") ?? ""));
    if (!sesiId) throw new AppError("QR sudah kedaluwarsa atau tidak sah. Pindai ulang QR yang ditampilkan pengajar.");
    const input = { sesi_id: sesiId, status_diajukan: "HADIR" as const, catatan: "" };
    const result = await mutate(actor, {
      formData,
      action: "ajukanPresensiQr",
      fingerprint: input,
      tables: SESSION_TABLES,
      apply: (t, ctx) => submitAttendance(t, input, ctx, actor, "QR"),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

export async function simpanTes(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = parse(testInput, formObject(formData));
    const result = await mutate(actor, {
      formData,
      action: "simpanTes",
      fingerprint: input,
      tables: ["Pengaturan", "Siswa", "Pendaftaran", "Hasil_Tes"],
      apply: (t, ctx) => saveTest(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

export async function arsipkanTes(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const tesId = String(formData.get("tes_id") ?? "");
    const result = await mutate(actor, {
      formData,
      action: "arsipkanTes",
      fingerprint: { tesId },
      tables: ["Pengaturan", "Siswa", "Pendaftaran", "Hasil_Tes"],
      apply: (t, ctx) => archiveTest(t, tesId, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

export async function simpanKesehatan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = parse(healthInput, formObject(formData));
    const result = await mutate(actor, {
      formData,
      action: "simpanKesehatan",
      fingerprint: input,
      tables: ["Pengaturan", "Siswa", "Pendaftaran", "Kesehatan"],
      apply: (t, ctx) => saveHealth(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

export async function simpanTugas(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const raw = formObject(formData, ["aktif"]);
    if (!formData.get("tugas_id")) raw.aktif = true;
    const input = parse(assignmentInput, raw);
    const result = await mutate(actor, {
      formData,
      action: "simpanTugas",
      fingerprint: input,
      tables: ["Pengaturan", "Kelas", "Tugas"],
      apply: (t, ctx) => saveAssignment(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

export async function kirimTugas(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = parse(submissionInput, formObject(formData));
    const result = await mutate(actor, {
      formData,
      action: "kirimTugas",
      fingerprint: input,
      tables: TASK_TABLES,
      apply: (t, ctx) => submitAssignment(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

export async function periksaTugas(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = parse(reviewInput, formObject(formData));
    const result = await mutate(actor, {
      formData,
      action: "periksaTugas",
      fingerprint: input,
      tables: TASK_TABLES,
      apply: (t, ctx) => reviewSubmission(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

export async function simpanCatatanRapor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = parse(reportNoteInput, formObject(formData));
    const result = await mutate(actor, {
      formData,
      action: "simpanCatatanRapor",
      fingerprint: input,
      tables: ["Pengaturan", "Siswa", "Pendaftaran", "Rapor"],
      apply: (t, ctx) => saveReportNote(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

export async function terbitkanRapor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = parse(reportActionInput, formObject(formData));
    const result = await mutate(actor, {
      formData,
      action: "terbitkanRapor",
      fingerprint: input,
      tables: REPORT_TABLES,
      apply: (t, ctx) => publishReport(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

export async function revisiRapor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = parse(reportActionInput, formObject(formData));
    const result = await mutate(actor, {
      formData,
      action: "revisiRapor",
      fingerprint: { siswa_id: input.siswa_id, periode: input.periode },
      tables: ["Pengaturan", "Siswa", "Pendaftaran", "Rapor"],
      apply: (t, ctx) => reviseReport(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}
