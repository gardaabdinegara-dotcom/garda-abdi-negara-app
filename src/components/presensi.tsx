// Layar Presensi (opsi A "Layar hari ini"): bagian yang dirender di server.
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { Fragment } from "react";
import { DISCIPLINE, SESSION_TYPE_LABEL, type AttendanceStatus, type SessionStatus } from "@/lib/core/akademik";
import type { ClassGroup } from "@/lib/core/types";
import { initials } from "@/lib/format";
import type { Clock, FamilyAttendance, MonthlyRecap, MySession, SessionCard, SessionWorkspace } from "@/lib/server/akademik";
import type { PresensiQr } from "@/lib/server/qr-presensi";
import { SessionFields } from "./akademik";
import { CreateSession, HeroActions, LiveCounters, PendingCard, PresensiLive, RosterCard, StudentActions, type RosterItem, type SessionMeta } from "./presensi-client";
import { addMinutes, dayBadge, fmtTime, longDay, monthName, nowTime, pct, relativeDay, shiftDay, shiftMonth, shortDate, shortName, timeRange, toMinutesSafe } from "./presensi-format";
import { PrIcon } from "./presensi-icons";

export type PresensiTab = "hari" | "jadwal" | "rekap";

const TAB_HREF: Record<PresensiTab, string> = { hari: "/akademik", jadwal: "/akademik?tab=jadwal", rekap: "/akademik?tab=rekap" };

/** Judul satu baris, tab Hari ini · Jadwal · Rekap, dan tombol Buat sesi. */
export function PresensiHead({ tab, create }: { tab?: PresensiTab; create?: React.ReactNode }) {
  return (
    <header className={`pr-top${tab ? "" : " pr-top-solo"}`}>
      <h1>Presensi</h1>
      {tab ? (
        <nav className="pr-seg pr-tabs" aria-label="Bagian presensi">
          {(["hari", "jadwal", "rekap"] as const).map((key) => (
            <Link key={key} href={TAB_HREF[key]} aria-current={tab === key ? "page" : undefined} scroll={false}>
              {key === "hari" ? "Hari ini" : key === "jadwal" ? "Jadwal" : "Rekap"}
            </Link>
          ))}
        </nav>
      ) : null}
      {create ? <div className="pr-top-act">{create}</div> : null}
    </header>
  );
}

/** Tombol + lembar Buat sesi. Isian sama dengan form lama (nama, tanggal, jam, bidang, peserta, pengajar). */
export function CreateSessionButton({ classes, teachers, date }: { classes: ClassGroup[]; teachers: { user_id: string; nama: string }[]; date: string }) {
  return (
    <CreateSession operationId={randomUUID()}>
      <SessionFields classes={classes} teachers={teachers} date={date} />
    </CreateSession>
  );
}

// ---------------------------------------------------------------- Strip sesi hari ini

function stripLabel(s: SessionCard, today: string): string {
  const time = fmtTime(s.jam_mulai);
  if (s.tanggal !== today) return `${relativeDay(s.tanggal, today)} ${time}`;
  if (s.status === "AKTIF") return `${time} · berjalan`;
  if (s.status === "SELESAI") return `${time} · selesai`;
  if (s.status === "DIBATALKAN") return `${time} · batal`;
  return `${time} · nanti`;
}

export function SessionStrip({ items, selectedId, today }: { items: SessionCard[]; selectedId: string | null; today: string }) {
  if (items.length === 0) return null;
  return (
    <nav className="pr-strip" aria-label="Pilih sesi">
      {items.map((s) => {
        const on = s.sesi_id === selectedId;
        const cls = [on ? "on" : "", s.status === "SELESAI" ? "done" : "", s.status === "DIBATALKAN" ? "off" : ""].filter(Boolean).join(" ");
        return (
          <Link key={s.sesi_id} href={`/akademik?sesi=${encodeURIComponent(s.sesi_id)}`} className={cls || undefined} aria-current={on ? "true" : undefined} title={s.nama} scroll={false}>
            {s.status === "AKTIF" ? <i className="pr-pulse" aria-hidden="true" /> : <PrIcon name={s.status === "SELESAI" ? "ok" : s.status === "DIBATALKAN" ? "ban" : "cal"} size="sm" />}
            <span>
              <small className="n">{stripLabel(s, today)}</small>
              <b>{s.nama}</b>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------- Kartu sesi (hero)

function toRosterItems(ws: SessionWorkspace): RosterItem[] {
  return ws.roster.map((r) => ({
    id: r.siswa_id,
    nama: r.nama,
    kode: r.kode_siswa,
    status: (r.record?.status ?? "KOSONG") as AttendanceStatus,
    diajukan: r.record?.status_diajukan ?? "",
    waktu: r.record?.waktu ?? "",
    terlambat: r.record?.terlambat ?? false,
    catatan: r.record?.catatan ?? "",
    metode: r.record?.metode ?? "",
  }));
}

export function metaOf(ws: SessionWorkspace, clock: Clock): SessionMeta {
  const s = ws.session;
  return {
    id: s.sesi_id,
    nama: s.nama,
    status: s.status,
    tanggal: s.tanggal,
    jamMulai: s.jam_mulai,
    jamSelesai: s.jam_selesai,
    editable: s.canManage && s.status !== "DIBATALKAN" && s.tanggal <= clock.today,
    canApprove: s.canManage && s.status === "AKTIF",
    frozen: s.peserta_ids.length > 0,
    toleransi: clock.settings.toleransi,
    zona: clock.settings.zona_waktu,
  };
}

const TAG: Record<SessionStatus, { label: string; cls: string }> = {
  AKTIF: { label: "Berlangsung", cls: "live" },
  AKAN_DATANG: { label: "Akan datang", cls: "soon" },
  SELESAI: { label: "Selesai", cls: "done" },
  DIBATALKAN: { label: "Dibatalkan", cls: "off" },
  DIHAPUS: { label: "Dihapus", cls: "off" },
};

/** "sisa 48 mnt", "mulai 15.30", atau "lewat jam selesai". */
function timeLeft(s: SessionCard, clock: Clock): string {
  if (s.status !== "AKTIF") return "";
  if (s.tanggal !== clock.today) return "belum ditutup";
  const now = toMinutesSafe(clock.now);
  const start = toMinutesSafe(s.jam_mulai);
  const end = toMinutesSafe(s.jam_selesai);
  if (now < start) return `mulai ${fmtTime(s.jam_mulai)}`;
  if (now > end) return "lewat jam selesai";
  const left = end - now;
  return left >= 60 ? `sisa ${Math.floor(left / 60)} j ${left % 60} mnt` : `sisa ${left} mnt`;
}

export function SessionHero({
  ws,
  clock,
  isAdmin,
  editFields,
  qr,
}: {
  ws: SessionWorkspace;
  clock: Clock;
  isAdmin: boolean;
  editFields: React.ReactNode | null;
  qr: PresensiQr | null;
}) {
  const s = ws.session;
  const tag = TAG[s.status];
  const left = timeLeft(s, clock);
  const isToday = s.tanggal === clock.today;
  return (
    <section className={`pr-hero t-${tag.cls}`} aria-label={`Sesi ${s.nama}`}>
      <div className="pr-hhead">
        <span className={`pr-tag ${tag.cls}`}>
          <span className={left ? "pr-ph-only" : undefined}>{tag.label}</span>
          {left ? <span className="pr-dk-only n">{`${tag.label} · ${left.replace("mnt", "menit")}`}</span> : null}
        </span>
        <span className="pr-xs pr-dim n pr-ph-only">
          {timeRange(s.jam_mulai, s.jam_selesai)}
          {left ? ` · ${left}` : isToday ? "" : ` · ${shortDate(s.tanggal)}`}
        </span>
      </div>
      <div>
        <h2 className="pr-ht">{s.nama}</h2>
        <p className="pr-xs pr-dim n pr-hmeta">
          <span className="pr-dk-only">
            {longDay(s.tanggal)} · {timeRange(s.jam_mulai, s.jam_selesai)} ·{" "}
          </span>
          {SESSION_TYPE_LABEL[s.jenis]} · {s.kelas === "Semua siswa" ? "Semua siswa" : `Kelas ${s.kelas}`} · {s.peserta} siswa
          {s.canManage ? null : ` · ${s.pengajar}`}
        </p>
      </div>
      {s.status === "AKTIF" || s.status === "SELESAI" ? (
        <LiveCounters />
      ) : s.status === "AKAN_DATANG" ? (
        <p className="pr-hnote">
          {isToday
            ? "Buka sesi saat kelas mulai. Setelah dibuka, siswa bisa memindai QR atau mengajukan hadir."
            : s.tanggal > clock.today
              ? `Sesi bisa dibuka pada ${longDay(s.tanggal)}.`
              : "Tanggal sesi sudah lewat. Batalkan atau hapus bila tidak jadi."}
        </p>
      ) : (
        <p className="pr-hnote">Sesi dibatalkan dan tidak dihitung dalam rekap.</p>
      )}
      <HeroActions
        isToday={isToday}
        isAdmin={isAdmin}
        canManage={s.canManage}
        qrHref={qr ? `/akademik/sesi/${encodeURIComponent(s.sesi_id)}/qr` : null}
        rotateLabel={qr ? `QR berganti ${fmtTime(nowTime(clock.settings.zona_waktu, new Date(qr.rotatesAt)))}` : undefined}
        editFields={editFields}
        editOperationId={randomUUID()}
        deleteOperationId={randomUUID()}
      />
    </section>
  );
}

/** Seluruh area sesi: kartu sesi + daftar hadir (kiri), pengajuan dan kartu samping (kanan, desktop). */
export function SessionWorkspaceView({
  ws,
  clock,
  isAdmin,
  editFields,
  qr,
  side,
}: {
  ws: SessionWorkspace;
  clock: Clock;
  isAdmin: boolean;
  editFields: React.ReactNode | null;
  qr: PresensiQr | null;
  side?: React.ReactNode;
}) {
  return (
    <PresensiLive key={ws.session.sesi_id} meta={metaOf(ws, clock)} items={toRosterItems(ws)}>
      <div className="pr-dgrid">
        <div className="pr-col">
          <SessionHero ws={ws} clock={clock} isAdmin={isAdmin} editFields={editFields} qr={qr} />
          <PendingCard variant="phone" />
          <RosterCard />
        </div>
        <div className="pr-col pr-side">
          <PendingCard variant="desk" />
          {qr ? <QrMini sesiId={ws.session.sesi_id} qr={qr} clock={clock} isOwner={isAdmin} /> : null}
          {side}
        </div>
      </div>
    </PresensiLive>
  );
}

export function EditSessionFields({ ws, classes, teachers }: { ws: SessionWorkspace; classes: ClassGroup[]; teachers: { user_id: string; nama: string }[] }) {
  return (
    <>
      <input type="hidden" name="sesi_id" value={ws.session.sesi_id} />
      <SessionFields classes={classes} teachers={teachers} session={ws.session} date={ws.session.tanggal} />
    </>
  );
}

// ---------------------------------------------------------------- Kartu samping (desktop)

function QrMini({ sesiId, qr, clock, isOwner }: { sesiId: string; qr: PresensiQr; clock: Clock; isOwner: boolean }) {
  const on = clock.settings.qr_langsung_sah;
  const switchRow = (
    <>
      <span className="pr-small">Pindai QR langsung sah</span>
      <i className={`pr-sw${on ? " on" : ""}`} aria-hidden="true" />
      <span className="sr-only">{on ? "aktif" : "nonaktif"}</span>
    </>
  );
  return (
    <section className="card pr-card pr-qmini" aria-label="QR presensi">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr.image} alt="Kode QR presensi sesi ini" width={92} height={92} className="pr-qr sm" />
      <div className="pr-stack4">
        <b>QR presensi</b>
        <span className="pr-xs pr-muted n">Berganti tiap 10 menit · berikutnya {fmtTime(nowTime(clock.settings.zona_waktu, new Date(qr.rotatesAt)))}</span>
        <Link className="pr-btn sec sm" href={`/akademik/sesi/${encodeURIComponent(sesiId)}/qr`}>
          <PrIcon name="expand" size="sm" />
          Layar penuh
        </Link>
      </div>
      {isOwner ? (
        <Link href="/pengaturan/lembaga" className="pr-swrow" title="Ubah di Pengaturan · Lembaga">
          {switchRow}
        </Link>
      ) : (
        <div className="pr-swrow">{switchRow}</div>
      )}
    </section>
  );
}

function statusPill(s: SessionCard, today: string): { label: string; cls: string } {
  if (s.status === "AKTIF") return { label: "Berlangsung", cls: "o" };
  if (s.status === "SELESAI") return { label: "Selesai", cls: "m" };
  if (s.status === "DIBATALKAN") return { label: "Batal", cls: "r" };
  const badge = dayBadge(s.tanggal, today);
  return { label: badge, cls: s.tanggal === today || badge === "Besok" ? "b" : "m" };
}

function sessionSub(s: SessionCard, today: string): string {
  const when = `${relativeDay(s.tanggal, today)} ${fmtTime(s.jam_mulai)}`;
  if (s.status === "SELESAI" || s.status === "AKTIF") return `${when} · ${s.hadir}/${s.peserta} hadir`;
  return when;
}

export function NearbyCard({ items, today }: { items: SessionCard[]; today: string }) {
  return (
    <section className="card pr-card" aria-label="Jadwal dekat">
      <div className="pr-head">
        <h2>Jadwal dekat</h2>
        <Link className="pr-link" href={TAB_HREF.jadwal}>
          Semua
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="pr-muted pr-xs">Belum ada sesi lain.</p>
      ) : (
        <div className="pr-list pr-tight">
          {items.map((s) => {
            const pill = statusPill(s, today);
            return (
              <Link className="pr-item pr-row-link" key={s.sesi_id} href={`/akademik?sesi=${encodeURIComponent(s.sesi_id)}`} scroll={false}>
                <div className="pr-main">
                  <b>{s.nama}</b>
                  <span className="n">{sessionSub(s, today)}</span>
                </div>
                <span className={`pr-pill ${pill.cls}`}>{pill.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function RecapMini({ recap, today }: { recap: MonthlyRecap; today: string }) {
  const low = recap.rows.filter((r) => r.summary.persen !== null && r.summary.persen < DISCIPLINE.cukup);
  return (
    <section className="card pr-card" aria-label="Rekap bulan ini">
      <div className="pr-head">
        <div>
          <h2>Rekap {monthName(recap.periode, today)}</h2>
          <p className="pr-xs pr-muted">{low.length ? `${low.length} siswa di bawah ${DISCIPLINE.cukup}%` : recap.average === null ? "Belum ada sesi selesai" : `Semua di atas ${DISCIPLINE.cukup}%`}</p>
        </div>
        <Link href={TAB_HREF.rekap} className="pr-big n" aria-label={`Rata-rata ${pct(recap.average)}, buka rekap`}>
          {pct(recap.average)}
        </Link>
      </div>
      {low.length ? (
        <div className="pr-list pr-tight">
          {low.slice(0, 4).map(({ student, summary }) => (
            <div className="pr-item" key={student.siswa_id}>
              <span className="pr-av r">{initials(student.nama)}</span>
              <div className="pr-main">
                <b>{student.nama}</b>
              </div>
              <b className="pr-red n">{pct(summary.persen)}</b>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** Hari tanpa sesi terpilih. */
export function EmptyDay({ next, today, canCreate }: { next: SessionCard[]; today: string; canCreate: boolean }) {
  const upcoming = next.find((s) => s.tanggal >= today);
  return (
    <section className="card pr-card pr-empty">
      <PrIcon name="cal" size="lg" />
      <h2>Tidak ada sesi hari ini</h2>
      <p className="pr-muted">
        {upcoming ? (
          <>
            Berikutnya:{" "}
            <Link href={`/akademik?sesi=${encodeURIComponent(upcoming.sesi_id)}`} scroll={false}>
              {upcoming.nama}
            </Link>
            , {relativeDay(upcoming.tanggal, today).toLowerCase()} {fmtTime(upcoming.jam_mulai)}.
          </>
        ) : canCreate ? (
          "Buat sesi baru lewat tombol Buat sesi."
        ) : (
          "Belum ada jadwal."
        )}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- Tab Jadwal

function ScheduleItem({ s, today }: { s: SessionCard; today: string }) {
  const pill = statusPill(s, today);
  const [, m, d] = s.tanggal.split("-");
  const month = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2000, Number(m) - 1, 1))).replace(".", "");
  return (
    <Link className={`pr-next${s.status === "AKTIF" ? " live" : ""}`} href={`/akademik?sesi=${encodeURIComponent(s.sesi_id)}`}>
      <span className={`pr-date${s.tanggal === today ? " today" : ""}`}>
        <small>{month}</small>
        <b className="n">{Number(d)}</b>
      </span>
      <span className="pr-main">
        <b>{s.nama}</b>
        <span className="n">
          {timeRange(s.jam_mulai, s.jam_selesai)} · {SESSION_TYPE_LABEL[s.jenis]} · {s.kelas === "Semua siswa" ? "Semua siswa" : s.kelas}
        </span>
        <span className="n">
          {s.status === "AKAN_DATANG" ? `${s.peserta} siswa` : `${s.hadir}/${s.peserta} hadir`}
          {s.menunggu ? ` · ${s.menunggu} menunggu` : ""}
        </span>
      </span>
      <span className={`pr-pill ${pill.cls}`}>{pill.label}</span>
    </Link>
  );
}

export function ScheduleTab({
  schedule,
  today,
}: {
  schedule: { date: string; sessions: SessionCard[]; next: SessionCard[]; previous: SessionCard[] };
  today: string;
}) {
  const { date } = schedule;
  return (
    <div className="pr-cols">
      <div className="pr-col">
        <form method="get" className="pr-daynav" aria-label="Pilih tanggal">
          <input type="hidden" name="tab" value="jadwal" />
          <Link className="pr-icbtn" href={`/akademik?tab=jadwal&tanggal=${shiftDay(date, -1)}`} aria-label="Hari sebelumnya" scroll={false}>
            <PrIcon name="left" />
          </Link>
          <input type="date" name="tanggal" defaultValue={date} aria-label="Tanggal" />
          <button type="submit" className="pr-btn sec">
            Tampilkan
          </button>
          <Link className="pr-icbtn" href={`/akademik?tab=jadwal&tanggal=${shiftDay(date, 1)}`} aria-label="Hari berikutnya" scroll={false}>
            <PrIcon name="right" />
          </Link>
          {date !== today ? (
            <Link className="pr-btn ghost" href="/akademik?tab=jadwal" scroll={false}>
              Hari ini
            </Link>
          ) : null}
        </form>
        <section className="card pr-card" aria-label="Sesi pada tanggal ini">
          <div className="pr-head">
            <h2>{date === today ? "Hari ini" : longDay(date)}</h2>
            <span className="pr-pill m n">{schedule.sessions.length} sesi</span>
          </div>
          {schedule.sessions.length === 0 ? (
            <p className="pr-muted pr-xs">Tidak ada sesi pada tanggal ini.</p>
          ) : (
            <div className="pr-nlist">
              {schedule.sessions.map((s) => (
                <ScheduleItem key={s.sesi_id} s={s} today={today} />
              ))}
            </div>
          )}
        </section>
      </div>
      <div className="pr-col">
        <section className="card pr-card" aria-label="Sesi berikutnya">
          <div className="pr-head">
            <h2>Berikutnya</h2>
          </div>
          {schedule.next.length === 0 ? (
            <p className="pr-muted pr-xs">Belum ada sesi terjadwal setelah tanggal ini.</p>
          ) : (
            <div className="pr-nlist">
              {schedule.next.map((s) => (
                <ScheduleItem key={s.sesi_id} s={s} today={today} />
              ))}
            </div>
          )}
        </section>
        {schedule.previous.length ? (
          <section className="card pr-card" aria-label="Sesi sebelumnya">
            <div className="pr-head">
              <h2>Sebelumnya</h2>
            </div>
            <div className="pr-nlist">
              {schedule.previous.map((s) => (
                <ScheduleItem key={s.sesi_id} s={s} today={today} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Tab Rekap

/** Cincin persentase; isian lewat atribut SVG (bukan style inline). */
function Ring({ value, size = 64, stroke = 7, label }: { value: number | null; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = value === null ? 0 : (Math.max(0, Math.min(100, value)) / 100) * c;
  const low = value !== null && value < DISCIPLINE.cukup;
  return (
    <svg className={`pr-ring${low ? " low" : ""}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <circle cx={size / 2} cy={size / 2} r={r} className="trk" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} className="val" strokeWidth={stroke} strokeDasharray={`${filled} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

function breakdown(s: { hadir: number; izin: number; sakit: number; alfa: number; total: number }) {
  return `${s.hadir} hadir · ${s.izin} izin · ${s.sakit} sakit · ${s.alfa} alfa dari ${s.total} sesi`;
}

export function RecapTab({ recap, today }: { recap: MonthlyRecap; today: string }) {
  const { periode } = recap;
  const current = today.slice(0, 7);
  const low = recap.rows.filter((r) => r.summary.persen !== null && r.summary.persen < DISCIPLINE.cukup).length;
  return (
    <div className="pr-col">
      <div className="pr-month">
        <div className="row pr-nowrap">
          <Link className="pr-icbtn" href={`/akademik?tab=rekap&bulan=${shiftMonth(periode, -1)}`} aria-label="Bulan sebelumnya" scroll={false}>
            <PrIcon name="left" />
          </Link>
          <h2 className="pr-mtitle">{monthName(periode, today)}</h2>
          {periode < current ? (
            <Link className="pr-icbtn" href={`/akademik?tab=rekap&bulan=${shiftMonth(periode, 1)}`} aria-label="Bulan berikutnya" scroll={false}>
              <PrIcon name="right" />
            </Link>
          ) : null}
        </div>
        <a className="pr-btn sec" href={`/akademik/ekspor-presensi?bulan=${periode}`}>
          <PrIcon name="dl" size="sm" />
          Ekspor CSV
        </a>
      </div>
      <div className="pr-k4">
        <div>
          <b className="n">{pct(recap.average)}</b>
          <span>Rata-rata hadir</span>
        </div>
        <div className={low ? "r" : "m"}>
          <b className="n">{low}</b>
          <span>Di bawah {DISCIPLINE.cukup}%</span>
        </div>
        <div className="m">
          <b className="n">{recap.rows.length}</b>
          <span>Siswa aktif</span>
        </div>
        <div className="m">
          <b className="n">{recap.sessions}</b>
          <span>Sesi selesai</span>
        </div>
      </div>
      <section className="card pr-card" aria-label="Rekap per siswa">
        <div>
          <div className="pr-head">
            <h2>Per siswa</h2>
          </div>
          <p className="pr-xs pr-muted">Terendah di atas. Siswa tanpa catatan pada sesi selesai dihitung alfa.</p>
        </div>
        {recap.rows.length === 0 ? (
          <p className="pr-muted pr-xs">Belum ada siswa aktif.</p>
        ) : (
          <div className="pr-list pr-rlist">
            {recap.rows.map(({ student, summary }) => {
              const isLow = summary.persen !== null && summary.persen < DISCIPLINE.cukup;
              return (
                <div className={`pr-item pr-rrow${isLow ? " low" : ""}`} key={student.siswa_id}>
                  <span className={`pr-av${isLow ? " r" : ""}`}>{initials(student.nama)}</span>
                  <div className="pr-main">
                    <b>{student.nama}</b>
                    <span className="n">{summary.total ? breakdown(summary) : "Belum ada sesi selesai"}</span>
                    {summary.total ? (
                      <svg className="pr-sbar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
                        <rect className="trk" x="0" y="0" width="100" height="6" />
                        <rect className={isLow ? "a" : "h"} x="0" y="0" width={summary.persen ?? 0} height="6" />
                      </svg>
                    ) : null}
                  </div>
                  <b className={`pr-pctv n${isLow ? " pr-red" : ""}`}>{pct(summary.persen)}</b>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Siswa & wali

function myState(s: MySession): "belum" | "tunggu" | "sah" {
  const st = s.record?.status ?? "KOSONG";
  if (st === "KOSONG") return "belum";
  if (st === "MENUNGGU") return "tunggu";
  return "sah";
}

const MY_PILL: Record<Exclude<AttendanceStatus, "KOSONG" | "MENUNGGU">, { label: string; cls: string }> = {
  HADIR: { label: "Hadir", cls: "" },
  IZIN: { label: "Izin", cls: "b" },
  SAKIT: { label: "Sakit", cls: "b" },
  ALFA: { label: "Alfa", cls: "r" },
};

function recordPill(s: MySession, ended: boolean): { label: string; cls: string } {
  const st = s.record?.status ?? "KOSONG";
  if (st === "KOSONG") return ended ? { label: "Alfa", cls: "r" } : { label: "Belum tercatat", cls: "m" };
  if (st === "MENUNGGU") return { label: "Menunggu disahkan", cls: "o" };
  const pill = MY_PILL[st];
  return st === "HADIR" && s.record?.terlambat ? { label: "Hadir · telat", cls: "o" } : pill;
}

function StudentHero({ s, clock, canSubmit }: { s: MySession; clock: Clock; canSubmit: boolean }) {
  const open = s.status === "AKTIF";
  const state = myState(s);
  const deadline = addMinutes(s.jam_mulai, clock.settings.toleransi);
  return (
    <section className={`pr-hero pr-shero t-${open ? "live" : "soon"}`} aria-label={`Sesi ${s.nama}`}>
      <span className={`pr-tag ${open ? "live" : "soon"}`}>{open ? "Berlangsung sekarang" : s.status === "SELESAI" ? "Selesai" : "Nanti"}</span>
      <h2 className="pr-ht">{s.nama}</h2>
      <p className="pr-xs pr-dim n">
        Hari ini {timeRange(s.jam_mulai, s.jam_selesai)} · {open || s.status === "AKAN_DATANG" ? `tepat waktu sampai ${fmtTime(deadline)}` : s.kelas}
      </p>
      {open && canSubmit && state === "belum" ? (
        <StudentActions sesiId={s.sesi_id} />
      ) : open && state === "tunggu" ? (
        <p className="pr-hnote">Pengajuan terkirim pukul {fmtTime(s.record!.waktu)}. Tunggu pelatih mengesahkan.</p>
      ) : state === "sah" ? (
        <p className="pr-hnote">
          Tercatat {recordPill(s, false).label.toLowerCase()}
          {s.record?.waktu ? ` pukul ${fmtTime(s.record.waktu)}` : ""}. Terima kasih.
        </p>
      ) : s.status === "AKAN_DATANG" ? (
        <p className="pr-hnote">Tombol presensi muncul saat pelatih membuka sesi.</p>
      ) : !canSubmit && open ? (
        <p className="pr-hnote">Belum tercatat.</p>
      ) : null}
    </section>
  );
}

function StatusCard({ s, who }: { s: MySession; who: string | null }) {
  const state = myState(s);
  const pill = recordPill(s, s.status === "SELESAI");
  const steps = [
    { key: "belum", label: "Pindai" },
    { key: "tunggu", label: "Menunggu" },
    { key: "sah", label: "Disahkan" },
  ] as const;
  const at = steps.findIndex((step) => step.key === state);
  return (
    <section className="card pr-card" aria-label={who ? `Status ${who}` : "Status Anda"}>
      <div className="pr-head">
        <h2>{who ? `Status ${who}` : "Status Anda"}</h2>
        <span className={`pr-pill ${pill.cls}`}>{pill.label}</span>
      </div>
      <ol className="pr-steps">
        {steps.map((step, i) => (
          <li key={step.key} className={i === at ? "on" : i < at ? "done" : undefined} aria-current={i === at ? "step" : undefined}>
            <i>{i < at ? <PrIcon name="ok" size="sm" /> : i + 1}</i>
            {step.label}
          </li>
        ))}
      </ol>
      <p className="pr-xs pr-muted">{who ? "Setelah anak memindai, pelatih mengesahkan." : "Setelah pindai, pelatih mengesahkan. Lupa bawa HP? Minta pelatih mencatat."}</p>
    </section>
  );
}

export function FamilyPresensi({ item, canSubmit, showName, clock }: { item: FamilyAttendance; canSubmit: boolean; showName: boolean; clock: Clock }) {
  const { summary } = item;
  // Semua sesi yang sedang dibuka mendapat kartu sendiri; bila tidak ada, tampilkan sesi berikutnya hari ini.
  const open = item.today.filter((s) => s.status === "AKTIF");
  const focus = open.length ? open : item.today.filter((s) => s.status === "AKAN_DATANG").slice(0, 1);
  const others = item.today.filter((s) => !focus.includes(s));
  const low = summary.persen !== null && summary.persen < DISCIPLINE.cukup;
  return (
    <div className="pr-col pr-family">
      {showName ? <h2 className="pr-sname">{item.student.nama}</h2> : null}
      <div className="pr-fgrid">
        <div className="pr-col">
          {focus.length ? (
            focus.map((s, i) => (
              <Fragment key={s.sesi_id}>
                <StudentHero s={s} clock={clock} canSubmit={canSubmit} />
                {s.status === "AKTIF" && i === 0 ? <StatusCard s={s} who={canSubmit ? null : shortName(item.student.nama)} /> : null}
              </Fragment>
            ))
          ) : (
            <section className="card pr-card pr-empty">
              <PrIcon name="cal" size="lg" />
              <h2>{item.today.length ? "Sesi hari ini sudah selesai" : "Tidak ada sesi hari ini"}</h2>
              <p className="pr-muted n">
                {item.next ? `Berikutnya: ${item.next.nama}, ${relativeDay(item.next.tanggal, clock.today).toLowerCase()} ${fmtTime(item.next.jam_mulai)}.` : "Belum ada jadwal berikutnya."}
              </p>
            </section>
          )}
          {others.length ? (
            <section className="card pr-card" aria-label="Sesi lain hari ini">
              <div className="pr-head">
                <h2>Hari ini</h2>
              </div>
              <div className="pr-list">
                {others.map((s) => {
                  const pill = recordPill(s, s.status === "SELESAI");
                  return (
                    <div className="pr-item" key={s.sesi_id}>
                      <div className="pr-main">
                        <b>{s.nama}</b>
                        <span className="n">{timeRange(s.jam_mulai, s.jam_selesai)}</span>
                      </div>
                      <span className={`pr-pill ${pill.cls}`}>{pill.label}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
          <section className="card pr-card pr-mine" aria-label="Kehadiran bulan ini">
            <Ring value={summary.persen} />
            <div className="pr-main">
              <b>Kehadiran {monthName(clock.periode, clock.today)}</b>
              <span className="pr-xs pr-muted n">{summary.total ? breakdown(summary) : "Belum ada sesi selesai bulan ini."}</span>
              {low ? <span className="pr-pill r">Di bawah {DISCIPLINE.cukup}%</span> : summary.terlambat ? <span className="pr-pill o n">{summary.terlambat}× terlambat</span> : null}
            </div>
            <b className={`pr-pct n${low ? " low" : ""}`}>{pct(summary.persen)}</b>
          </section>
        </div>
        <div className="pr-col">
          <section className="card pr-card" aria-label="Riwayat">
            <div className="pr-head">
              <h2>Riwayat</h2>
              <span className="pr-xs pr-muted">Terbaru di atas</span>
            </div>
            {item.history.length === 0 ? (
              <p className="pr-muted pr-xs">Belum ada sesi selesai.</p>
            ) : (
              <div className="pr-list">
                {item.history.map((s) => {
                  const pill = recordPill(s, true);
                  const izin = s.record && (s.record.status === "IZIN" || s.record.status === "SAKIT") && s.record.catatan;
                  return (
                    <div className="pr-item" key={s.sesi_id}>
                      <div className="pr-main">
                        <b>{s.nama}</b>
                        <span className="n">
                          {shortDate(s.tanggal)} · {izin ? s.record!.catatan : fmtTime(s.record?.waktu || s.jam_mulai)}
                        </span>
                      </div>
                      <span className={`pr-pill ${pill.cls}`}>{pill.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
