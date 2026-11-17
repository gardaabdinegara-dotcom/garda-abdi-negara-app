import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { periksaTugas, simpanTugas } from "@/app/actions/akademik";
import { fmtNumber, requirePart, SubmissionBadge } from "@/components/akademik";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { TaskFields } from "@/components/task-fields";
import { ActiveBadge, Badge, Empty, PageHead } from "@/components/ui";
import { SESSION_TYPE_LABEL } from "@/lib/core/akademik";
import { formatDate } from "@/lib/format";
import { loadTaskDetail } from "@/lib/server/akademik";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Periksa tugas" };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor({ roles: ["OWNER", "ADMIN", "PENGAJAR"] });
  requirePart(actor, "tugas");
  const { id } = await params;
  const data = await loadTaskDetail(actor, decodeURIComponent(id));
  const { task } = data;
  const sent = data.roster.filter((r) => r.submission).length;

  return (
    <div className="page">
      <PageHead
        back={{ href: "/akademik/tugas", label: "Tugas" }}
        eyebrow={`${data.kelas} · ${SESSION_TYPE_LABEL[task.bidang]}`}
        title={task.nama}
        description={`Tenggat ${formatDate(task.tenggat, "long")} · dibuat oleh ${data.pengajar}`}
        actions={<ActiveBadge active={task.aktif} />}
      />
      {task.instruksi ? (
        <section className="card">
          <p className="prewrap">{task.instruksi}</p>
        </section>
      ) : null}
      <div className="grid-main">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Pengumpulan</h2>
              <p>
                {sent} dari {data.roster.length} siswa sudah mengirim
              </p>
            </div>
          </div>
          {data.roster.length === 0 ? (
            <Empty title="Belum ada siswa di kelas ini" />
          ) : (
            <div className="item-list">
              {data.roster.map(({ student, submission }) => (
                <div className="item" key={student.siswa_id}>
                  <div className="item-main">
                    <b>{student.nama}</b>
                    <span className="cell-sub">
                      {submission?.tautan ? (
                        <a href={submission.tautan} target="_blank" rel="noopener noreferrer nofollow">
                          Buka hasil
                        </a>
                      ) : (
                        "Belum ada tautan"
                      )}
                      {submission?.catatan ? ` · ${submission.catatan}` : ""}
                    </span>
                  </div>
                  <div className="row">
                    {submission ? <SubmissionBadge status={submission.status} /> : <Badge>Belum dikumpulkan</Badge>}
                    {submission?.nilai !== null && submission?.nilai !== undefined ? <Badge tone="info">Nilai {fmtNumber(submission.nilai)}</Badge> : null}
                  </div>
                  <details className="details-edit item-edit">
                    <summary className="btn btn-ghost btn-sm">Periksa</summary>
                    <ActionForm action={periksaTugas} operationId={randomUUID()} className="form-grid three">
                      <input type="hidden" name="tugas_id" value={task.tugas_id} />
                      <input type="hidden" name="siswa_id" value={student.siswa_id} />
                      <Field
                        label="Hasil"
                        name="status"
                        type="select"
                        defaultValue={submission?.status === "DIKEMBALIKAN" ? "DIKEMBALIKAN" : "DIPERIKSA"}
                        options={[
                          { value: "DIPERIKSA", label: "Diperiksa (beri nilai)" },
                          { value: "DIKEMBALIKAN", label: "Kembalikan untuk diperbaiki" },
                        ]}
                      />
                      <Field label="Nilai (0–100)" name="nilai" type="number" min={0} max={100} defaultValue={submission?.nilai ?? ""} />
                      <Field label="Catatan" name="catatan" defaultValue={submission?.catatan} />
                      <div className="form-actions">
                        <SubmitButton size="sm">Simpan</SubmitButton>
                      </div>
                    </ActionForm>
                  </details>
                </div>
              ))}
            </div>
          )}
        </section>
        {data.canEdit ? (
          <section className="card">
            <div className="card-head">
              <h2>Ubah tugas</h2>
            </div>
            <ActionForm action={simpanTugas} operationId={randomUUID()} className="stack">
              <input type="hidden" name="tugas_id" value={task.tugas_id} />
              <TaskFields classes={data.classes} allClasses={data.allClasses} task={task} today={data.clock.today} />
              <div className="form-actions">
                <SubmitButton>Simpan perubahan</SubmitButton>
              </div>
            </ActionForm>
          </section>
        ) : null}
      </div>
    </div>
  );
}
