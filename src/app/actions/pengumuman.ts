"use server";

import { refresh } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { hapusPengumuman, hariIniLembaga, pengumumanInput, simpanPengumuman } from "@/lib/core/pengumuman";
import { failure, formObject, mutate, parse, success } from "@/lib/server/mutate";
import { requireActor } from "@/lib/server/session";

/** Pengumuman baru atau ubah pengumuman (owner/admin). */
export async function simpanPengumumanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor({ roles: ["OWNER", "ADMIN"] });
  try {
    const input = parse(pengumumanInput, formObject(formData, ["disematkan"]));
    const result = await mutate(actor, {
      formData,
      action: "simpanPengumuman",
      fingerprint: input,
      tables: ["Pengaturan", "Pengumuman"],
      apply: (t, ctx) => simpanPengumuman(t, input, hariIniLembaga(t, ctx.now), ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

/** Menghapus pengumuman dari beranda siswa (status DIHAPUS, baris tetap tersimpan). */
export async function hapusPengumumanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor({ roles: ["OWNER", "ADMIN"] });
  try {
    const pengumumanId = String(formData.get("pengumuman_id") ?? "");
    const result = await mutate(actor, {
      formData,
      action: "hapusPengumuman",
      fingerprint: { pengumumanId },
      tables: ["Pengumuman"],
      apply: (t, ctx) => hapusPengumuman(t, pengumumanId, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}
