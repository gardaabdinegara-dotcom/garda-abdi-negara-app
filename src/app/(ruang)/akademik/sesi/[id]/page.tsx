import type { Metadata } from "next";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { catatPresensi, hapusSesi, sahkanPresensi, simpanSesi, ubahStatusSesi } from "@/app/actions/akademik";
import { AttendanceBadge, SessionFields, SessionStatusBadge } from "@/components/akademik";
import { AutoRefresh } from "@/components/akademik-client";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { Badge, Empty, Notice, PageHead } from "@/components/ui";
import { createQrToken, QR_MINUTES } from "@/lib/auth/qr";
import { ATTENDANCE_LABEL, METHOD_LABEL, SESSION_TYPE_LABEL, TEACHER_MARKS, type SessionStatus } from "@/lib/core/akademik";
import { formatDate } from "@/lib/format";
import { loadSessionDetail } from "@/lib/server/akademik";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Sesi" };

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "127.0.0.1:3020";
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  return `${h.get("x-forwarded-proto") ?? (local ? "http" : "https")}://${host}`;
}

function StatusButton({ sesiId, status, label, variant = "primary", confirm }: { sesiId: string; status: SessionStatus; label: string; variant?: "primary" | "secondary" | "danger"; confirm?: string }) {
  return (
    <ActionForm action={ubahStatusSesi} operationId={randomUUID()} confirm={confirm}>
      <input type="hidden" name="sesi_id" value={sesiId} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant={variant} pendingLabel="Memproses…">
        {label}
      </SubmitButton>
    </ActionForm>
  );
}

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor({ roles: ["OWNER", "ADMIN", "PENGAJAR"] });
  const { id } = await params;
  const data = await loadSessionDetail(actor, decodeURIComponent(id));
  const { session, clock, canManage } = data;
  const isToday = session.tanggal === clock.today;
  const isAdmin = actor.user.peran === "OWNER" || actor.user.peran === "ADMIN";
  const marked = data.roster.filter((r) => r.record && r.record.status !== "KOSONG" && r.record.status !== "MENUNGGU").length;

  let qr: { image: string; expires: string } | null = null;
  if (canManage && session.status === "AKTIF") {
    const { token, expires } = createQrToken(session.sesi_id);
    const url = `${await origin()}/qr-presensi?t=${encodeURIComponent(token)}`;
    const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1f3329", light: "#ffffff" } });
    qr = {
      image: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
      expires: new Intl.DateTimeFormat("id-ID", { timeZone: clock.settings.zona_waktu, hour: "2-digit", minute: "2-digit" }).format(expires),
    };
  }

  return (
    <div className="page">
      {session.status === "AKTIF" ? <AutoRefresh seconds={60} /> : null}
      <PageHead
        back={{ href: `/akademik?tanggal=${session.tanggal}`, label: "Jadwal & presensi" }}
        eyebrow={`${formatDate(session.tanggal, "long")} · ${session.jam_mulai}–${session.jam_selesai}`}
        title={session.nama}
        description={`${data.kelas} · ${SESSION_TYPE_LABEL[session.jenis]} · Pengajar: ${data.pengajar}`}
        actions={<SessionStatusBadge status={session.status} />}
      />

      {canManage ? (
        <div className="row">
          {session.status === "AKAN_DATANG" ? (
            isToday ? (
              <StatusButton sesiId={session.sesi_id} status="AKTIF" label="Buka sesi" />
            ) : (
              <Notice>Sesi bisa dibuka pada {formatDate(session.tanggal, "long")}.</Notice>
            )
          ) : null}
          {session.status === "AKTIF" ? (
            <StatusButton sesiId={session.sesi_id} status="SELESAI" label="Tutup sesi" confirm="Tutup sesi? Siswa tanpa catatan akan dihitung alfa." />
          ) : null}
          {session.status === "SELESAI" && isToday ? <StatusButton sesiId={session.sesi_id} status="AKTIF" label="Buka kembali untuk koreksi" variant="secondary" /> : null}
          {session.status === "AKAN_DATANG" || session.status === "AKTIF" || (session.status === "SELESAI" && isAdmin) ? (
            <StatusButton sesiId={session.sesi_id} status="DIBATALKAN" label="Batalkan sesi" variant="danger" confirm="Batalkan sesi ini? Sesi batal tidak dihitung dalam rekap; catatan kehadirannya tetap tersimpan." />
          ) : null}
          {isAdmin ? (
            <ActionForm action={hapusSesi} operationId={randomUUID()} confirm={`Hapus sesi "${session.nama}"? Sesi dan catatan kehadirannya hilang dari aplikasi dan rekap.`}>
              <input type="hidden" name="sesi_id" value={session.sesi_id} />
              <input type="hidden" name="tanggal" value={session.tanggal} />
              <SubmitButton variant="ghost" pendingLabel="Menghapus…">
                Hapus sesi
              </SubmitButton>
            </ActionForm>
          ) : null}
          {session.status === "DIBATALKAN" && isAdmin && session.peserta_ids.length ? (
            <StatusButton sesiId={session.sesi_id} status="SELESAI" label="Pulihkan sebagai selesai" variant="secondary" />
          ) : session.status === "DIBATALKAN" ? (
            <StatusButton sesiId={session.sesi_id} status="AKAN_DATANG" label="Jadwalkan ulang" variant="secondary" />
          ) : null}
        </div>
      ) : (
        <Notice>Sesi ini milik pengajar lain; Anda hanya dapat melihatnya.</Notice>
      )}

      <div className="grid-main">
        <div className="stack">
          {data.pending.length ? (
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Pengajuan menunggu</h2>
                  <p>Sahkan atau tolak sebelum menutup sesi. Pengajuan yang ditolak bisa diajukan ulang oleh siswa.</p>
                </div>
                {canManage ? (
                  <ActionForm action={sahkanPresensi} operationId={randomUUID()} feedback={false}>
                    <input type="hidden" name="sesi_id" value={session.sesi_id} />
                    <SubmitButton size="sm">Sahkan semua ({data.pending.length})</SubmitButton>
                  </ActionForm>
                ) : null}
              </div>
              <div className="item-list">
                {data.pending.map(({ student, record }) => (
                  <div className="item" key={student.siswa_id}>
                    <div className="item-main">
                      <b>{student.nama}</b>
                      <span className="cell-sub">
                        Mengajukan {record!.status_diajukan ? ATTENDANCE_LABEL[record!.status_diajukan] : "Hadir"} · {record!.waktu} · {METHOD_LABEL[record!.metode] ?? record!.metode}
                        {record!.terlambat ? " · terlambat" : ""}
                        {record!.catatan ? ` · “${record!.catatan}”` : ""}
                      </span>
                    </div>
                    {canManage ? (
                      <div className="row">
                        <ActionForm action={sahkanPresensi} operationId={randomUUID()}>
                          <input type="hidden" name="sesi_id" value={session.sesi_id} />
                          <input type="hidden" name="siswa_id" value={student.siswa_id} />
                          <SubmitButton size="sm">Sahkan</SubmitButton>
                        </ActionForm>
                        <ActionForm action={catatPresensi} operationId={randomUUID()} confirm={`Tolak pengajuan ${student.nama}?`}>
                          <input type="hidden" name="sesi_id" value={session.sesi_id} />
                          <input type="hidden" name="siswa_id" value={student.siswa_id} />
                          <input type="hidden" name="status" value="KOSONG" />
                          <SubmitButton size="sm" variant="ghost">
                            Tolak
                          </SubmitButton>
                        </ActionForm>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="card">
            <div className="card-head">
              <div>
                <h2>Daftar hadir</h2>
                <p>
                  {data.roster.length} peserta · {marked} sudah tercatat
                  {session.peserta_ids.length ? " · daftar peserta sudah dibekukan" : ""}
                </p>
              </div>
            </div>
            {data.roster.length === 0 ? (
              <Empty title="Belum ada peserta">Daftarkan siswa ke kelas ini dari halaman profil siswa.</Empty>
            ) : (
              <div className="item-list">
                {data.roster.map(({ student, record }) => {
                  const status = record?.status ?? "KOSONG";
                  const shown = session.status === "SELESAI" && status === "KOSONG" ? "ALFA" : status;
                  return (
                    <div className="item" key={student.siswa_id}>
                      <div className="item-main">
                        <b>{student.nama}</b>
                        <span className="cell-sub">
                          {student.kode_siswa}
                          {record?.waktu ? ` · ${record.waktu}` : ""}
                          {record?.metode ? ` · ${METHOD_LABEL[record.metode] ?? record.metode}` : ""}
                          {record?.catatan ? ` · “${record.catatan}”` : ""}
                        </span>
                      </div>
                      <AttendanceBadge status={shown} late={record?.terlambat} />
                      {canManage && session.status !== "DIBATALKAN" && session.tanggal <= clock.today ? (
                        <details className="details-edit item-edit">
                          <summary className="btn btn-ghost btn-sm">Catat / ubah</summary>
                          <ActionForm action={catatPresensi} operationId={randomUUID()} className="form-grid three">
                            <input type="hidden" name="sesi_id" value={session.sesi_id} />
                            <input type="hidden" name="siswa_id" value={student.siswa_id} />
                            <Field
                              label="Status"
                              name="status"
                              type="select"
                              defaultValue={status === "MENUNGGU" || status === "KOSONG" ? "HADIR" : status}
                              options={TEACHER_MARKS.map((m) => ({ value: m, label: m === "KOSONG" ? "Kosongkan" : ATTENDANCE_LABEL[m] }))}
                            />
                            <Field label="Jam masuk" name="waktu" type="time" defaultValue={record?.waktu || (isToday ? clock.now : session.jam_mulai)} />
                            <Field label="Keterangan" name="catatan" defaultValue={record?.catatan} />
                            <div className="form-actions">
                              <SubmitButton size="sm">Simpan</SubmitButton>
                            </div>
                          </ActionForm>
                        </details>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="stack">
          {qr ? (
            <section className="card qr-card">
              <div className="card-head">
                <div>
                  <h2>QR presensi</h2>
                  <p>Siswa memindai dengan kamera ponsel lalu menekan “Ajukan hadir”. Berlaku {QR_MINUTES} menit dan diperbarui otomatis.</p>
                </div>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr.image} alt="Kode QR presensi sesi ini" width={260} height={260} className="qr-image" />
              <p className="muted">Berlaku sampai pukul {qr.expires}.</p>
            </section>
          ) : null}
          <section className="card">
            <div className="card-head">
              <h2>Ringkasan</h2>
            </div>
            <div className="row">
              {(["HADIR", "IZIN", "SAKIT", "ALFA", "MENUNGGU"] as const).map((s) => {
                const count = data.roster.filter((r) => (r.record?.status ?? (session.status === "SELESAI" ? "ALFA" : "KOSONG")) === s).length;
                return (
                  <Badge key={s} tone={s === "HADIR" ? "success" : s === "ALFA" ? "danger" : s === "MENUNGGU" ? "warning" : "info"}>
                    {ATTENDANCE_LABEL[s]} {count}
                  </Badge>
                );
              })}
            </div>
            <p className="muted">Toleransi terlambat {clock.settings.toleransi} menit dari jam mulai.</p>
          </section>
          {canManage && (session.status === "AKAN_DATANG" || session.status === "AKTIF" || (session.status === "SELESAI" && isAdmin)) ? (
            <section className="card">
              <details className="details-edit">
                <summary className="btn btn-ghost btn-sm">Ubah detail sesi</summary>
                <ActionForm action={simpanSesi} operationId={randomUUID()} className="stack">
                  <input type="hidden" name="sesi_id" value={session.sesi_id} />
                  <SessionFields classes={data.classes} teachers={data.teachers} session={session} date={session.tanggal} />
                  <div className="form-actions">
                    <SubmitButton>Simpan perubahan</SubmitButton>
                  </div>
                </ActionForm>
              </details>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
