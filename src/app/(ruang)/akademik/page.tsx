import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { ajukanPresensi, simpanSesi } from "@/app/actions/akademik";
import { AcademicTabs, AttendanceBadge, fmtPercent, requirePart, SessionFields, SessionStatusBadge } from "@/components/akademik";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { monthLabel } from "@/components/report-document";
import { Icon } from "@/components/icon";
import { Badge, Empty, Notice, PageHead } from "@/components/ui";
import { disciplineLabel, SESSION_TYPE_LABEL } from "@/lib/core/akademik";
import { formatDate } from "@/lib/format";
import { loadSchedule, type FamilyAttendance, type MySession, type SessionCard } from "@/lib/server/akademik";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Presensi" };

type Search = Promise<Record<string, string | string[] | undefined>>;

function shiftDay(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function SchedulePage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor();
  requirePart(actor, "presensi");
  const params = await searchParams;
  const data = await loadSchedule(actor, params.tanggal);

  if (data.kind === "family") {
    return (
      <div className="page">
        <PageHead eyebrow="Kehadiran" title="Presensi" description={actor.user.peran === "WALI" ? "Kehadiran anak yang ditautkan ke akun Anda." : "Ajukan kehadiran saat sesi dibuka dan lihat rekap bulan ini."} />
        <AcademicTabs actor={actor} current="presensi" />
        {data.family.length === 0 ? <Empty title="Belum tertaut">Minta admin menautkan data siswa ke akun Anda.</Empty> : null}
        {data.family.map((item) => (
          <FamilyAttendanceView key={item.student.siswa_id} item={item} canSubmit={actor.user.peran === "SISWA"} showName={actor.user.peran === "WALI"} />
        ))}
      </div>
    );
  }

  const { date, clock } = data;
  return (
    <div className="page">
      <PageHead
        eyebrow="Kehadiran"
        title="Presensi"
        description="Buka sesi pada harinya, tampilkan QR atau catat kehadiran, lalu tutup sesi. Siswa tanpa catatan dihitung alfa."
        actions={
          <a className="btn btn-secondary" href={`/akademik/ekspor-presensi?bulan=${date.slice(0, 7)}`}>
            Ekspor CSV {monthLabel(date.slice(0, 7))}
          </a>
        }
      />
      <AcademicTabs actor={actor} current="presensi" />
      <form method="get" className="day-nav" aria-label="Pilih tanggal">
        <Link className="btn btn-secondary btn-sm" href={`/akademik?tanggal=${shiftDay(date, -1)}`} aria-label="Hari sebelumnya">
          ←
        </Link>
        <input type="date" name="tanggal" defaultValue={date} aria-label="Tanggal" />
        <button type="submit" className="btn btn-secondary btn-sm">
          Tampilkan
        </button>
        <Link className="btn btn-secondary btn-sm" href={`/akademik?tanggal=${shiftDay(date, 1)}`} aria-label="Hari berikutnya">
          →
        </Link>
        {date !== clock.today ? (
          <Link className="btn btn-ghost btn-sm" href="/akademik">
            Hari ini
          </Link>
        ) : null}
      </form>
      <div className="grid-main">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <div>
                <h2>{date === clock.today ? "Sesi hari ini" : `Sesi ${formatDate(date, "long")}`}</h2>
                <p>{formatDate(date, "long")}</p>
              </div>
              <Badge>{data.sessions.length}</Badge>
            </div>
            {data.sessions.length === 0 ? <Empty title="Tidak ada sesi">Buat sesi baru dengan form di samping.</Empty> : <SessionList sessions={data.sessions} />}
          </section>
          {data.upcoming.length ? (
            <section className="card">
              <div className="card-head">
                <h2>Akan datang</h2>
              </div>
              <SessionList sessions={data.upcoming} withDate />
            </section>
          ) : null}
        </div>
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Buat sesi</h2>
              <p>Pilih semua siswa aktif, atau satu kelas bila ada. Peserta dibekukan saat sesi dibuka.</p>
            </div>
          </div>
          {actor.user.peran === "PENGAJAR" && data.classes.length === 0 ? (
            <Notice>Belum ada kelas yang ditautkan ke akun Anda.</Notice>
          ) : (
            <ActionForm action={simpanSesi} operationId={randomUUID()} className="stack">
              <SessionFields classes={data.classes} teachers={data.teachers} date={date} />
              <div className="form-actions">
                <SubmitButton>Simpan sesi</SubmitButton>
              </div>
            </ActionForm>
          )}
        </section>
      </div>
    </div>
  );
}

function SessionList({ sessions, withDate = false }: { sessions: SessionCard[]; withDate?: boolean }) {
  return (
    <div className="item-list">
      {sessions.map((s) => (
        <div className="item" key={s.sesi_id}>
          <div className="item-main">
            <Link href={`/akademik/sesi/${s.sesi_id}`} className="cell-title">
              {withDate ? `${formatDate(s.tanggal)} · ` : ""}
              {s.jam_mulai}–{s.jam_selesai} · {s.nama}
            </Link>
            <span className="cell-sub">
              {s.kelas} · {SESSION_TYPE_LABEL[s.jenis]} · {s.pengajar}
            </span>
          </div>
          <div className="row">
            {s.menunggu ? <Badge tone="warning">{s.menunggu} menunggu</Badge> : null}
            {s.status !== "AKAN_DATANG" ? (
              <Badge tone="info">
                {s.hadir}/{s.peserta} hadir
              </Badge>
            ) : (
              <Badge>{s.peserta} siswa</Badge>
            )}
            <SessionStatusBadge status={s.status} />
          </div>
        </div>
      ))}
    </div>
  );
}

function FamilyAttendanceView({ item, canSubmit, showName }: { item: FamilyAttendance; canSubmit: boolean; showName: boolean }) {
  const { summary } = item;
  return (
    <>
      {showName ? <h2 className="section-title">{item.student.nama}</h2> : null}
      <section className="card">
        <div className="card-head">
          <h2>Hari ini</h2>
        </div>
        {item.today.length === 0 ? <Empty title="Tidak ada sesi hari ini" /> : item.today.map((s) => <TodaySession key={s.sesi_id} session={s} canSubmit={canSubmit} />)}
      </section>
      <div className="grid-stats compact">
        <section className="card stat">
          <span className="stat-label">Kehadiran bulan ini</span>
          <span className="stat-value">{fmtPercent(summary.persen)}</span>
          <span className="stat-sub">{disciplineLabel(summary.persen)}</span>
        </section>
        <section className="card stat">
          <span className="stat-label">Hadir</span>
          <span className="stat-value">
            {summary.hadir}
            <small>/ {summary.total}</small>
          </span>
          <span className="stat-sub">{summary.terlambat}× terlambat</span>
        </section>
        <section className="card stat">
          <span className="stat-label">Izin · Sakit · Alfa</span>
          <span className="stat-value">
            {summary.izin}·{summary.sakit}·{summary.alfa}
          </span>
          <span className="stat-sub">Tanpa catatan = alfa</span>
        </section>
      </div>
      <section className="card">
        <div className="card-head">
          <h2>Riwayat</h2>
        </div>
        {item.history.length === 0 ? (
          <Empty title="Belum ada sesi selesai" />
        ) : (
          <div className="item-list">
            {item.history.map((s) => (
              <div className="item" key={s.sesi_id}>
                <div className="item-main">
                  <b>{s.nama}</b>
                  <span className="cell-sub">
                    {formatDate(s.tanggal)} · {s.jam_mulai} · {s.kelas}
                  </span>
                </div>
                <AttendanceBadge status={s.record && s.record.status !== "KOSONG" ? s.record.status : "ALFA"} late={s.record?.terlambat} />
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function TodaySession({ session, canSubmit }: { session: MySession; canSubmit: boolean }) {
  const record = session.record && session.record.status !== "KOSONG" ? session.record : null;
  return (
    <div className="item">
      <div className="item-main">
        <b>
          {session.jam_mulai}–{session.jam_selesai} · {session.nama}
        </b>
        <span className="cell-sub">
          {session.kelas} · {SESSION_TYPE_LABEL[session.jenis]}
        </span>
      </div>
      {record ? (
        <AttendanceBadge status={record.status} late={record.terlambat} />
      ) : session.status === "AKTIF" ? (
        <Badge tone="success">Dibuka</Badge>
      ) : (
        <SessionStatusBadge status={session.status} />
      )}
      {record?.status === "MENUNGGU" ? <p className="item-edit muted">Menunggu pengesahan pengajar.</p> : null}
      {canSubmit && !record && session.status === "AKTIF" ? (
        <ActionForm action={ajukanPresensi} operationId={randomUUID()} className="item-edit form-grid three">
          <input type="hidden" name="sesi_id" value={session.sesi_id} />
          <Field
            label="Status"
            name="status_diajukan"
            type="select"
            defaultValue="HADIR"
            options={[
              { value: "HADIR", label: "Hadir" },
              { value: "IZIN", label: "Izin" },
              { value: "SAKIT", label: "Sakit" },
            ]}
          />
          <Field label="Keterangan" name="catatan" placeholder="Wajib untuk izin/sakit" />
          <div className="form-actions">
            <SubmitButton pendingLabel="Mengirim…">
              <Icon name="check" />
              Ajukan
            </SubmitButton>
          </div>
        </ActionForm>
      ) : null}
    </div>
  );
}
