import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { revisiRapor, simpanCatatanRapor, terbitkanRapor } from "@/app/actions/akademik";
import { requirePart } from "@/components/akademik";
import { PrintButton } from "@/components/akademik-client";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { monthLabel, ReportDocument } from "@/components/report-document";
import { Notice, PageHead } from "@/components/ui";
import { isAcademicStaff } from "@/lib/core/akademik";
import { formatDate } from "@/lib/format";
import { loadReport } from "@/lib/server/akademik";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Rapor siswa" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function ReportPage({ params, searchParams }: { params: Promise<{ siswa: string }>; searchParams: Search }) {
  const actor = await requireActor();
  requirePart(actor, "rapor");
  const { siswa } = await params;
  const search = await searchParams;
  const report = await loadReport(actor, decodeURIComponent(siswa), search.periode);
  const { snapshot } = report;
  const staff = isAcademicStaff(actor);
  const publishedOn = report.publishedAt ? formatDate(report.publishedAt.slice(0, 10), "long") : "";
  const footer = report.live ? `Pratinjau ${formatDate(report.clock.today, "long")} · belum terbit` : `Versi ${report.versi} · diterbitkan ${publishedOn}`;
  const ids = { siswa_id: snapshot.student.siswa_id, periode: snapshot.periode };

  return (
    <div className="page">
      <PageHead
        back={{ href: `/akademik/rapor?periode=${snapshot.periode}`, label: "Rapor" }}
        eyebrow={monthLabel(snapshot.periode)}
        title={snapshot.student.nama}
        actions={<PrintButton />}
      />
      {staff ? (
        <div className="stack screen-only">
          {report.status === "TERBIT" ? (
            <Notice tone="success">Rapor versi {report.versi} sudah terbit dan dibekukan. Perubahan nilai setelah ini tidak mengubah isinya.</Notice>
          ) : (
            <Notice tone="warning">
              Pratinjau langsung dari data saat ini{report.status === "DRAF" ? ` (draf versi ${report.versi})` : ""}.
              {report.publishedVersion ? ` Siswa dan wali masih melihat versi ${report.publishedVersion}.` : " Siswa dan wali belum bisa melihatnya."}
            </Notice>
          )}
          <div className="grid-2">
            {report.canEdit && report.status !== "TERBIT" ? (
              <section className="card">
                <ActionForm action={simpanCatatanRapor} operationId={randomUUID()} className="stack">
                  <input type="hidden" name="siswa_id" value={ids.siswa_id} />
                  <input type="hidden" name="periode" value={ids.periode} />
                  <Field label="Catatan pengajar" name="catatan" type="textarea" defaultValue={report.catatan} hint="Tampil di bagian akhir rapor." />
                  <div className="form-actions">
                    <SubmitButton variant="secondary">Simpan draf</SubmitButton>
                  </div>
                </ActionForm>
              </section>
            ) : null}
            {report.canPublish ? (
              <section className="card">
                <div className="card-head">
                  <div>
                    <h2>{report.status === "TERBIT" ? "Revisi rapor" : "Terbitkan rapor"}</h2>
                    <p>
                      {report.status === "TERBIT"
                        ? "Revisi membuat draf versi baru. Versi lama tetap terlihat sampai revisi diterbitkan."
                        : "Isi rapor dibekukan saat terbit dan langsung terlihat oleh siswa dan wali."}
                    </p>
                  </div>
                </div>
                {report.status === "TERBIT" ? (
                  <ActionForm action={revisiRapor} operationId={randomUUID()} confirm="Buat draf revisi untuk rapor ini?">
                    <input type="hidden" name="siswa_id" value={ids.siswa_id} />
                    <input type="hidden" name="periode" value={ids.periode} />
                    <SubmitButton variant="secondary">Buat revisi</SubmitButton>
                  </ActionForm>
                ) : (
                  <ActionForm action={terbitkanRapor} operationId={randomUUID()} confirm={`Terbitkan rapor ${snapshot.student.nama} bulan ${monthLabel(snapshot.periode)}?`}>
                    <input type="hidden" name="siswa_id" value={ids.siswa_id} />
                    <input type="hidden" name="periode" value={ids.periode} />
                    <input type="hidden" name="catatan" value={report.catatan} />
                    <SubmitButton>Terbitkan versi {report.versi}</SubmitButton>
                  </ActionForm>
                )}
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
      <ReportDocument snapshot={snapshot} catatan={report.catatan} footer={footer} />
    </div>
  );
}
