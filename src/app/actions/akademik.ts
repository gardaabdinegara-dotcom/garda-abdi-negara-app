"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { readQrToken } from "@/lib/auth/qr";
import {
  approveAttendance,
  archiveTest,
  deleteSession,
  publishReport,
  recordAttendance,
  REPORT_TABLES,
  reviewSubmission,
  reviseReport,
  saveAssignment,
  saveHealth,
  saveReportNote,
  saveSessionScoped,
  saveSessionSeries,
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
  sessionDeleteInput,
  sessionInput,
  sessionScope,
  sessionSeriesInput,
  sessionStatusInput,
  submissionInput,
  teacherMarkInput,
  testInput,
} from "@/lib/core/akademik-input";
import { AppError } from "@/lib/data/types";
import { failure, formObject, mutate, parse, success } from "@/lib/server/mutate";
import { matchUjiSiswaForm, requireActor } from "@/lib/server/session";

const SESSION_TABLES = ["Pengaturan", "Siswa", "Pendaftaran", "Sesi", "Presensi"] as const;
const TASK_TABLES = ["Pengaturan", "Siswa", "Pendaftaran", "Tugas", "Pengumpulan"] as const;

const SAVE_SESSION_TABLES = ["Pengaturan", "Pengguna", "Tautan_Akun", "Kelas", "Sesi", "Presensi"] as const;

export async function simpanSesi(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let target = "";
  try {
    const raw = formObject(formData);
    // Sesi berulang: satu operasi membuat seluruh seri (semua atau tidak sama sekali).
    if (!raw.sesi_id && formData.get("ulangi") === "on") {
      const input = parse(sessionSeriesInput, { ...raw, hari: formData.getAll("hari").map(String) });
      const result = await mutate(actor, {
        formData,
        action: "simpanSesiBerulang",
        fingerprint: input,
        tables: SAVE_SESSION_TABLES,
        apply: (t, ctx) => saveSessionSeries(t, input, ctx, actor),
      });
      const first = (result.outcome.data as { tanggal?: string } | undefined)?.tanggal ?? input.tanggal;
      target = `/akademik?tab=jadwal&tanggal=${encodeURIComponent(first)}`;
    } else {
      const input = { ...parse(sessionInput, raw), lingkup: sessionScope.parse(raw.lingkup) };
      const result = await mutate(actor, {
        formData,
        action: "simpanSesi",
        fingerprint: input,
        tables: SAVE_SESSION_TABLES,
        apply: (t, ctx) => saveSessionScoped(t, input, ctx, actor),
      });
      if (input.sesi_id) {
        refresh();
        return success(result.outcome.message);
      }
      // Sesi baru langsung terpilih di layar Presensi.
      target = `/akademik?sesi=${encodeURIComponent(result.outcome.entityId)}`;
    }
  } catch (error) {
    return failure(error);
  }
  redirect(target);
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
    const test = await matchUjiSiswaForm(formData);
    const sesiId = readQrToken(String(formData.get("qr") ?? ""), Date.now(), test?.id);
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

/**
 * Menghapus sesi yang salah input (owner/admin) lalu kembali ke tab Jadwal pada tanggal itu.
 * Lingkup "seri" ikut menghapus sesi berikutnya dalam seri yang belum berjalan.
 */
export async function hapusSesi(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const tanggal = String(formData.get("tanggal") ?? "");
  try {
    const input = parse(sessionDeleteInput, formObject(formData));
    await mutate(actor, {
      formData,
      action: "hapusSesi",
      // Sidik jari lama ({ sesiId }) dipertahankan untuk hapus satu sesi agar kirim ulang tetap dikenali.
      fingerprint: input.lingkup === "seri" ? { sesiId: input.sesi_id, lingkup: "seri" } : { sesiId: input.sesi_id },
      tables: SESSION_TABLES,
      apply: (t, ctx) => deleteSession(t, input, ctx, actor),
    });
  } catch (error) {
    return failure(error);
  }
  redirect(/^\d{4}-\d{2}-\d{2}$/.test(tanggal) ? `/akademik?tab=jadwal&tanggal=${tanggal}` : "/akademik");
}
