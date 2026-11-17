import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { tambahSiswa } from "@/app/actions/siswa";
import { EnrollmentSetup, type ProgramOption } from "@/components/enrollment-setup";
import { ActionForm, SubmitButton } from "@/components/form";
import { StudentFields } from "@/components/student-fields";
import { Notice, PageHead } from "@/components/ui";
import { todayISO } from "@/lib/format";
import { FITUR } from "@/lib/core/fitur";
import { loadTariffs } from "@/lib/server/keuangan";
import { loadCatalog, loadOverview, loadSettings } from "@/lib/server/queries";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Tambah siswa" };

export default async function NewStudentPage() {
  const actor = await requireActor({ roles: ["OWNER", "ADMIN"] });
  const [overview, settings, catalog, money] = await Promise.all([loadOverview(actor), loadSettings(), loadCatalog(), FITUR.tagihan ? loadTariffs(actor) : Promise.resolve(null)]);
  const full = overview.activeStudents >= overview.capacity;
  const today = todayISO(settings.zona_waktu);
  const programs: ProgramOption[] = catalog.programs
    .filter((p) => p.aktif)
    .map((p) => ({ program_id: p.program_id, nama_program: p.nama_program, skema: money?.tariffs.get(p.program_id)?.skema ?? null, tarif: money?.tariffs.get(p.program_id)?.tarif ?? null }));
  const classes = catalog.classes.filter((c) => c.aktif);

  return (
    <div className="page">
      <PageHead
        back={{ href: "/siswa", label: "Siswa" }}
        title="Tambah siswa"
        description={
          FITUR.tagihan
            ? "Satu isian untuk data siswa, pendaftaran program dan kelas, serta biaya dan tagihan pertama. Kode siswa (GAN-0001, dst.) dibuat otomatis."
            : "Kode siswa (GAN-0001, dst.) dan akun login siswa dibuat otomatis. Siswa membuat PIN sendiri saat masuk pertama."
        }
      />
      {full ? (
        <Notice tone="warning">
          Kapasitas {overview.capacity} siswa aktif sudah penuh. Nonaktifkan siswa yang sudah selesai atau naikkan kapasitas di Pengaturan → Lembaga.
        </Notice>
      ) : null}
      <ActionForm action={tambahSiswa} operationId={randomUUID()} className="stack">
        <section className="card">
          <div className="card-head">
            <h2>1. Data siswa</h2>
          </div>
          <StudentFields today={today} />
        </section>
        {FITUR.tagihan ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>2. Pendaftaran{money ? " & biaya" : ""}</h2>
              <p>
                {programs.length === 0
                  ? "Belum ada program aktif; siswa bisa didaftarkan nanti dari profilnya."
                  : money
                    ? "Opsional. Biaya mengikuti tarif program; tagihan pertama bisa langsung diterbitkan."
                    : "Opsional. Ketentuan biaya diatur oleh petugas keuangan."}
              </p>
            </div>
          </div>
          {programs.length ? <EnrollmentSetup programs={programs} classes={classes} today={today} finance={Boolean(money)} owner={Boolean(money?.owner)} optional /> : null}
        </section>
        ) : null}
        <div className="form-actions">
          <SubmitButton>Simpan siswa</SubmitButton>
          <Link href="/siswa" className="btn btn-secondary">
            Batal
          </Link>
        </div>
      </ActionForm>
    </div>
  );
}
