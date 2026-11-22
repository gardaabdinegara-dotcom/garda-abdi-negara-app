import type { Metadata } from "next";
import Link from "next/link";
import { PengumumanKartu } from "@/components/pengumuman";
import { TulisPengumuman } from "@/components/pengumuman-tulis";
import { Empty, Notice, PageHead } from "@/components/ui";
import { loadPengumumanOwner } from "@/lib/server/pengumuman";
import { requireActor } from "@/lib/server/session";
import { zonaLembaga } from "@/lib/server/zona";

export const metadata: Metadata = { title: "Pengumuman" };

type Search = Promise<Record<string, string | string[] | undefined>>;

/** Pengumuman dari pelatih (owner/admin): tulis, ubah, hapus, dan kirim ke grup WhatsApp. */
export default async function PengumumanPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor({ roles: ["OWNER", "ADMIN"] });
  const tab = (await searchParams).tab === "lewat" ? "lewat" : "tampil";
  const [data, zona] = await Promise.all([loadPengumumanOwner(actor), zonaLembaga()]);
  const list = tab === "lewat" ? data.lewat : data.tampil;

  return (
    <div className="page">
      <PageHead eyebrow="Lainnya" title="Pengumuman" description="Tampil di beranda siswa sampai tanggal yang Anda pilih, lalu hilang sendiri." />
      {!data.siap ? (
        <Notice tone="warning">Tab Pengumuman belum ada di spreadsheet. Jalankan setup spreadsheet terlebih dahulu.</Notice>
      ) : (
        <>
          <TulisPengumuman today={data.today} />
          <nav className="png-seg" aria-label="Saring pengumuman">
            <Link href="/pengumuman" aria-current={tab === "tampil" ? "page" : undefined}>
              Sedang tampil · {data.tampil.length}
            </Link>
            <Link href="/pengumuman?tab=lewat" aria-current={tab === "lewat" ? "page" : undefined}>
              Sudah lewat · {data.lewat.length}
            </Link>
          </nav>
          {list.length === 0 ? (
            <section className="card">
              <Empty title={tab === "tampil" ? "Belum ada pengumuman yang tampil" : "Belum ada pengumuman yang lewat"}>
                {tab === "tampil" ? "Tulis info jadwal, tes, atau perubahan sesi. Siswa melihatnya di beranda." : "Pengumuman yang sudah melewati tanggal tampilnya muncul di sini."}
              </Empty>
            </section>
          ) : (
            <div className="png-daftar">
              {list.map((p) => (
                <PengumumanKartu key={p.pengumuman_id} p={p} today={data.today} zona={zona} lewat={tab === "lewat"} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
