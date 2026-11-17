"use server";

import { refresh } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { saveClass, saveProgram, updateSettings } from "@/lib/core/domain";
import { classInput, programInput, settingsInput } from "@/lib/core/validation";
import { failure, formObject, mutate, parse, success } from "@/lib/server/mutate";
import { requireActor } from "@/lib/server/session";

export async function simpanLembaga(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = parse(settingsInput, formObject(formData, ["presensi_qr_langsung_sah"]));
    const result = await mutate(actor, {
      formData,
      action: "simpanLembaga",
      fingerprint: input,
      tables: ["Pengaturan", "Siswa"],
      apply: (t, ctx) => updateSettings(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

export async function simpanProgram(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const raw = formObject(formData, ["aktif"]);
    if (!formData.has("program_id") || !formData.get("program_id")) raw.aktif = true;
    const input = parse(programInput, raw);
    const result = await mutate(actor, {
      formData,
      action: "simpanProgram",
      fingerprint: input,
      tables: ["Program"],
      apply: (t, ctx) => saveProgram(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

export async function simpanKelas(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const raw = formObject(formData, ["aktif"]);
    if (!formData.get("kelas_id")) raw.aktif = true;
    const input = parse(classInput, raw);
    const result = await mutate(actor, {
      formData,
      action: "simpanKelas",
      fingerprint: input,
      tables: ["Program", "Kelas", "Pendaftaran"],
      apply: (t, ctx) => saveClass(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}
