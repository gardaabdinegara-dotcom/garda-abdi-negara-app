import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KerjakanLatihan } from "@/components/latihan-kerja";
import { Wordmark } from "@/components/shell";
import { isDurasi, isJenis, JENIS_INFO } from "@/lib/core/latihan";
import { linkedStudentIds } from "@/lib/core/types";
import { canSeeAllLatihan } from "@/lib/server/latihan";
import { requireActor } from "@/lib/server/session";

type Params = Promise<{ jenis: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { jenis } = await params;
  return { title: isJenis(jenis) ? `Latihan ${JENIS_INFO[jenis].nama}` : "Latihan" };
}

/**
 * Layar mengerjakan satu latihan. Siswa: hasil disimpan. Owner/admin: mode coba, hasil tidak disimpan.
 * ?durasi= singkat | standar | asli (bawaan standar).
 */
export default async function KerjakanPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const actor = await requireActor();
  const coba = canSeeAllLatihan(actor);
  if (!coba && actor.user.peran !== "SISWA") notFound();
  const { jenis } = await params;
  if (!isJenis(jenis)) notFound();
  const raw = (await searchParams).durasi;
  const pilihan = Array.isArray(raw) ? raw[0] : raw;
  const durasi = isDurasi(pilihan) ? pilihan : "standar";
  const siswaId = coba ? "" : (linkedStudentIds(actor, "SISWA")[0] ?? "");

  if (!coba && !siswaId) {
    return (
      <div className="standalone">
        <Wordmark />
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Akun belum ditautkan</h2>
              <p>Akun ini belum ditautkan ke data siswa, jadi hasil latihan belum bisa disimpan. Hubungi admin.</p>
            </div>
          </div>
          <div className="form-actions">
            <Link href="/latihan" className="btn">
              Ke menu latihan
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return <KerjakanLatihan jenis={jenis} durasiAwal={durasi} coba={coba} pemilik={siswaId} kembali={coba ? "/latihan/coba" : "/latihan"} />;
}
