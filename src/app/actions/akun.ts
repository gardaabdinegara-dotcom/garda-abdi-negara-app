"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { hashPassword, temporaryPassword } from "@/lib/auth/password";
import { addLink, createUser, deleteUser, removeLink, resetPassword, revokeSessions, updateUser } from "@/lib/core/domain";
import { FITUR } from "@/lib/core/fitur";
import { AppError } from "@/lib/data/types";
import { resetPin } from "@/lib/core/pin";
import { linkInput, userCreateInput, userUpdateInput } from "@/lib/core/validation";
import { failure, formObject, mutate, parse, success } from "@/lib/server/mutate";
import { endSession, requireActor } from "@/lib/server/session";

export async function buatAkun(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = parse(userCreateInput, formObject(formData));
    // Peran Admin, Pengajar, dan Wali sedang disembunyikan (lib/core/fitur.ts).
    if (!FITUR.peranTambahan && input.peran !== "OWNER") {
      throw new AppError("Peran ini sedang tidak dipakai. Akun siswa dibuat otomatis dari menu Siswa.");
    }
    const password = temporaryPassword();
    const passwordHash = await hashPassword(password);
    const result = await mutate(actor, {
      formData,
      action: "buatAkun",
      fingerprint: input,
      tables: ["Pengguna"],
      apply: (t, ctx) => createUser(t, input, passwordHash, ctx, actor),
    });
    refresh();
    if (result.replayed) {
      return success("Akun ini sudah dibuat sebelumnya. Buat password sementara baru dari halaman akunnya bila perlu.");
    }
    return success(`${result.outcome.message} Berikan password sementara di bawah kepada pemilik akun.`, {
      secret: `${input.username} · ${password}`,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function ubahAkun(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = parse(userUpdateInput, formObject(formData, ["aktif"]));
    const result = await mutate(actor, {
      formData,
      action: "ubahAkun",
      fingerprint: input,
      tables: ["Pengguna"],
      apply: (t, ctx) => updateUser(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

export async function buatPasswordSementara(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const userId = String(formData.get("user_id") ?? "");
    const password = temporaryPassword();
    const passwordHash = await hashPassword(password);
    const result = await mutate(actor, {
      formData,
      action: "buatPasswordSementara",
      fingerprint: { userId },
      tables: ["Pengguna"],
      apply: (t, ctx) => resetPassword(t, userId, passwordHash, ctx, actor),
    });
    refresh();
    if (result.replayed) return success("Password sementara sudah dibuat sebelumnya. Tekan tombol lagi untuk membuat yang baru.");
    return success(`${result.outcome.message} Akun wajib menggantinya saat masuk.`, { secret: password });
  } catch (error) {
    return failure(error);
  }
}

/** Owner mereset PIN siswa yang lupa; siswa membuat PIN baru saat masuk berikutnya. */
export async function resetPinSiswa(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const userId = String(formData.get("user_id") ?? "");
    const result = await mutate(actor, {
      formData,
      action: "resetPin",
      fingerprint: { userId },
      tables: ["Pengguna"],
      apply: (t, ctx) => resetPin(t, userId, ctx, actor),
    });
    refresh();
    return success(result.replayed ? "PIN sudah direset sebelumnya." : result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

export async function cabutSesi(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const userId = String(formData.get("user_id") ?? "");
  try {
    const result = await mutate(actor, {
      formData,
      action: "cabutSesi",
      fingerprint: { userId },
      tables: ["Pengguna"],
      apply: (t, ctx) => revokeSessions(t, userId, ctx, actor),
    });
    if (userId !== actor.user.user_id) {
      refresh();
      return success(result.outcome.message);
    }
  } catch (error) {
    return failure(error);
  }
  // Mencabut sesi sendiri berarti perangkat ini juga keluar.
  await endSession();
  redirect("/masuk");
}

export async function tambahTautan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = parse(linkInput, formObject(formData));
    const result = await mutate(actor, {
      formData,
      action: "tambahTautan",
      fingerprint: input,
      tables: ["Pengguna", "Tautan_Akun", "Siswa", "Kelas"],
      apply: (t, ctx) => addLink(t, input, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

export async function lepasTautan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const tautanId = String(formData.get("tautan_id") ?? "");
    const result = await mutate(actor, {
      formData,
      action: "lepasTautan",
      fingerprint: { tautanId },
      tables: ["Pengguna", "Tautan_Akun"],
      apply: (t, ctx) => removeLink(t, tautanId, ctx, actor),
    });
    refresh();
    return success(result.outcome.message);
  } catch (error) {
    return failure(error);
  }
}

/** Menghapus akun (bukan akun sendiri, bukan owner terakhir) lalu kembali ke daftar akun. */
export async function hapusAkun(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const userId = String(formData.get("user_id") ?? "");
    await mutate(actor, {
      formData,
      action: "hapusAkun",
      fingerprint: { userId },
      tables: ["Pengguna", "Tautan_Akun"],
      apply: (t, ctx) => deleteUser(t, userId, ctx, actor),
    });
  } catch (error) {
    return failure(error);
  }
  redirect("/pengaturan/akun");
}
