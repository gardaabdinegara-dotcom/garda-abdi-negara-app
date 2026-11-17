import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { tambahPendaftaran, ubahSiswa, ubahStatusPendaftaran, ubahStatusSiswa } from "@/app/actions/siswa";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { EnrollmentSetup } from "@/components/enrollment-setup";
import { StudentFields } from "@/components/student-fields";
import { ActiveBadge, Badge, Empty, EnrollmentBadge, Notice, PageHead, RoleBadge } from "@/components/ui";
import { ENROLLMENT_LABEL, ENROLLMENT_STATUS } from "@/lib/core/types";
import { formatDate, formatPhone, todayISO } from "@/lib/format";
import { loadStudentAcademic } from "@/lib/server/akademik";
import { loadStudentBills, loadTariffs } from "@/lib/server/keuangan";
import { InvoiceBadge, rp } from "@/components/keuangan";
import { loadCatalog, loadSettings, loadStudentProfile } from "@/lib/server/queries";
import { fmtNumber, fmtPercent } from "@/components/akademik";
import { monthLabel } from "@/components/report-document";
import { disciplineLabel } from "@/lib/core/akademik";
import { FITUR } from "@/lib/core/fitur";
import { canManageSamapta } from "@/lib/core/samapta";
import { loadSamaptaStudent } from "@/lib/server/samapta";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Profil siswa" };

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function StudentPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const actor = await requireActor();
  const { id } = await params;
  const search = await searchParams;
  const [profile, catalog, settings] = await Promise.all([loadStudentProfile(actor, decodeURIComponent(id)), loadCatalog(), loadSettings()]);
  const { student, enrollments, accounts, canManage } = profile;
  const [academic, bills, money, samapta] = await Promise.all([
    loadStudentAcademic(actor, student.siswa_id),
    FITUR.tagihan ? loadStudentBills(actor, student.siswa_id) : Promise.resolve(null),
    canManage && FITUR.tagihan ? loadTariffs(actor) : Promise.resolve(null),
    canManageSamapta(actor) ? loadSamaptaStudent(actor, student.siswa_id) : Promise.resolve(null),
  ]);
  const lastTest = samapta?.history.at(-1) ?? null;
  const programs = new Map(catalog.programs.map((p) => [p.program_id, p.nama_program]));
  const classes = new Map(catalog.classes.map((c) => [c.kelas_id, c]));
  const today = todayISO(settings.zona_waktu);
  const activePrograms = catalog.programs.filter((p) => p.aktif);
  const activeClasses = catalog.classes.filter((c) => c.aktif);

  return (
    <div className="page">
      <PageHead
        back={canManage || actor.user.peran === "PENGAJAR" ? { href: "/siswa", label: "Siswa" } : { href: "/beranda", label: "Beranda" }}
        eyebrow={student.kode_siswa}
        title={student.nama}
        actions={
          <>
            {student.jalur_target ? <Badge tone="info">{student.jalur_target}</Badge> : null}
            <ActiveBadge active={student.aktif} />
          </>
        }
      />
      {search.baru ? (
        <Notice tone="success">
          Siswa tersimpan dengan kode {student.kode_siswa}.
          {search.tagihan ? " Pendaftaran, ketentuan biaya, dan tagihan pertama juga sudah dibuat." : enrollments.length ? " Pendaftaran program juga sudah dibuat." : " Lanjutkan dengan mendaftarkannya ke program dan kelas."}
        </Notice>
      ) : null}

      <div className="grid-main">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Data siswa</h2>
                <p>Terdaftar sejak {formatDate(student.tanggal_daftar, "long")}.</p>
              </div>
            </div>
            {canManage ? (
              <ActionForm action={ubahSiswa} operationId={randomUUID()} className="stack">
                <input type="hidden" name="siswa_id" value={student.siswa_id} />
                <StudentFields student={student} today={today} />
                <div className="form-actions">
                  <SubmitButton>Simpan perubahan</SubmitButton>
                </div>
              </ActionForm>
            ) : (
              <dl className="facts">
                <dt>Jenis kelamin</dt>
                <dd>{student.jenis_kelamin === "P" ? "Perempuan" : student.jenis_kelamin === "L" ? "Laki-laki" : "-"}</dd>
                <dt>Tempat, tanggal lahir</dt>
                <dd>
                  {student.tempat_lahir ? `${student.tempat_lahir}, ` : ""}
                  {formatDate(student.tanggal_lahir, "long")}
                </dd>
                <dt>Asal sekolah</dt>
                <dd>{student.asal_sekolah || "-"}</dd>
                <dt>No. WA</dt>
                <dd>{formatPhone(student.no_wa)}</dd>
                <dt>Wali</dt>
                <dd>
                  {student.nama_wali || "-"}
                  {student.no_wa_wali ? ` · ${formatPhone(student.no_wa_wali)}` : ""}
                </dd>
              </dl>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2>{FITUR.nilai ? "Akademik" : "Presensi & samapta"}</h2>
                <p>Ringkasan {monthLabel(academic.clock.periode)}.</p>
              </div>
            </div>
            <div className="report-summary">
              <div>
                <span>Kehadiran</span>
                <b>{fmtPercent(academic.summary.persen)}</b>
                <span>
                  {academic.summary.hadir}/{academic.summary.total} sesi · {disciplineLabel(academic.summary.persen)}
                </span>
              </div>
              {samapta ? (
                <div>
                  <span>{lastTest ? lastTest.test.nama : "Tes Samapta"}</span>
                  <b>{lastTest?.entry.score.akhir != null ? fmtNumber(lastTest.entry.score.akhir, 2) : "-"}</b>
                  <span>{lastTest ? (lastTest.entry.score.klas ?? "Belum lengkap") : "Belum ikut tes"}</span>
                </div>
              ) : null}
              {FITUR.nilai ? (
                <div>
                  <span>SKD terakhir</span>
                  <b>{academic.skd ? fmtNumber(academic.skd.total, 0) : "-"}</b>
                  <span>{academic.skd ? (academic.skd.pass ? "Memenuhi acuan" : "Di bawah acuan") : "Belum ada tes"}</span>
                </div>
              ) : null}
              {FITUR.rapor ? (
                <div>
                  <span>Rapor terbaru</span>
                  <b>{academic.latestReport ? monthLabel(academic.latestReport.periode) : "-"}</b>
                  <span>{academic.latestReport ? `Versi ${academic.latestReport.versi}` : "Belum terbit"}</span>
                </div>
              ) : null}
            </div>
            <div className="row">
              {lastTest ? (
                <Link href={`/samapta/${lastTest.test.tes_id}/siswa/${student.siswa_id}`} className="btn btn-secondary btn-sm">
                  Hasil samapta
                </Link>
              ) : null}
              {academic.staff && FITUR.nilai ? (
                <Link href={`/akademik/nilai?siswa=${student.siswa_id}`} className="btn btn-secondary btn-sm">
                  Nilai & tes
                </Link>
              ) : null}
              {FITUR.rapor ? (
                <Link href={`/akademik/rapor/${student.siswa_id}?periode=${academic.latestReport?.periode ?? academic.clock.periode}`} className="btn btn-secondary btn-sm">
                  Rapor
                </Link>
              ) : null}
            </div>
          </section>

          {bills ? (
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Tagihan</h2>
                  <p>{bills.length ? `Sisa ${rp(bills.reduce((sum, b) => sum + (b.summary.cancelled ? 0 : b.summary.remaining), 0))}` : "Belum ada tagihan."}</p>
                </div>
              </div>
              {bills.length ? (
                <div className="item-list">
                  {bills.map((b) => (
                    <div className="item" key={String(b.invoice.tagihan_id)}>
                      <div className="item-main">
                        <Link className="cell-title" href={actor.user.peran === "WALI" ? "/keuangan/tagihan" : `/keuangan/tagihan/${String(b.invoice.tagihan_id)}`}>
                          {b.student.program} · {String(b.invoice.periode_layanan) || "paket"}
                        </Link>
                        <span className="cell-sub">
                          {rp(b.summary.face)} · sisa {rp(b.summary.remaining)}
                          {b.nextDue ? ` · berikutnya ${formatDate(b.nextDue.date)}` : ""}
                        </span>
                      </div>
                      <InvoiceBadge status={b.status} />
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="card">
            <div className="card-head">
              <div>
                <h2>Pendaftaran</h2>
                <p>Program dan kelas yang diikuti. Satu program hanya boleh punya satu pendaftaran aktif atau cuti.</p>
              </div>
            </div>
            {enrollments.length === 0 ? (
              <Empty title="Belum terdaftar">{canManage ? "Daftarkan ke program dan kelas di bawah." : "Belum ada program yang diikuti."}</Empty>
            ) : (
              <div className="item-list">
                {enrollments.map((e) => (
                  <div className="item" key={e.pendaftaran_id}>
                    <div className="item-main">
                      <b>{programs.get(e.program_id) ?? "Program tidak dikenal"}</b>
                      <span className="cell-sub">
                        {classes.get(e.kelas_id)?.nama_kelas ?? "Kelas tidak dikenal"} · mulai {formatDate(e.tanggal_mulai)}
                        {e.tanggal_selesai ? ` · selesai ${formatDate(e.tanggal_selesai)}` : ""}
                      </span>
                    </div>
                    <EnrollmentBadge status={e.status} />
                    {canManage ? (
                      <details className="details-edit item-edit">
                        <summary className="btn btn-ghost btn-sm">Ubah status</summary>
                        <ActionForm action={ubahStatusPendaftaran} operationId={randomUUID()} className="form-grid three">
                          <input type="hidden" name="pendaftaran_id" value={e.pendaftaran_id} />
                          <Field
                            label="Status"
                            name="status"
                            type="select"
                            defaultValue={e.status}
                            options={ENROLLMENT_STATUS.map((s) => ({ value: s, label: ENROLLMENT_LABEL[s] }))}
                          />
                          <Field label="Tanggal selesai" name="tanggal_selesai" type="date" defaultValue={e.tanggal_selesai} hint="Untuk Selesai/Berhenti; kosong = hari ini." />
                          <div className="form-actions">
                            <SubmitButton size="sm">Simpan status</SubmitButton>
                          </div>
                        </ActionForm>
                      </details>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {canManage && student.aktif ? (
              activePrograms.length === 0 ? (
                <Notice>
                  Belum ada program aktif. Buat dulu di <Link href="/pengaturan/kelas-program">Pengaturan → Program & kelas</Link>.
                </Notice>
              ) : (
                <ActionForm action={tambahPendaftaran} operationId={randomUUID()} className="stack">
                  <h3>Daftarkan ke program</h3>
                  <input type="hidden" name="siswa_id" value={student.siswa_id} />
                  <div>
                    <EnrollmentSetup
                      programs={activePrograms.map((p) => ({ program_id: p.program_id, nama_program: p.nama_program, skema: money?.tariffs.get(p.program_id)?.skema ?? null, tarif: money?.tariffs.get(p.program_id)?.tarif ?? null }))}
                      classes={activeClasses}
                      today={today}
                      finance={Boolean(money)}
                      owner={Boolean(money?.owner)}
                      optional={false}
                    />
                  </div>
                  <div className="form-actions">
                    <SubmitButton>Daftarkan</SubmitButton>
                  </div>
                </ActionForm>
              )
            ) : null}
          </section>
        </div>

        {canManage ? (
          <div className="stack">
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Akun tertaut</h2>
                  <p>Akun siswa dan wali yang bisa melihat data ini.</p>
                </div>
              </div>
              {accounts.length === 0 ? (
                <Empty title="Belum ada akun">
                  Buat akun siswa atau wali di <Link href="/pengaturan/akun">Pengaturan → Akun</Link>, lalu tautkan ke siswa ini.
                </Empty>
              ) : (
                <div className="item-list">
                  {accounts.map(({ link, user }) => (
                    <div className="item" key={link.tautan_id}>
                      <div className="item-main">
                        <Link href={`/pengaturan/akun/${user.user_id}`} className="cell-title">
                          {user.nama}
                        </Link>
                        <span className="cell-sub mono">@{user.username}</span>
                      </div>
                      <div className="row">
                        <RoleBadge role={user.peran} />
                        {!user.aktif ? <ActiveBadge active={false} /> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Status siswa</h2>
                  <p>
                    {student.aktif
                      ? "Siswa nonaktif tidak dihitung dalam kapasitas. Data dan riwayatnya tetap tersimpan."
                      : "Mengaktifkan kembali akan memakai satu slot kapasitas."}
                  </p>
                </div>
              </div>
              <ActionForm
                action={ubahStatusSiswa}
                operationId={randomUUID()}
                confirm={student.aktif ? `Nonaktifkan ${student.nama}?` : undefined}
              >
                <input type="hidden" name="siswa_id" value={student.siswa_id} />
                {student.aktif ? (
                  <SubmitButton variant="danger" name="aktif" value="false">
                    Nonaktifkan siswa
                  </SubmitButton>
                ) : (
                  <SubmitButton name="aktif" value="true">
                    Aktifkan kembali
                  </SubmitButton>
                )}
              </ActionForm>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
