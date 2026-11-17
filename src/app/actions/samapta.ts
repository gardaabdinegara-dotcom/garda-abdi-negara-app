"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { addSamaptaParticipant, SAMAPTA_TABLES, saveSamaptaPos, saveSamaptaTest, setSamaptaStatus } from "@/lib/core/samapta";
import { samaptaParticipantInput, samaptaPosInput, samaptaStatusInput, samaptaTestInput } from "@/lib/core/samapta-input";
import { failure, formObject, mutate, parse, success } from "@/lib/server/mutate";
import { requireActor } from "@/lib/server/session";

export async function simpanTesSamapta(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let createdId = "";
  try {
    const input = parse(samaptaTestInput, formObject(formData));
    const result = await mutate(actor, {
      formData,
      action: "simpanTesSamapta",
      fingerprint: input,
      tables: SAMAPTA_TABLES,
      apply: (t, ctx) => saveSamaptaTest(t, input, ctx, actor),
    });
    if (input.tes_id) {
      refresh();
      return success(result.outcome.message);
    }
    createdId = result.outcome.entityId;
  } catch (error) {
    return failure(error);
  }
  redirect(`/samapta/${createdId}`);
}

export async function ubahStatusTesSamapta(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = parse(samaptaStatusInput, formObject(formData));
    const result = await mutate(actor, {
      formData,
      action: "ubahStatusTesSamapta",
      fingerprint: input,
      tables: SAMAPTA_TABLES,
      apply: (t, ctx) => setSamaptaStatus(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

export async function tambahPesertaSamapta(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = parse(samaptaParticipantInput, formObject(formData));
    const result = await mutate(actor, {
      formData,
      action: "tambahPesertaSamapta",
      fingerprint: input,
      tables: SAMAPTA_TABLES,
      apply: (t, ctx) => addSamaptaParticipant(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

/** Menyimpan isian satu pos untuk satu siswa (dipanggil per baris di halaman "Isi per pos"). */
export async function simpanPosSamapta(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = parse(samaptaPosInput, formObject(formData));
    const result = await mutate(actor, {
      formData,
      action: "simpanPosSamapta",
      fingerprint: input,
      tables: SAMAPTA_TABLES,
      apply: (t, ctx) => saveSamaptaPos(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}
