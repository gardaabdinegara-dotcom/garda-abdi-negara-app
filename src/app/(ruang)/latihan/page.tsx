import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MenuLatihan } from "@/components/latihan-menu";
import { RekapLatihanView } from "@/components/latihan-rekap";
import { bacaPilihanRekap } from "@/lib/latihan-rekap-route";
import { canSeeAllLatihan, loadLatihanSaya, loadRekapLatihan } from "@/lib/server/latihan";
import { getActor, requireActor } from "@/lib/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const actor = await getActor();
  return { title: actor && canSeeAllLatihan(actor) ? "Latihan siswa" : "Latihan" };
}

/** Owner/admin: rekap latihan semua siswa. Siswa: menu empat jenis latihan. */
export default async function LatihanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireActor();
  if (canSeeAllLatihan(actor)) {
    const pilihan = bacaPilihanRekap(await searchParams);
    const rekap = await loadRekapLatihan(actor, pilihan, pilihan.siswa ?? undefined);
    return <RekapLatihanView rekap={rekap} pilihan={pilihan} />;
  }
  if (actor.user.peran !== "SISWA") notFound();
  return <MenuLatihan progres={await loadLatihanSaya(actor)} coba={false} />;
}
