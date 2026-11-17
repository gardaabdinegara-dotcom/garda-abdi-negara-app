import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { arsipkanTes, simpanTes } from "@/app/actions/akademik";
import { AcademicTabs, fmtNumber, requirePart, ScoreSection } from "@/components/akademik";
import { TestFields } from "@/components/akademik-client";
import { monthLabel } from "@/components/report-document";
import { ActionForm, SubmitButton } from "@/components/form";
import { Badge, Empty, PageHead } from "@/components/ui";
import { COMPONENTS, FITNESS_UNIT, SKD_MAX, skdPasses, TEST_CATEGORY_LABEL, type AcademicSettings, type ComponentCategory, type TestResult } from "@/lib/core/akademik";
import { formatDate } from "@/lib/format";
import { loadScores } from "@/lib/server/akademik";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Nilai & tes" };

type Search = Promise<Record<string, string | string[] | undefined>>;

function testValue(test: TestResult) {
  if (test.kategori === "SKD") return `${fmtNumber(test.twk)} / ${fmtNumber(test.tiu)} / ${fmtNumber(test.tkp)}`;
  const raw = test.kategori === "FISIK" && test.hasil_mentah !== null ? ` · ${fmtNumber(test.hasil_mentah)} ${FITNESS_UNIT[test.komponen] ?? ""}` : "";
  return `${fmtNumber(test.skor)}${raw}`;
}

function testName(test: TestResult) {
  if (test.kategori === "SKD") return test.nama_tes || "Tes SKD";
  return (COMPONENTS[test.kategori as ComponentCategory] as Record<string, string>)[test.komponen] ?? test.komponen;
}

function SkdBadge({ test, acuan }: { test: TestResult; acuan: AcademicSettings["acuan"] }) {
  return skdPasses(test, acuan) ? <Badge tone="success">Memenuhi acuan</Badge> : <Badge tone="warning">Di bawah acuan</Badge>;
}

export default async function ScoresPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor();
  requirePart(actor, "nilai");
  const params = await searchParams;
  const data = await loadScores(actor, params.siswa, params.periode);
  const { acuan } = data.clock.settings;

  const periodForm = (extra?: React.ReactNode) => (
    <form method="get" className="filters" aria-label="Saring nilai">
      {extra}
      <div className="field">
        <label htmlFor="periode">Bulan</label>
        <input id="periode" type="month" name="periode" defaultValue={data.periode} />
      </div>
      <button type="submit" className="btn btn-secondary">
        Tampilkan
      </button>
    </form>
  );

  if (data.kind === "family") {
    return (
      <div className="page">
        <PageHead eyebrow="Akademik" title="Nilai" description={`Acuan latihan SKD: TWK ${acuan.twk}, TIU ${acuan.tiu}, TKP ${acuan.tkp}. Ketiganya harus terpenuhi.`} />
        <AcademicTabs actor={actor} current="nilai" />
        <section className="card">{periodForm()}</section>
        {data.family.map(({ student, report, skdTests }) => (
          <div className="stack" key={student.siswa_id}>
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Tes SKD</h2>
                  <p>{student.nama}</p>
                </div>
                <Badge>{skdTests.length} tes</Badge>
              </div>
              {skdTests.length === 0 ? (
                <Empty title="Belum ada tes SKD bulan ini" />
              ) : (
                <div className="table-wrap">
                  <table className="data responsive">
                    <thead>
                      <tr>
                        <th>Tes</th>
                        <th>TWK</th>
                        <th>TIU</th>
                        <th>TKP</th>
                        <th>Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skdTests.map((test) => (
                        <tr key={test.tes_id}>
                          <td data-label="">
                            <b>{test.nama_tes || "Tes SKD"}</b>
                            <span className="cell-sub">{formatDate(test.tanggal)}</span>
                          </td>
                          <td data-label="TWK">{fmtNumber(test.twk)}</td>
                          <td data-label="TIU">{fmtNumber(test.tiu)}</td>
                          <td data-label="TKP">{fmtNumber(test.tkp)}</td>
                          <td data-label="Total">
                            <b>{fmtNumber((test.twk ?? 0) + (test.tiu ?? 0) + (test.tkp ?? 0))}</b> / {SKD_MAX.twk + SKD_MAX.tiu + SKD_MAX.tkp}
                          </td>
                          <td data-label="Status">
                            <SkdBadge test={test} acuan={acuan} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <div className="grid-2">
              {[report.sections[0]!, report.sections[2]!, report.sections[3]!].map((section) => (
                <ScoreSection key={section.title} section={section} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const selected = data.selected;
  return (
    <div className="page">
      <PageHead eyebrow="Akademik" title="Nilai & tes" description="SKD (TWK/TIU/TKP), akademik, psikotes, dan fisik. Nilai nol tetap dihitung; komponen yang belum diisi tidak dihitung." />
      <AcademicTabs actor={actor} current="nilai" />
      <section className="card">
        {periodForm(
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
          </div>,
        )}
      </section>
      {!selected ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Ringkasan {monthLabel(data.periode)}</h2>
              <p>Pilih siswa untuk mengisi atau melihat rincian nilai.</p>
            </div>
          </div>
          {data.rows.length === 0 ? (
            <Empty title="Belum ada siswa">Siswa aktif di kelas yang Anda ajar akan tampil di sini.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="data responsive">
                <thead>
                  <tr>
                    <th>Siswa</th>
                    <th>Tes</th>
                    <th>Rata-rata SKD</th>
                    <th>Akademik</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.student.siswa_id}>
                      <td data-label="">
                        <Link className="cell-title" href={`/akademik/nilai?siswa=${row.student.siswa_id}&periode=${data.periode}`}>
                          {row.student.nama}
                        </Link>
                        <span className="cell-sub mono">{row.student.kode_siswa}</span>
                      </td>
                      <td data-label="Tes">{row.tests}</td>
                      <td data-label="Rata-rata SKD">
                        <span className="row">
                          {fmtNumber(row.skd)}
                          {row.skdPass === null ? null : row.skdPass ? <Badge tone="success">Memenuhi</Badge> : <Badge tone="warning">Di bawah acuan</Badge>}
                        </span>
                      </td>
                      <td data-label="Akademik">{fmtNumber(row.academic)}</td>
                    </tr>
                  ))}
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
                <p>
                  Hasil tes {monthLabel(data.periode)} · <Link href={`/siswa/${selected.siswa_id}`}>profil siswa</Link>
                </p>
              </div>
              <Badge>{data.selectedTests.length} tes</Badge>
            </div>
            {data.selectedTests.length === 0 ? (
              <Empty title="Belum ada hasil tes bulan ini" />
            ) : (
              <div className="item-list">
                {data.selectedTests.map((test) => (
                  <div className="item" key={test.tes_id}>
                    <div className="item-main">
                      <b>
                        {TEST_CATEGORY_LABEL[test.kategori]} · {testName(test)}
                      </b>
                      <span className="cell-sub">
                        {formatDate(test.tanggal)} · {testValue(test)}
                        {test.catatan ? ` · ${test.catatan}` : ""}
                      </span>
                    </div>
                    <div className="row">
                      {test.kategori === "SKD" ? <SkdBadge test={test} acuan={acuan} /> : null}
                      <ActionForm action={arsipkanTes} operationId={randomUUID()} confirm="Arsipkan hasil tes ini? Nilainya tidak dihitung lagi." feedback={false}>
                        <input type="hidden" name="tes_id" value={test.tes_id} />
                        <SubmitButton variant="ghost" size="sm" pendingLabel="…">
                          Arsipkan
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Tambah hasil tes</h2>
                <p>
                  SKD maksimal TWK {SKD_MAX.twk}, TIU {SKD_MAX.tiu}, TKP {SKD_MAX.tkp}. Komponen lain memakai skor 0–100.
                </p>
              </div>
            </div>
            <ActionForm action={simpanTes} operationId={randomUUID()} resetOnSuccess className="stack">
              <input type="hidden" name="siswa_id" value={selected.siswa_id} />
              <TestFields today={data.clock.today} />
              <div className="form-actions">
                <SubmitButton>Simpan hasil</SubmitButton>
              </div>
            </ActionForm>
          </section>
        </div>
      )}
    </div>
  );
}
