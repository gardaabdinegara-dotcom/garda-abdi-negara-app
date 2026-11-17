import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { jenisAwal, ProgresLatihanView } from "@/components/latihan-progres";
import { Empty, PageHead } from "@/components/ui";
import { canSeeAllLatihan, loadLatihanSaya } from "@/lib/server/latihan";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Progres latihan" };

type Search = Promise<Record<string, string | string[] | undefined>>;

/** "Progres saya": grafik dan riwayat latihan siswa yang masuk. Owner/admin memakai rekap di /latihan. */
export default async function ProgresSayaPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor();
  if (canSeeAllLatihan(actor)) redirect("/latihan");
  if (actor.user.peran !== "SISWA") notFound();
  const progres = await loadLatihanSaya(actor);
  if (!progres) {
    return (
      <div className="page lp-page">
        <PageHead back={{ href: "/latihan", label: "Latihan" }} title="Progres saya" />
        <section className="card lp-card">
          <Empty title="Akun belum tertaut">Minta admin menautkan akun ini ke data siswa kamu.</Empty>
        </section>
      </div>
    );
  }
  const { jenis } = await searchParams;
  return <ProgresLatihanView progres={progres} jenis={jenisAwal(progres, jenis)} basePath="/latihan/progres" pemilik={false} />;
}
