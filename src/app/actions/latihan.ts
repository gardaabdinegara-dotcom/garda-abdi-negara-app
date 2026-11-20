"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { latihanInput } from "@/lib/core/latihan-input";
import { LATIHAN_TABLES, saveLatihan } from "@/lib/core/latihan-simpan";
import { simpanTargetLatihan, type TargetInput } from "@/lib/core/latihan-target";
import { failure, formObject, mutate, parse, success } from "@/lib/server/mutate";
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

/**
 * Owner/admin memasang, mengubah, atau menghapus target latihan mingguan (satu target untuk semua siswa aktif).
 * Tombol "Hapus target" mengirim hapus=1.
 */
export async function aturTargetLatihan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor({ roles: ["OWNER", "ADMIN"] });
  try {
    const raw = formObject(formData);
    const input: TargetInput = {
      jenis: String(raw.jenis ?? ""),
      durasi: String(raw.durasi ?? ""),
      kali: String(raw.kali ?? ""),
      hapus: formData.get("hapus") === "1",
    };
    const result = await mutate(actor, {
      formData,
      action: "aturTargetLatihan",
      fingerprint: input,
      tables: ["Pengaturan"],
      apply: (t, ctx) => simpanTargetLatihan(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}
