import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MenuLatihan } from "@/components/latihan-menu";
import { RekapLatihanView } from "@/components/latihan-rekap";
import { canSeeAllLatihan, loadLatihanSaya, loadRekapLatihan } from "@/lib/server/latihan";
import { getActor, requireActor } from "@/lib/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const actor = await getActor();
  return { title: actor && canSeeAllLatihan(actor) ? "Latihan siswa" : "Latihan" };
}

/** Owner/admin: rekap latihan semua siswa. Siswa: menu empat jenis latihan. */
export default async function LatihanPage() {
  const actor = await requireActor();
  if (canSeeAllLatihan(actor)) return <RekapLatihanView rekap={await loadRekapLatihan(actor)} />;
  if (actor.user.peran !== "SISWA") notFound();
  return <MenuLatihan progres={await loadLatihanSaya(actor)} coba={false} />;
}
