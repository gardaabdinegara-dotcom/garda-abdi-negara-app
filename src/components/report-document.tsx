import { gradeOf, type ReportSnapshot } from "@/lib/core/akademik";
import { fmtNumber, fmtPercent } from "./akademik";

/** Bagian yang memakai predikat A–D. SKD dibandingkan dengan acuan, kehadiran dengan label disiplin. */
const GRADED = new Set(["Akademik", "Psikotes", "Perkembangan fisik", "Tugas"]);

export function monthLabel(periode: string) {
  const [year, month] = periode.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year!, (month ?? 1) - 1, 1)));
}

/** Rapor bulanan siap cetak. Isinya berasal dari snapshot (rapor terbit) atau hitungan langsung (pratinjau). */
export function ReportDocument({ snapshot, catatan, footer }: { snapshot: ReportSnapshot; catatan: string; footer: string }) {
  const { student, settings, summary } = snapshot;
  return (
    <article className="report-doc">
      <header className="report-head">
        <div>
          <span className="eyebrow">{settings.nama_lembaga}</span>
          <h2>Rapor bulanan · {monthLabel(snapshot.periode)}</h2>
          {settings.lokasi ? <p className="muted">{settings.lokasi}</p> : null}
        </div>
        <dl className="facts">
          <dt>Nama</dt>
          <dd>{student.nama}</dd>
          <dt>Kode</dt>
          <dd className="mono">{student.kode_siswa}</dd>
          <dt>Kelas</dt>
          <dd>{student.kelas}</dd>
          <dt>Jalur</dt>
          <dd>{student.jalur_target || "-"}</dd>
        </dl>
      </header>
      <div className="report-summary">
        <div>
          <span>Rata-rata SKD</span>
          <b>{fmtNumber(summary.skd)}</b>
        </div>
        <div>
          <span>Kehadiran</span>
          <b>{fmtPercent(summary.attendance)}</b>
        </div>
        <div>
          <span>Akademik</span>
          <b>{fmtNumber(summary.academic)}</b>
        </div>
        <div>
          <span>Fisik</span>
          <b>{fmtNumber(summary.physical)}</b>
        </div>
      </div>
      {snapshot.sections.map((section) => (
        <section className="report-section" key={section.title}>
          <h3>{section.title}</h3>
          <table className="report-table">
            <tbody>
              {section.rows.map((row, i) => (
                <tr key={`${row.label}-${i}`}>
                  <th scope="row">{row.label}</th>
                  <td className="report-value">{row.value}</td>
                  <td className="report-bar">
                    {row.score !== null ? (
                      <span className="row">
                        <meter className="capacity" min={0} max={100} value={row.score} aria-label={`Skor ${fmtNumber(row.score)}`} />
                        <b>{GRADED.has(section.title) ? gradeOf(row.score, settings) : ""}</b>
                      </span>
                    ) : null}
                  </td>
                  <td className="report-note">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {section.note ? <p className="muted">{section.note}</p> : null}
        </section>
      ))}
      <section className="report-section">
        <h3>Catatan pengajar</h3>
        <p className="prewrap">{catatan || "-"}</p>
      </section>
      <p className="report-legend muted">
        Predikat: A ≥ {settings.predikat_a} · B ≥ {settings.predikat_b} · C ≥ {settings.predikat_c} · D di bawahnya. Acuan latihan SKD: TWK {settings.acuan.twk}, TIU {settings.acuan.tiu}, TKP {settings.acuan.tkp}.
      </p>
      <footer className="report-foot">
        <span>{footer}</span>
        <div className="report-sign">
          <div>
            <span>Pengajar</span>
          </div>
          <div>
            <span>Orang tua / wali</span>
          </div>
        </div>
      </footer>
    </article>
  );
}
