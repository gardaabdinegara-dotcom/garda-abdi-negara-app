"use server";

import { refresh } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { runOperation } from "@/lib/data/coordinator";
import { buildCommand } from "@/lib/keuangan/form-commands";
import { applyFinanceCommand, CORE_TABLES, FINANCE_TABLES } from "@/lib/keuangan/sumber";
import { failure, operationIdFrom, success } from "@/lib/server/mutate";
import { requireActor } from "@/lib/server/session";
import { dataDeps } from "@/lib/server/data";

/**
 * Satu pintu untuk semua perintah keuangan. Field "aksi" menentukan perintahnya; hak akses
 * (lihat/catat/pemilik) dan aturan bisnis diperiksa di server di dalam gerbang spreadsheet Keuangan.
 */
export async function jalankanKeuangan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const command = buildCommand(formData);
    // Data inti (siswa, program, pendaftaran) hanya dibaca; tidak ikut ditulis.
    const source = await dataDeps();
    const inti = await source.store.read("inti", CORE_TABLES, { fresh: true });
    const result = await runOperation(source, {
      sheet: "keuangan",
      operationId: operationIdFrom(formData),
      actorId: actor.user.user_id,
      action: command.action,
      fingerprint: command,
      tables: FINANCE_TABLES,
      apply: (t, ctx) => applyFinanceCommand(inti, t, command, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}
