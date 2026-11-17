"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { latihanInput } from "@/lib/core/latihan-input";
import { LATIHAN_TABLES, saveLatihan } from "@/lib/core/latihan-simpan";
import { failure, formObject, mutate, parse } from "@/lib/server/mutate";
import { requireActor } from "@/lib/server/session";

/**
 * Menyimpan hasil satu latihan (dipanggil layar latihan setelah waktu habis). Skor dihitung ulang di server.
 * Kirim ulang dengan operation_id yang sama aman: hasil tidak tersimpan dua kali.
 * Berhasil: pindah ke halaman hasil.
 */
export async function simpanLatihan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let id = "";
  try {
    const input = parse(latihanInput, formObject(formData));
    const result = await mutate(actor, {
      formData,
      action: "simpanLatihan",
      fingerprint: input,
      tables: LATIHAN_TABLES,
      apply: (t, ctx) => saveLatihan(t, input, ctx, actor),
    });
    id = result.outcome.entityId;
  } catch (error) {
    return failure(error);
  }
  redirect(`/latihan/hasil/${encodeURIComponent(id)}`);
}
