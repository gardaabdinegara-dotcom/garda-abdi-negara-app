import type { Metadata } from "next";
import Link from "next/link";
import { AcademicTabs, requirePart } from "@/components/akademik";
import { monthLabel } from "@/components/report-document";
import { Badge, Empty, PageHead } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { loadReportList } from "@/lib/server/akademik";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Rapor" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function ReportsPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor();
  requirePart(actor, "rapor");
  const params = await searchParams;
  const data = await loadReportList(actor, params.periode);

  if (data.kind === "family") {
    return (
      <div className="page">
        <PageHead eyebrow="Akademik" title="Rapor" description="Rapor bulanan yang sudah diterbitkan lembaga." />
        <AcademicTabs actor={actor} current="rapor" />
        {data.family.length === 0 ? <Empty title="Belum tertaut">Minta admin menautkan data siswa ke akun Anda.</Empty> : null}
        {data.family.map(({ student, published }) => (
          <section className="card" key={student.siswa_id}>
            <div className="card-head">
              <div>
                <h2>{student.nama}</h2>
                <p className="mono">{student.kode_siswa}</p>
              </div>
            </div>
            {published.length === 0 ? (
              <Empty title="Belum ada rapor terbit" />
            ) : (
              <div className="item-list">
                {published.map((r) => (
                  <div className="item" key={r.rapor_id}>
                    <div className="item-main">
                      <Link className="cell-title" href={`/akademik/rapor/${student.siswa_id}?periode=${r.periode}`}>
                        {monthLabel(r.periode)}
                      </Link>
                      <span className="cell-sub">Diterbitkan {formatDate(r.diterbitkan_pada.slice(0, 10), "long")}</span>
                    </div>
                    <Badge tone="success">Versi {r.versi}</Badge>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHead eyebrow="Akademik" title="Rapor" description="Rapor bulanan tujuh bagian. Owner/admin menerbitkan; rapor terbit dibekukan dan revisi menjadi versi baru." />
      <AcademicTabs actor={actor} current="rapor" />
      <section className="card">
        <form method="get" className="filters" aria-label="Pilih bulan">
          <div className="field">
            <label htmlFor="periode">Bulan</label>
            <input id="periode" type="month" name="periode" defaultValue={data.periode} />
          </div>
          <button type="submit" className="btn btn-secondary">
            Tampilkan
          </button>
        </form>
      </section>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>{monthLabel(data.periode)}</h2>
            <p>
              {data.rows.filter((r) => r.published).length} dari {data.rows.length} siswa sudah punya rapor terbit
            </p>
          </div>
        </div>
        {data.rows.length === 0 ? (
          <Empty title="Belum ada siswa" />
        ) : (
          <div className="table-wrap">
            <table className="data responsive">
              <thead>
                <tr>
                  <th>Siswa</th>
                  <th>Status</th>
                  <th>Terlihat siswa/wali</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(({ student, current, published }) => (
                  <tr key={student.siswa_id}>
                    <td data-label="">
                      <Link className="cell-title" href={`/akademik/rapor/${student.siswa_id}?periode=${data.periode}`}>
                        {student.nama}
                      </Link>
                      <span className="cell-sub mono">{student.kode_siswa}</span>
                    </td>
                    <td data-label="Status">
                      {!current ? <Badge>Belum dibuat</Badge> : current.status === "TERBIT" ? <Badge tone="success">Terbit v{current.versi}</Badge> : <Badge tone="warning">Draf v{current.versi}</Badge>}
                    </td>
                    <td data-label="Terlihat siswa/wali">{published ? `Versi ${published.versi}` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
