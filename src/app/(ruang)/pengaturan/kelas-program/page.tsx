import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { simpanKelas, simpanProgram } from "@/app/actions/pengaturan";
import { ActionForm, CheckField, Field, SubmitButton } from "@/components/form";
import { ActiveBadge, Badge, Empty, Notice, PageHead } from "@/components/ui";
import { PROGRAM_TARGETS } from "@/lib/core/validation";
import { loadCatalog } from "@/lib/server/queries";
import { requireActor } from "@/lib/server/session";
import { SettingsTabs } from "../tabs";

export const metadata: Metadata = { title: "Program & kelas" };

const TARGET_OPTIONS = PROGRAM_TARGETS.map((t) => ({ value: t, label: t }));

export default async function CatalogPage() {
  const actor = await requireActor({ roles: ["OWNER", "ADMIN"] });
  const { programs, classes } = await loadCatalog();
  const programOptions = programs.filter((p) => p.aktif).map((p) => ({ value: p.program_id, label: p.nama_program }));
  const programName = new Map(programs.map((p) => [p.program_id, p.nama_program]));
  const sortedPrograms = [...programs].sort((a, b) => Number(b.aktif) - Number(a.aktif) || a.nama_program.localeCompare(b.nama_program, "id"));
  const sortedClasses = [...classes].sort(
    (a, b) => Number(b.aktif) - Number(a.aktif) || (programName.get(a.program_id) ?? "").localeCompare(programName.get(b.program_id) ?? "", "id") || a.nama_kelas.localeCompare(b.nama_kelas, "id"),
  );

  return (
    <div className="page">
      <PageHead eyebrow="Pengaturan" title="Program & kelas" description="Program adalah paket belajar (mis. Reguler TNI); kelas adalah rombongan belajar di dalam program." />
      <SettingsTabs current="kelas-program" owner={actor.user.peran === "OWNER"} />
      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Program</h2>
              <p>Program nonaktif tidak bisa dipilih untuk pendaftaran baru.</p>
            </div>
            <Badge>{programs.length}</Badge>
          </div>
          {sortedPrograms.length === 0 ? (
            <Empty title="Belum ada program">Tambahkan program pertama di bawah.</Empty>
          ) : (
            <div className="item-list">
              {sortedPrograms.map((p) => (
                <div className="item" key={p.program_id}>
                  <div className="item-main">
                    <b>{p.nama_program}</b>
                    <span className="cell-sub">Target {p.target_seleksi}</span>
                  </div>
                  <ActiveBadge active={p.aktif} />
                  <details className="details-edit item-edit">
                    <summary className="btn btn-ghost btn-sm">Ubah</summary>
                    <ActionForm action={simpanProgram} operationId={randomUUID()} className="stack">
                      <input type="hidden" name="program_id" value={p.program_id} />
                      <div className="form-grid two">
                        <Field label="Nama program" name="nama_program" defaultValue={p.nama_program} required />
                        <Field label="Target seleksi" name="target_seleksi" type="select" defaultValue={p.target_seleksi} options={TARGET_OPTIONS} />
                      </div>
                      <CheckField label="Program aktif" name="aktif" defaultChecked={p.aktif} />
                      <div className="form-actions">
                        <SubmitButton size="sm">Simpan program</SubmitButton>
                      </div>
                    </ActionForm>
                  </details>
                </div>
              ))}
            </div>
          )}
          <ActionForm action={simpanProgram} operationId={randomUUID()} resetOnSuccess className="stack">
            <h3>Tambah program</h3>
            <div className="form-grid two">
              <Field label="Nama program" name="nama_program" placeholder="Reguler TNI 2027" required />
              <Field label="Target seleksi" name="target_seleksi" type="select" options={TARGET_OPTIONS} />
            </div>
            <div className="form-actions">
              <SubmitButton>Tambah program</SubmitButton>
            </div>
          </ActionForm>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>Kelas</h2>
              <p>Program sebuah kelas tidak bisa dipindah selama masih ada siswa aktif di dalamnya.</p>
            </div>
            <Badge>{classes.length}</Badge>
          </div>
          {sortedClasses.length === 0 ? (
            <Empty title="Belum ada kelas">{programs.length === 0 ? "Buat program dulu, lalu tambahkan kelas." : "Tambahkan kelas pertama di bawah."}</Empty>
          ) : (
            <div className="item-list">
              {sortedClasses.map((c) => (
                <div className="item" key={c.kelas_id}>
                  <div className="item-main">
                    <b>{c.nama_kelas}</b>
                    <span className="cell-sub">
                      {programName.get(c.program_id) ?? "Program tidak dikenal"}
                      {c.angkatan ? ` · Angkatan ${c.angkatan}` : ""}
                    </span>
                  </div>
                  <ActiveBadge active={c.aktif} />
                  <details className="details-edit item-edit">
                    <summary className="btn btn-ghost btn-sm">Ubah</summary>
                    <ActionForm action={simpanKelas} operationId={randomUUID()} className="stack">
                      <input type="hidden" name="kelas_id" value={c.kelas_id} />
                      <div className="form-grid three">
                        <Field label="Nama kelas" name="nama_kelas" defaultValue={c.nama_kelas} required />
                        <Field
                          label="Program"
                          name="program_id"
                          type="select"
                          defaultValue={c.program_id}
                          options={programs.map((p) => ({ value: p.program_id, label: p.aktif ? p.nama_program : `${p.nama_program} (nonaktif)` }))}
                        />
                        <Field label="Angkatan" name="angkatan" defaultValue={c.angkatan} />
                      </div>
                      <CheckField label="Kelas aktif" name="aktif" defaultChecked={c.aktif} />
                      <div className="form-actions">
                        <SubmitButton size="sm">Simpan kelas</SubmitButton>
                      </div>
                    </ActionForm>
                  </details>
                </div>
              ))}
            </div>
          )}
          {programOptions.length === 0 ? (
            <Notice>Tambahkan program aktif terlebih dahulu.</Notice>
          ) : (
            <ActionForm action={simpanKelas} operationId={randomUUID()} resetOnSuccess className="stack">
              <h3>Tambah kelas</h3>
              <div className="form-grid three">
                <Field label="Nama kelas" name="nama_kelas" placeholder="TNI A" required />
                <Field label="Program" name="program_id" type="select" options={programOptions} />
                <Field label="Angkatan" name="angkatan" placeholder="2026" />
              </div>
              <div className="form-actions">
                <SubmitButton>Tambah kelas</SubmitButton>
              </div>
            </ActionForm>
          )}
        </section>
      </div>
    </div>
  );
}
