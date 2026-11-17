import "server-only";
import { ZodError, type ZodType } from "zod";
import type { ActionState } from "../action-state";
import type { Actor } from "../core/types";
import { fieldErrors } from "../core/validation";
import { runOperation, type OperationContext, type OperationOutcome } from "../data/coordinator";
import type { SpreadsheetKey } from "../data/schema";
import { AppError, type Tables } from "../data/types";
import { dataDeps } from "./data";

export function operationIdFrom(formData: FormData): string {
  return String(formData.get("operation_id") ?? "");
}

/** Mengubah FormData menjadi objek teks biasa (checkbox "on" → true). */
export function formObject(formData: FormData, booleans: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION") || key === "operation_id") continue;
    out[key] = typeof value === "string" ? value : "";
  }
  for (const key of booleans) out[key] = formData.get(key) === "on" || formData.get(key) === "true";
  return out;
}

export function parse<T>(schema: ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

/** Menjalankan perintah domain di dalam koordinator penyimpanan atas nama pengguna yang masuk. */
export async function mutate<T>(
  actor: Actor,
  options: {
    formData: FormData;
    action: string;
    fingerprint: unknown;
    tables: readonly string[];
    sheet?: SpreadsheetKey;
    apply: (tables: Tables, ctx: OperationContext) => OperationOutcome<T>;
  },
) {
  return runOperation<T>(await dataDeps(), {
    sheet: options.sheet ?? "inti",
    operationId: operationIdFrom(options.formData),
    actorId: actor.user.user_id,
    action: options.action,
    fingerprint: options.fingerprint,
    tables: options.tables,
    apply: options.apply,
  });
}

/** Menerjemahkan kesalahan menjadi pesan form. Kesalahan tak terduga dicatat di log server saja. */
export function failure(error: unknown): ActionState {
  if (error instanceof ZodError) {
    return { ok: false, message: "Periksa kembali isian yang ditandai.", errors: fieldErrors(error), at: Date.now() };
  }
  if (error instanceof AppError) return { ok: false, message: error.message, at: Date.now() };
  console.error(error);
  return { ok: false, message: "Terjadi kesalahan pada server. Coba lagi beberapa saat.", at: Date.now() };
}

export const success = (message: string, extra: Partial<ActionState> = {}): ActionState => ({ ok: true, message, at: Date.now(), ...extra });
