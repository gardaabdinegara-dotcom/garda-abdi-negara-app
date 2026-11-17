import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { simpanKesehatan } from "@/app/actions/akademik";
import { AcademicTabs, fmtNumber, requirePart } from "@/components/akademik";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { Badge, Empty, PageHead } from "@/components/ui";
import type { Health } from "@/lib/core/akademik";
import { formatDate } from "@/lib/format";
import { loadHealth } from "@/lib/server/akademik";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Kesehatan" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const bmi = (h: Health) => (h.tinggi_cm && h.berat_kg ? h.berat_kg / (h.tinggi_cm / 100) ** 2 : null);
const pressure = (h: Health) => (h.sistolik !== null ? `${h.sistolik}/${h.diastolik}` : "-");

export default async function HealthPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor();
  requirePart(actor, "kesehatan");
  const params = await searchParams;
  const data = await loadHealth(actor, params.siswa);
  const selected = data.selected;

  return (
    <div className="page">
      <PageHead eyebrow="Akademik" title="Kesehatan" description="Tinggi, berat, IMT, dan tekanan darah. Pengukuran terakhir di bulan itu masuk ke rapor." />
      <AcademicTabs actor={actor} current="kesehatan" />
      <section className="card">
        <form method="get" className="filters" aria-label="Saring data kesehatan">
          <div className="field">
            <label htmlFor="siswa">Siswa</label>
            <select id="siswa" name="siswa" defaultValue={selected?.siswa_id ?? ""}>
              <option value="">Semua siswa</option>
              {data.students.map((s) => (
                <option key={s.siswa_id} value={s.siswa_id}>
                  {s.nama} ({s.kode_siswa})
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-secondary">
            Tampilkan
          </button>
        </form>
      </section>

      {!selected ? (
        <section className="card">
          <div className="card-head">
            <h2>Pengukuran terakhir</h2>
          </div>
          {data.students.length === 0 ? (
            <Empty title="Belum ada siswa" />
          ) : (
            <div className="table-wrap">
              <table className="data responsive">
                <thead>
                  <tr>
                    <th>Siswa</th>
                    <th>Tanggal</th>
                    <th>Tinggi</th>
                    <th>Berat</th>
                    <th>IMT</th>
                    <th>Tekanan darah</th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((s) => {
                    const h = data.latest.get(s.siswa_id);
                    return (
                      <tr key={s.siswa_id}>
                        <td data-label="">
                          <Link className="cell-title" href={`/akademik/kesehatan?siswa=${s.siswa_id}`}>
                            {s.nama}
                          </Link>
                          <span className="cell-sub mono">{s.kode_siswa}</span>
                        </td>
                        <td data-label="Tanggal">{h ? formatDate(h.tanggal) : "-"}</td>
                        <td data-label="Tinggi">{h?.tinggi_cm ? `${fmtNumber(h.tinggi_cm)} cm` : "-"}</td>
                        <td data-label="Berat">{h?.berat_kg ? `${fmtNumber(h.berat_kg)} kg` : "-"}</td>
                        <td data-label="IMT">{h ? fmtNumber(bmi(h)) : "-"}</td>
                        <td data-label="Tekanan darah">{h ? pressure(h) : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <div className="grid-main">
          <section className="card">
            <div className="card-head">
              <div>
                <h2>{selected.nama}</h2>
                <p>Riwayat pengukuran</p>
              </div>
              <Badge>{data.measurements.length}</Badge>
            </div>
            {data.measurements.length === 0 ? (
              <Empty title="Belum ada pengukuran" />
            ) : (
              <div className="item-list">
                {data.measurements.map((h) => (
                  <div className="item" key={h.ukur_id}>
                    <div className="item-main">
                      <b>{formatDate(h.tanggal, "long")}</b>
                      <span className="cell-sub">
                        TB {h.tinggi_cm ? `${fmtNumber(h.tinggi_cm)} cm` : "-"} · BB {h.berat_kg ? `${fmtNumber(h.berat_kg)} kg` : "-"} · IMT {fmtNumber(bmi(h))} · TD {pressure(h)}
                        {h.catatan ? ` · ${h.catatan}` : ""}
                      </span>
                    </div>
                    <span className="cell-sub">{h.pemeriksa}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Catat pengukuran</h2>
                <p>Isi yang diukur saja. Tekanan darah diisi berpasangan.</p>
              </div>
            </div>
            <ActionForm action={simpanKesehatan} operationId={randomUUID()} resetOnSuccess className="stack">
              <input type="hidden" name="siswa_id" value={selected.siswa_id} />
              <div className="form-grid two">
                <Field label="Tanggal ukur" name="tanggal" type="date" defaultValue={data.clock.today} required className="span-all" />
                <Field label="Tinggi badan (cm)" name="tinggi_cm" type="number" min={50} max={250} />
                <Field label="Berat badan (kg)" name="berat_kg" type="number" min={5} max={300} />
                <Field label="Sistolik (mmHg)" name="sistolik" type="number" min={40} max={260} />
                <Field label="Diastolik (mmHg)" name="diastolik" type="number" min={20} max={160} />
                <Field label="Catatan pemeriksa" name="catatan" type="textarea" className="span-all" />
              </div>
              <div className="form-actions">
                <SubmitButton>Simpan pengukuran</SubmitButton>
              </div>
            </ActionForm>
          </section>
        </div>
      )}
    </div>
  );
}
