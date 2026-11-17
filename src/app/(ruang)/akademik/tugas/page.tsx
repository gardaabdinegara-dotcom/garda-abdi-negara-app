import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { kirimTugas, simpanTugas } from "@/app/actions/akademik";
import { AcademicTabs, fmtNumber, requirePart, SubmissionBadge } from "@/components/akademik";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { TaskFields } from "@/components/task-fields";
import { ActiveBadge, Badge, Empty, Notice, PageHead } from "@/components/ui";
import { SESSION_TYPE_LABEL } from "@/lib/core/akademik";
import { formatDate } from "@/lib/format";
import { loadTasks } from "@/lib/server/akademik";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Tugas" };

export default async function TasksPage() {
  const actor = await requireActor();
  requirePart(actor, "tugas");
  const data = await loadTasks(actor);
  const today = data.clock.today;

  if (data.kind === "student") {
    return (
      <div className="page">
        <PageHead eyebrow="Akademik" title="Tugas" description="Kerjakan tugas, lalu kirim tautan hasilnya (Google Drive, Docs, Form, atau lainnya)." />
        <AcademicTabs actor={actor} current="tugas" />
        {!data.student ? <Notice>Akun ini belum ditautkan ke data siswa. Hubungi admin.</Notice> : null}
        {data.student && data.tasks.length === 0 ? <Empty title="Belum ada tugas" /> : null}
        <div className="stack">
          {data.tasks.map((task) => {
            const late = !task.mine && task.tenggat < today;
            return (
              <section className="card" key={task.tugas_id}>
                <div className="card-head">
                  <div>
                    <h2>{task.nama}</h2>
                    <p>
                      {SESSION_TYPE_LABEL[task.bidang]} · {task.kelas} · tenggat {formatDate(task.tenggat, "long")}
                    </p>
                  </div>
                  <div className="row">
                    {task.mine ? <SubmissionBadge status={task.mine.status} /> : late ? <Badge tone="danger">Lewat tenggat</Badge> : <Badge>Belum dikumpulkan</Badge>}
                    {task.mine?.status === "DIPERIKSA" && task.mine.nilai !== null ? <Badge tone="info">Nilai {fmtNumber(task.mine.nilai)}</Badge> : null}
                  </div>
                </div>
                {task.instruksi ? <p className="prewrap">{task.instruksi}</p> : null}
                {task.mine ? (
                  <p className="muted">
                    Terkirim:{" "}
                    <a href={task.mine.tautan} target="_blank" rel="noopener noreferrer nofollow">
                      {task.mine.tautan}
                    </a>
                    {task.mine.catatan ? ` · Catatan: ${task.mine.catatan}` : ""}
                  </p>
                ) : null}
                {task.mine?.status !== "DIPERIKSA" ? (
                  <ActionForm action={kirimTugas} operationId={randomUUID()} className="form-grid two">
                    <input type="hidden" name="tugas_id" value={task.tugas_id} />
                    <Field label="Tautan hasil" name="tautan" type="url" placeholder="https://…" defaultValue={task.mine?.tautan} required />
                    <Field label="Catatan untuk pengajar" name="catatan" />
                    <div className="form-actions">
                      <SubmitButton pendingLabel="Mengirim…">{task.mine ? "Kirim ulang" : "Kirim tugas"}</SubmitButton>
                    </div>
                  </ActionForm>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHead eyebrow="Akademik" title="Tugas" description="Buat tugas per kelas, lalu periksa tautan yang dikirim siswa dan beri nilai." />
      <AcademicTabs actor={actor} current="tugas" />
      <div className="grid-main">
        <section className="card">
          <div className="card-head">
            <h2>Daftar tugas</h2>
            <Badge>{data.tasks.length}</Badge>
          </div>
          {data.tasks.length === 0 ? (
            <Empty title="Belum ada tugas" />
          ) : (
            <div className="item-list">
              {data.tasks.map((task) => (
                <div className="item" key={task.tugas_id}>
                  <div className="item-main">
                    <Link className="cell-title" href={`/akademik/tugas/${task.tugas_id}`}>
                      {task.nama}
                    </Link>
                    <span className="cell-sub">
                      {task.kelas} · {SESSION_TYPE_LABEL[task.bidang]} · tenggat {formatDate(task.tenggat)} · {task.pengajar}
                    </span>
                  </div>
                  <div className="row">
                    {task.dikirim ? <Badge tone="warning">{task.dikirim} perlu diperiksa</Badge> : null}
                    <Badge tone="info">
                      {task.diperiksa}/{task.peserta} dinilai
                    </Badge>
                    {!task.aktif ? <ActiveBadge active={false} /> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Buat tugas</h2>
          </div>
          {data.classes.length === 0 && !data.allClasses ? (
            <Notice>Belum ada kelas yang ditautkan ke akun Anda.</Notice>
          ) : (
            <ActionForm action={simpanTugas} operationId={randomUUID()} resetOnSuccess className="stack">
              <TaskFields classes={data.classes} allClasses={data.allClasses} today={today} />
              <div className="form-actions">
                <SubmitButton>Simpan tugas</SubmitButton>
              </div>
            </ActionForm>
          )}
        </section>
      </div>
    </div>
  );
}
