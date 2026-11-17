import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { jenisAwal, ProgresLatihanView } from "@/components/latihan-progres";
import { linkedStudentIds } from "@/lib/core/types";
import { canSeeAllLatihan, loadProgresSiswa } from "@/lib/server/latihan";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Progres latihan siswa" };

type Params = Promise<{ siswaId: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/** Progres latihan satu siswa untuk owner/admin (dari rekap /latihan atau profil siswa). */
export default async function ProgresSiswaPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const actor = await requireActor();
  const siswaId = decodeURIComponent((await params).siswaId);
  if (!canSeeAllLatihan(actor)) {
    // Siswa yang membuka tautan dirinya sendiri diarahkan ke "Progres saya".
    if (actor.user.peran === "SISWA" && linkedStudentIds(actor, "SISWA").includes(siswaId)) redirect("/latihan/progres");
    notFound();
  }
  const progres = await loadProgresSiswa(actor, siswaId);
  const { jenis } = await searchParams;
  return (
    <ProgresLatihanView
      progres={progres}
      jenis={jenisAwal(progres, jenis)}
      basePath={`/latihan/siswa/${encodeURIComponent(progres.student.siswa_id)}`}
      pemilik
    />
  );
}
