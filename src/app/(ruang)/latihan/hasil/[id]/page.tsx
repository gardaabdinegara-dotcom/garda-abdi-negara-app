import type { Metadata } from "next";
import Link from "next/link";
import { LatihanHasil, waktuLatihan } from "@/components/latihan-hasil";
import { PageHead } from "@/components/ui";
import { DURASI_LABEL, JENIS_INFO } from "@/lib/core/latihan";
import { lamaTeks } from "@/lib/core/latihan-soal";
import { canSeeAllLatihan, loadHasilLatihan } from "@/lib/server/latihan";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Hasil latihan" };

const urai = (v: string) => {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

/** Hasil satu latihan. Siswa melihat miliknya; owner/admin melihat hasil siswa mana pun. */
export default async function HasilLatihanPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const { latihan, student, sebelumnya, milikSaya } = await loadHasilLatihan(actor, urai(id));
  const staf = !milikSaya && canSeeAllLatihan(actor);
  const info = JENIS_INFO[latihan.jenis];
  const siswaHref = `/latihan/siswa/${encodeURIComponent(student.siswa_id)}`;
  const keterangan = [waktuLatihan(latihan.mulai), DURASI_LABEL[latihan.durasi], `${latihan.seri.length} ${info.bagian}`, lamaTeks(latihan.detik)].filter(Boolean).join(" · ");

  return (
    <div className="page lt-page">
      <PageHead
        back={staf ? { href: siswaHref, label: `Progres ${student.nama}` } : { href: "/latihan", label: "Latihan" }}
        eyebrow={staf ? `${student.nama} · ${student.kode_siswa}` : "Hasil latihan"}
        title={`Hasil ${info.nama}`}
        description={keterangan}
      />
      <LatihanHasil
        data={latihan}
        sebelumnya={sebelumnya}
        aksi={
          staf ? (
            <>
              <Link className="btn" href={`${siswaHref}?jenis=${latihan.jenis}`}>
                Progres {student.nama.trim().split(/\s+/)[0]}
              </Link>
              <Link className="btn btn-secondary" href="/latihan">
                Rekap latihan
              </Link>
            </>
          ) : (
            <>
              <Link className="btn" href={`/kerjakan/${latihan.jenis}?durasi=${latihan.durasi}`}>
                Latihan lagi
              </Link>
              <Link className="btn btn-secondary" href={`/latihan/progres?jenis=${latihan.jenis}`}>
                Lihat progres
              </Link>
            </>
          )
        }
      />
    </div>
  );
}
