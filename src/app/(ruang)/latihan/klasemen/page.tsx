import type { Metadata } from "next";
import { KlasemenView, tabKlasemen } from "@/components/latihan-klasemen";
import { loadKlasemen } from "@/lib/server/latihan";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Klasemen latihan" };

type Search = Promise<Record<string, string | string[] | undefined>>;

/** Klasemen latihan minggu berjalan. Siswa melihat posisi, tingkat, dan lencananya; owner/admin melihat semua. */
export default async function KlasemenPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor();
  const [data, { jenis }] = await Promise.all([loadKlasemen(actor), searchParams]);
  return <KlasemenView data={data} tab={tabKlasemen(jenis)} />;
}
