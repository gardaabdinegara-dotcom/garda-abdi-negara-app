import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { ActiveBadge, Badge, Empty, PageHead } from "@/components/ui";
import { canManageStudents } from "@/lib/core/permissions";
import { formatPhone } from "@/lib/format";
import { loadCatalog, loadStudents } from "@/lib/server/queries";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Siswa" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const STATUS = [
  { value: "aktif", label: "Aktif" },
  { value: "nonaktif", label: "Nonaktif" },
  { value: "semua", label: "Semua" },
];

export default async function StudentsPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const status = typeof params.status === "string" && STATUS.some((s) => s.value === params.status) ? params.status : "aktif";
  const [students, catalog] = await Promise.all([loadStudents(actor), loadCatalog()]);
  const programs = new Map(catalog.programs.map((p) => [p.program_id, p.nama_program]));
  const classes = new Map(catalog.classes.map((c) => [c.kelas_id, c.nama_kelas]));
  const needle = q.toLowerCase();
  const digits = q.replace(/\D/g, "");
  const shown = students.filter((s) => {
    if (status === "aktif" && !s.aktif) return false;
    if (status === "nonaktif" && s.aktif) return false;
    if (!needle) return true;
    return (
      s.nama.toLowerCase().includes(needle) ||
      s.kode_siswa.toLowerCase().includes(needle) ||
      (digits.length >= 4 && (s.no_wa.includes(digits.replace(/^0/, "")) || s.no_wa_wali.includes(digits.replace(/^0/, ""))))
    );
  });
  const manage = canManageStudents(actor);

  return (
    <div className="page">
      <PageHead
        eyebrow="Data inti"
        title="Siswa"
        description={manage ? "Semua siswa lembaga beserta program dan kelas aktifnya." : "Siswa yang boleh Anda lihat."}
        actions={
          manage ? (
            <Link href="/siswa/baru" className="btn">
              <Icon name="plus" />
              Tambah siswa
            </Link>
          ) : null
        }
      />
      <section className="card">
        <form method="get" className="filters" role="search">
          <div className="field">
            <label htmlFor="cari">Cari</label>
            <input id="cari" name="q" type="search" defaultValue={q} placeholder="Nama, kode GAN, atau nomor WA" />
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={status}>
              {STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-secondary">
            <Icon name="search" />
            Terapkan
          </button>
        </form>
        <p className="muted">
          {shown.length} dari {students.length} siswa
        </p>
        {shown.length === 0 ? (
          <Empty title={students.length === 0 ? "Belum ada siswa" : "Tidak ada yang cocok"}>
            {students.length === 0 && manage ? "Mulai dengan menambahkan siswa pertama." : "Ubah kata kunci atau filter status."}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data responsive">
              <thead>
                <tr>
                  <th>Siswa</th>
                  <th>Jalur</th>
                  <th>Program · Kelas</th>
                  <th>WA</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => {
                  const open = s.enrollments.filter((e) => e.status === "AKTIF" || e.status === "CUTI");
                  return (
                    <tr key={s.siswa_id}>
                      <td data-label="">
                        <Link href={`/siswa/${s.siswa_id}`} className="cell-title">
                          {s.nama}
                        </Link>
                        <span className="cell-sub mono">{s.kode_siswa}</span>
                      </td>
                      <td data-label="Jalur">{s.jalur_target ? <Badge tone="info">{s.jalur_target}</Badge> : "-"}</td>
                      <td data-label="Program · Kelas">
                        {open.length === 0 ? (
                          <span className="muted">Belum terdaftar</span>
                        ) : (
                          open.map((e) => (
                            <span key={e.pendaftaran_id} className="cell-sub">
                              {programs.get(e.program_id) ?? "?"} · {classes.get(e.kelas_id) ?? "?"}
                              {e.status === "CUTI" ? " (cuti)" : ""}
                            </span>
                          ))
                        )}
                      </td>
                      <td data-label="WA">{formatPhone(s.no_wa)}</td>
                      <td data-label="Status">
                        <ActiveBadge active={s.aktif} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
