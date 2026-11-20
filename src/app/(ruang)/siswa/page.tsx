import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { SiswaDaftar, type SiswaRingkas } from "@/components/siswa-daftar";
import { Notice, PageHead } from "@/components/ui";
import { canManageStudents } from "@/lib/core/permissions";
import { saringDariAlamat } from "@/lib/core/saring-daftar";
import { nomorWa } from "@/lib/core/wa";
import { loadStudents } from "@/lib/server/queries";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Siswa" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function StudentsPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const saring = saringDariAlamat(params);
  const students = await loadStudents(actor);
  const manage = canManageStudents(actor);
  // Hanya data yang dibutuhkan baris daftar yang dikirim ke klien (tanpa catatan dan tanggal lahir).
  const rows: SiswaRingkas[] = students
    .map((s) => ({
      siswa_id: s.siswa_id,
      kode: s.kode_siswa,
      nama: s.nama,
      jalur: s.jalur_target,
      aktif: s.aktif,
      wa: manage ? nomorWa(s.no_wa) : null,
      noWa: manage ? s.no_wa : "",
      noWaWali: manage ? s.no_wa_wali : "",
    }))
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"));

  return (
    <div className="page">
      <PageHead
        eyebrow="Data inti"
        title="Siswa"
        description={manage ? "Ketuk nama untuk membuka profil, atau tombol WA untuk langsung mengirim pesan." : "Siswa yang boleh Anda lihat."}
        actions={
          manage ? (
            <Link href="/siswa/baru" className="btn">
              <Icon name="plus" />
              Tambah siswa
            </Link>
          ) : null
        }
      />
      {params.dihapus ? <Notice tone="success">Siswa dihapus dari aplikasi. Riwayatnya tetap tersimpan di spreadsheet.</Notice> : null}
      <section className="card dr-card">
        <SiswaDaftar students={rows} initialQ={q} initialSaring={saring} kontak={manage} />
      </section>
    </div>
  );
}
