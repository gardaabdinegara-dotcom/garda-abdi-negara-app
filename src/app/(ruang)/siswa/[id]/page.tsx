import type { Metadata } from "next";
import Link from "next/link";
import { createHash, randomUUID } from "node:crypto";
import { hapusSiswa, tambahPendaftaran, ubahStatusPendaftaran, ubahStatusSiswa } from "@/app/actions/siswa";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { EnrollmentSetup } from "@/components/enrollment-setup";
import { Icon, type IconName } from "@/components/icon";
import { PembayaranSiswaCard } from "@/components/pembayaran-siswa";
import { UbahDataLembar, UbahDataTombol } from "@/components/siswa-profil";
import { StudentFields } from "@/components/student-fields";
import { ActiveBadge, Badge, Empty, EnrollmentBadge, Notice } from "@/components/ui";
import { WaTombol } from "@/components/wa";
import { ENROLLMENT_LABEL, ENROLLMENT_STATUS, ROLE_LABEL } from "@/lib/core/types";
import { formatDate, formatPhone, initials, todayISO } from "@/lib/format";
import { loadStudentAcademic } from "@/lib/server/akademik";
import { loadStudentBills, loadTariffs } from "@/lib/server/keuangan";
import { InvoiceBadge, rp } from "@/components/keuangan";
import { loadCatalog, loadSettings, loadStudentProfile } from "@/lib/server/queries";
import { fmtNumber, fmtPercent } from "@/components/akademik";
import { monthLabel } from "@/components/report-document";
import { disciplineLabel } from "@/lib/core/akademik";
import { FITUR } from "@/lib/core/fitur";
import { canManageSamapta } from "@/lib/core/samapta";
import { nomorWa } from "@/lib/core/wa";
import { loadSamaptaStudent } from "@/lib/server/samapta";
import { loadRingkasLatihanSiswa } from "@/lib/server/latihan";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Profil siswa" };

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/** "Tes Samapta II" → "Samapta II" agar muat di kotak ringkasan. */
const pendekTes = (nama: string) => nama.replace(/^Tes\s+/i, "");

function LinkRow({ href, icon, tone, title, sub }: { href: string; icon: IconName; tone: "green" | "blue" | "gold" | "violet" | "red"; title: string; sub?: string }) {
  return (
    <Link href={href} className="sp-lk">
      <span className={`tone-box small tone-${tone}`}>
        <Icon name={icon} />
      </span>
      <span>
        {title}
        {sub ? <small>{sub}</small> : null}
      </span>
      <Icon name="back" />
    </Link>
  );
}

export default async function StudentPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const actor = await requireActor();
  const { id } = await params;
  const search = await searchParams;
  const [profile, catalog, settings] = await Promise.all([loadStudentProfile(actor, decodeURIComponent(id)), loadCatalog(), loadSettings()]);
  const { student, enrollments, accounts, canManage } = profile;
  const [academic, bills, money, samapta, latihan] = await Promise.all([
    loadStudentAcademic(actor, student.siswa_id),
    FITUR.tagihan ? loadStudentBills(actor, student.siswa_id) : Promise.resolve(null),
    canManage && FITUR.tagihan ? loadTariffs(actor) : Promise.resolve(null),
    canManageSamapta(actor) ? loadSamaptaStudent(actor, student.siswa_id) : Promise.resolve(null),
    loadRingkasLatihanSiswa(actor, student.siswa_id),
  ]);
  const lastTest = samapta?.history.at(-1) ?? null;
  const programs = new Map(catalog.programs.map((p) => [p.program_id, p.nama_program]));
  const classes = new Map(catalog.classes.map((c) => [c.kelas_id, c]));
  const today = todayISO(settings.zona_waktu);
  const activePrograms = catalog.programs.filter((p) => p.aktif);
  const activeClasses = catalog.classes.filter((c) => c.aktif);
  // Program & kelas tidak dipakai lembaga saat ini: kartu pendaftaran hanya tampil bila memang ada datanya.
  const showEnrollment = enrollments.length > 0 || activeClasses.length > 0;
  const back = canManage || actor.user.peran === "PENGAJAR" ? { href: "/siswa", label: "Siswa" } : { href: "/beranda", label: "Beranda" };
  const waSiswa = nomorWa(student.no_wa);
  const waWali = nomorWa(student.no_wa_wali);
  const sapaan = student.nama.split(/\s+/)[0] ?? student.nama;
  const lahir = [student.tempat_lahir, student.tanggal_lahir ? formatDate(student.tanggal_lahir, "long") : ""].filter(Boolean).join(", ");

  return (
    <div className="page">
      <p className="crumbs">
        <Link href={back.href}>← {back.label}</Link>
      </p>
      {search.baru ? (
        <Notice tone="success">
          Siswa tersimpan dengan kode {student.kode_siswa}.
          {search.tagihan ? " Pendaftaran, ketentuan biaya, dan tagihan pertama juga sudah dibuat." : enrollments.length ? " Pendaftaran program juga sudah dibuat." : " Akun siswanya juga sudah dibuat."}
        </Notice>
      ) : null}

      <section className="card sp-kepala" aria-label="Profil siswa">
        <div className="sp-prof">
          <span className="sp-av" aria-hidden="true">
            {initials(student.nama)}
          </span>
          <div>
            <code className="sp-kode">{student.kode_siswa}</code>
            <h1 className="sp-nama">{student.nama}</h1>
            <div className="row sp-pills">
              {student.jalur_target ? <Badge tone="info">{student.jalur_target}</Badge> : null}
              <ActiveBadge active={student.aktif} />
            </div>
          </div>
        </div>
        {canManage ? (
          <div className="sp-qa">
            <WaTombol nomor={waSiswa} pesan={`Assalamualaikum ${sapaan}, `} label="WA siswa" ukuran="md" judul={`Buka WhatsApp ${student.nama}`} />
            {waWali ? (
              <WaTombol nomor={waWali} pesan="Assalamualaikum Bapak/Ibu, " label="WA wali" ukuran="md" judul={`Buka WhatsApp wali ${student.nama}`} />
            ) : (
              <UbahDataTombol label="Isi nomor wali" variant="secondary" />
            )}
            <UbahDataTombol />
          </div>
        ) : null}
      </section>
      {canManage ? (
        <UbahDataLembar siswaId={student.siswa_id} judul={`${student.nama} · ${student.kode_siswa}`} operationId={randomUUID()} versi={createHash("sha1").update(JSON.stringify(student)).digest("hex").slice(0, 12)}>
          <StudentFields student={student} today={today} />
        </UbahDataLembar>
      ) : null}

      <div className="sp-grid">
        <div className="stack">
          <span className="sp-eyebrow">Ringkasan {monthLabel(academic.clock.periode)}</span>
          <div className="sp-tiles">
            <div className="sp-tile">
              <span className="sp-k">Kehadiran</span>
              <b>{fmtPercent(academic.summary.persen)}</b>
              <span>
                {academic.summary.total ? `${academic.summary.hadir} dari ${academic.summary.total} sesi · ${disciplineLabel(academic.summary.persen)}` : "Belum ada sesi selesai"}
              </span>
            </div>
            {samapta ? (
              lastTest ? (
                <Link className="sp-tile" href={`/samapta/${lastTest.test.tes_id}/siswa/${student.siswa_id}`}>
                  <span className="sp-k">{pendekTes(lastTest.test.nama)}</span>
                  <b>{lastTest.entry.score.akhir != null ? fmtNumber(lastTest.entry.score.akhir, 2) : "-"}</b>
                  <span>{lastTest.entry.score.klas ? <Badge tone="success">{lastTest.entry.score.klas}</Badge> : "Belum lengkap"}</span>
                </Link>
              ) : (
                <div className="sp-tile">
                  <span className="sp-k">Tes Samapta</span>
                  <b>-</b>
                  <span>Belum ikut tes</span>
                </div>
              )
            ) : null}
            {latihan ? (
              <Link className="sp-tile" href={latihan.href}>
                <span className="sp-k">Latihan</span>
                <b>{latihan.total}×</b>
                <span>{latihan.terakhir ? `skor terakhir ${latihan.terakhir.skor}` : "Belum pernah latihan"}</span>
              </Link>
            ) : null}
            {FITUR.nilai ? (
              <div className="sp-tile">
                <span className="sp-k">SKD terakhir</span>
                <b>{academic.skd ? fmtNumber(academic.skd.total, 0) : "-"}</b>
                <span>{academic.skd ? (academic.skd.pass ? "Memenuhi acuan" : "Di bawah acuan") : "Belum ada tes"}</span>
              </div>
            ) : null}
          </div>

          {canManage ? <PembayaranSiswaCard siswaId={student.siswa_id} /> : null}

          <section className="card sp-data">
            <div className="card-head">
              <div>
                <h2>Data siswa</h2>
                <p>Terdaftar sejak {formatDate(student.tanggal_daftar, "long")}.</p>
              </div>
              {canManage ? <UbahDataTombol label="Ubah" variant="ghost" /> : null}
            </div>
            <dl>
              <dt>Jenis kelamin</dt>
              <dd>{student.jenis_kelamin === "P" ? "Perempuan" : student.jenis_kelamin === "L" ? "Laki-laki" : "-"}</dd>
              <dt>Tempat, tgl lahir</dt>
              <dd className={lahir ? undefined : "is-kosong"}>{lahir || "Belum diisi"}</dd>
              <dt>Asal sekolah</dt>
              <dd className={student.asal_sekolah ? undefined : "is-kosong"}>{student.asal_sekolah || "Belum diisi"}</dd>
              <dt>WA siswa</dt>
              <dd className={student.no_wa ? "n" : "is-kosong"}>{student.no_wa ? formatPhone(student.no_wa) : "Belum diisi"}</dd>
              <dt>Wali</dt>
              <dd className={student.nama_wali || student.no_wa_wali ? undefined : "is-kosong"}>
                {student.nama_wali || student.no_wa_wali ? [student.nama_wali, student.no_wa_wali ? formatPhone(student.no_wa_wali) : ""].filter(Boolean).join(" · ") : "Belum diisi"}
              </dd>
              {canManage && student.catatan ? (
                <>
                  <dt>Catatan</dt>
                  <dd>{student.catatan}</dd>
                </>
              ) : null}
            </dl>
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

          {showEnrollment ? (
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
              {canManage && student.aktif && activePrograms.length > 0 ? (
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
              ) : null}
            </section>
          ) : null}
        </div>

        <div className="stack">
          {lastTest || latihan || (academic.staff && FITUR.nilai) || FITUR.rapor || canManage ? (
            <section className="card sp-links" aria-label="Tautan siswa">
              {lastTest ? <LinkRow href={`/samapta/${lastTest.test.tes_id}/siswa/${student.siswa_id}`} icon="run" tone="green" title="Hasil Tes Samapta" sub={lastTest.test.nama} /> : null}
              {latihan ? <LinkRow href={latihan.href} icon="target" tone="blue" title="Progres latihan" sub={latihan.terakhir ? `${latihan.mingguIni} kali minggu ini` : "Belum pernah latihan"} /> : null}
              {academic.staff && FITUR.nilai ? <LinkRow href={`/akademik/nilai?siswa=${student.siswa_id}`} icon="chart" tone="violet" title="Nilai & tes" /> : null}
              {FITUR.rapor ? (
                <LinkRow href={`/akademik/rapor/${student.siswa_id}?periode=${academic.latestReport?.periode ?? academic.clock.periode}`} icon="file" tone="violet" title="Rapor" sub={academic.latestReport ? `Versi ${academic.latestReport.versi}` : "Belum terbit"} />
              ) : null}
              {canManage
                ? accounts.map(({ link, user }) => (
                    <LinkRow
                      key={link.tautan_id}
                      href={`/pengaturan/akun/${user.user_id}`}
                      icon="user"
                      tone="gold"
                      title={user.peran === "SISWA" ? "Akun siswa" : `Akun ${ROLE_LABEL[user.peran].toLowerCase()}`}
                      sub={`@${user.username} · ${!user.aktif ? "nonaktif" : user.peran === "SISWA" ? (user.punya_kredensial ? "PIN aktif" : "PIN belum dibuat") : ROLE_LABEL[user.peran]}`}
                    />
                  ))
                : null}
              {canManage && accounts.length === 0 ? <LinkRow href="/pengaturan/akun" icon="user" tone="gold" title="Belum ada akun tertaut" sub="Buat atau tautkan di Pengaturan → Akun" /> : null}
              {canManage ? (
                <details className="sp-bahaya">
                  <summary className="sp-lk">
                    <span className="tone-box small tone-red">
                      <Icon name="shield" />
                    </span>
                    <span>
                      Nonaktifkan atau hapus
                      <small>{student.aktif ? "Siswa nonaktif tidak dihitung dalam kapasitas" : "Siswa sedang nonaktif"}</small>
                    </span>
                    <Icon name="back" />
                  </summary>
                  <div className="sp-bahaya-in">
                    <div>
                      <p>
                        {student.aktif
                          ? "Siswa nonaktif tidak dihitung dalam kapasitas. Data dan riwayatnya tetap tersimpan."
                          : "Mengaktifkan kembali akan memakai satu slot kapasitas."}
                      </p>
                      <ActionForm action={ubahStatusSiswa} operationId={randomUUID()} confirm={student.aktif ? `Nonaktifkan ${student.nama}?` : undefined}>
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
                    </div>
                    <div>
                      <p>Untuk data yang salah input. Siswa dan akun loginnya hilang dari aplikasi; riwayat lama tetap aman di spreadsheet.</p>
                      <ActionForm action={hapusSiswa} operationId={randomUUID()} confirm={`Hapus ${student.nama} (${student.kode_siswa})? Siswa tidak akan muncul lagi di aplikasi.`}>
                        <input type="hidden" name="siswa_id" value={student.siswa_id} />
                        <SubmitButton variant="danger" pendingLabel="Menghapus…">
                          Hapus siswa
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  </div>
                </details>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
