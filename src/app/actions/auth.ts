"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { attemptLogin } from "@/lib/auth/login";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { quickLoginAllowed } from "@/lib/auth/quick-login";
import { changeOwnPassword } from "@/lib/core/domain";
import { pinProblem, setFirstPin } from "@/lib/core/pin";
import { pinSetupTarget } from "@/lib/server/pin";
import { canViewFinance } from "@/lib/core/permissions";
import { toUser } from "@/lib/core/types";
import { passwordProblem } from "@/lib/core/validation";
import { runOperation } from "@/lib/data/coordinator";
import { AppError } from "@/lib/data/types";
import { deps } from "@/lib/deps";
import { failure } from "@/lib/server/mutate";
import { clientIp, endSession, requireActor, safeNext, startSession } from "@/lib/server/session";

export async function masuk(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let target = "/beranda";
  try {
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    // Siswa yang belum punya PIN cukup mengisi username, lalu diarahkan membuat PIN.
    // (redirect dipanggil di luar try karena Next melemparkan galat khusus untuk pengalihan.)
    if (!password && (await pinSetupTarget(username))) {
      const next = safeNext(formData.get("lanjut"));
      target = `/buat-pin?akun=${encodeURIComponent(username.toLowerCase())}${next ? `&lanjut=${encodeURIComponent(next)}` : ""}`;
    } else {
      const user = await attemptLogin(deps(), { username, password, ip: await clientIp() });
      await startSession(user);
      if (user.wajib_ganti_password) target = "/ganti-password";
      else target = safeNext(formData.get("lanjut")) ?? target;
    }
  } catch (error) {
    return failure(error);
  }
  redirect(target);
}

/** Masuk tanpa password, khusus uji coba lokal (lihat quickLoginAllowed). */
export async function masukCepat(formData: FormData): Promise<void> {
  if (!quickLoginAllowed()) redirect("/masuk");
  const userId = String(formData.get("user_id") ?? "");
  const tables = await deps().store.read("inti", ["Pengguna"]);
  const user = (tables.Pengguna ?? []).map(toUser).find((u) => u.user_id === userId && u.aktif);
  if (!user) redirect("/masuk");
  await startSession(user);
  redirect(user.wajib_ganti_password ? "/ganti-password" : (safeNext(formData.get("lanjut")) ?? "/beranda"));
}

/** Siswa membuat PIN pertama (atau setelah direset admin), lalu langsung masuk. */
export async function buatPin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let target = "/beranda";
  try {
    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    const pin = String(formData.get("pin") ?? "");
    const repeat = String(formData.get("pin_ulang") ?? "");
    const problem = pinProblem(pin);
    if (problem) return { ok: false, message: problem, errors: { pin: problem }, at: Date.now() };
    if (pin !== repeat) return { ok: false, message: "Ulangi PIN tidak sama.", errors: { pin_ulang: "Tidak sama dengan PIN." }, at: Date.now() };
    if (!(await pinSetupTarget(username))) throw new AppError("PIN akun ini sudah dibuat. Masuk dengan PIN, atau minta admin mereset PIN.", "PIN_EXISTS", 409);
    const pinHash = await hashPassword(pin);
    const result = await runOperation<{ user_id: string; versi: number }>(deps(), {
      sheet: "inti",
      operationId: String(formData.get("operation_id") ?? randomUUID()),
      actorId: `PIN:${username}`,
      action: "buatPin",
      fingerprint: { username },
      tables: ["Pengguna"],
      apply: (t, ctx) => setFirstPin(t, username, pinHash, ctx),
    });
    const data = result.outcome.data;
    if (!data) throw new AppError("PIN sudah dibuat sebelumnya. Silakan masuk dengan PIN.", "REPLAYED", 409);
    await startSession({ user_id: data.user_id, versi_otorisasi: data.versi });
    target = safeNext(formData.get("lanjut")) ?? target;
  } catch (error) {
    return failure(error);
  }
  redirect(target);
}

export async function keluar(): Promise<void> {
  await endSession();
  redirect("/masuk");
}

export async function gantiPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor({ allowPasswordChange: true });
  try {
    const current = String(formData.get("password_lama") ?? "");
    const next = String(formData.get("password_baru") ?? "");
    const repeat = String(formData.get("password_ulang") ?? "");
    // Siswa memakai PIN 6 angka; peran lain memakai password.
    const word = actor.user.peran === "SISWA" ? "PIN" : "Password";
    if (!(await verifyPassword(current, actor.user.password_hash))) {
      return { ok: false, message: `${word} saat ini salah.`, errors: { password_lama: `${word} saat ini salah.` }, at: Date.now() };
    }
    const problem = actor.user.peran === "SISWA" ? pinProblem(next) : passwordProblem(next, actor.user.username, canViewFinance(actor) || actor.user.peran === "OWNER");
    if (problem) return { ok: false, message: problem, errors: { password_baru: problem }, at: Date.now() };
    if (next !== repeat) return { ok: false, message: `Ulangi ${word} tidak sama.`, errors: { password_ulang: `Tidak sama dengan ${word} baru.` }, at: Date.now() };
    if (next === current) return { ok: false, message: `${word} baru harus berbeda.`, errors: { password_baru: "Harus berbeda dari yang sekarang." }, at: Date.now() };
    const passwordHash = await hashPassword(next);
    const result = await runOperation<{ versi: number }>(deps(), {
      sheet: "inti",
      operationId: String(formData.get("operation_id") ?? randomUUID()),
      actorId: actor.user.user_id,
      action: "gantiPassword",
      fingerprint: { user_id: actor.user.user_id },
      tables: ["Pengguna"],
      apply: (t, ctx) => changeOwnPassword(t, passwordHash, ctx, actor),
    });
    const versi = result.outcome.data?.versi;
    if (typeof versi !== "number") throw new AppError("Password sudah diganti sebelumnya. Silakan masuk ulang.", "REPLAYED", 409);
    // Sesi lain ikut berakhir; sesi di perangkat ini diterbitkan ulang dengan versi baru.
    await startSession({ user_id: actor.user.user_id, versi_otorisasi: versi });
  } catch (error) {
    return failure(error);
  }
  redirect("/beranda?password=diganti");
}
