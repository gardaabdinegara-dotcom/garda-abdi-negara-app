import "server-only";
import { canViewFinance } from "../core/permissions";
import type { Actor } from "../core/types";
import { getActor } from "./session";

/** Pengguna yang boleh mengunduh laporan keuangan, atau null (route handler membalas 403). */
export async function financeRouteActor(): Promise<Actor | null> {
  const actor = await getActor();
  if (!actor || actor.user.wajib_ganti_password || !canViewFinance(actor)) return null;
  return actor;
}

export const forbidden = () => new Response("Tidak diizinkan.", { status: 403, headers: { "Cache-Control": "no-store" } });

export const download = (body: BodyInit, type: string, filename: string) =>
  new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]+/g, "-")}"`,
      "Cache-Control": "no-store",
    },
  });
