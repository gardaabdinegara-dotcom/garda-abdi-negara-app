import { notFound } from "next/navigation";
import {
  ATTENDANCE_LABEL,
  SESSION_STATUS_LABEL,
  SESSION_TYPE_LABEL,
  SESSION_TYPES,
  sessionTypeLabel,
  SUBMISSION_LABEL,
  type AttendanceStatus,
  type ReportSection,
  type Session,
  type SessionStatus,
  type SessionTypeOption,
  type SubmissionStatus,
} from "@/lib/core/akademik";
import { FITUR } from "@/lib/core/fitur";
import type { Actor, ClassGroup, Role } from "@/lib/core/types";
import { SessionFieldsClient } from "./presensi-client";
import { Badge, Tabs } from "./ui";

type Part = "presensi" | "nilai" | "tugas" | "kesehatan" | "rapor";

const PARTS: { key: Part; href: string; label: string; roles: Role[] }[] = [
  { key: "presensi", href: "/akademik", label: "Jadwal & presensi", roles: ["OWNER", "ADMIN", "PENGAJAR", "SISWA", "WALI"] },
  { key: "nilai", href: "/akademik/nilai", label: "Nilai & tes", roles: ["OWNER", "ADMIN", "PENGAJAR", "SISWA"] },
  { key: "tugas", href: "/akademik/tugas", label: "Tugas", roles: ["OWNER", "ADMIN", "PENGAJAR", "SISWA"] },
  { key: "kesehatan", href: "/akademik/kesehatan", label: "Kesehatan", roles: ["OWNER", "ADMIN", "PENGAJAR"] },
  { key: "rapor", href: "/akademik/rapor", label: "Rapor", roles: ["OWNER", "ADMIN", "PENGAJAR", "SISWA", "WALI"] },
];

/** Bagian yang sedang disembunyikan (lihat lib/core/fitur.ts). Presensi selalu tampil. */
const shown = (part: Part) => part === "presensi" || FITUR[part];

/** Menolak (404) bagian akademik yang bukan untuk peran ini atau sedang disembunyikan. */
export function requirePart(actor: Actor, part: Part) {
  if (!shown(part) || !PARTS.find((p) => p.key === part)!.roles.includes(actor.user.peran)) notFound();
}

export function AcademicTabs({ actor, current }: { actor: Actor; current: Part }) {
  const family = actor.user.peran === "SISWA" || actor.user.peran === "WALI";
  const visible = PARTS.filter((p) => shown(p.key) && p.roles.includes(actor.user.peran));
  if (visible.length < 2) return null;
  const items = visible.map((p) => ({
    key: p.key,
    href: p.href,
    label: family && p.key === "presensi" ? "Presensi" : family && p.key === "nilai" ? "Nilai" : p.label,
  }));
  return <Tabs items={items} current={current} label="Bagian akademik" />;
}

const SESSION_TONE: Record<SessionStatus, "neutral" | "success" | "info" | "danger"> = {
  AKAN_DATANG: "neutral",
  AKTIF: "success",
  SELESAI: "info",
  DIBATALKAN: "danger",
  DIHAPUS: "danger",
};
export const SessionStatusBadge = ({ status }: { status: SessionStatus }) => <Badge tone={SESSION_TONE[status]}>{SESSION_STATUS_LABEL[status]}</Badge>;

const ATTENDANCE_TONE: Record<AttendanceStatus, "neutral" | "success" | "info" | "danger" | "warning"> = {
  MENUNGGU: "warning",
  HADIR: "success",
  IZIN: "info",
  SAKIT: "info",
  ALFA: "danger",
  KOSONG: "neutral",
};
export function AttendanceBadge({ status, late }: { status: AttendanceStatus; late?: boolean }) {
  return (
    <span className="row">
      <Badge tone={ATTENDANCE_TONE[status]}>{ATTENDANCE_LABEL[status]}</Badge>
      {late && status === "HADIR" ? <Badge tone="warning">Terlambat</Badge> : null}
    </span>
  );
}

const SUBMISSION_TONE: Record<SubmissionStatus, "warning" | "success" | "danger"> = { DIKIRIM: "warning", DIPERIKSA: "success", DIKEMBALIKAN: "danger" };
export const SubmissionBadge = ({ status }: { status: SubmissionStatus }) => <Badge tone={SUBMISSION_TONE[status]}>{SUBMISSION_LABEL[status]}</Badge>;

export const typeOptions = SESSION_TYPES.map((t) => ({ value: t, label: SESSION_TYPE_LABEL[t] }));

/**
 * Isian sesi untuk tambah dan ubah. Bidang yang disembunyikan tidak ditawarkan untuk sesi baru,
 * tetapi tetap muncul saat mengubah sesi lama yang memakainya.
 * `today` diisi saat menambah sesi: sakelar Ulangi membuat seri sesi sekaligus.
 */
export function SessionFields({
  classes,
  teachers,
  sessionTypes,
  session,
  date,
  today,
  typeLabel,
}: {
  classes: ClassGroup[];
  teachers: { user_id: string; nama: string }[];
  sessionTypes: SessionTypeOption[];
  session?: Session & { bidang?: string };
  date: string;
  today?: string;
  /** Nama tampilan bidang sesi ini bila bidangnya disembunyikan. */
  typeLabel?: string;
}) {
  const jenis = session?.jenis;
  const options =
    !jenis || sessionTypes.some(({ value }) => value === jenis)
      ? sessionTypes
      : [...sessionTypes, { value: jenis, label: typeLabel ?? session?.bidang ?? sessionTypeLabel(jenis) }];
  return (
    <SessionFieldsClient
      classes={classes.map(({ kelas_id, nama_kelas }) => ({ kelas_id, nama_kelas }))}
      teachers={teachers.map(({ user_id, nama }) => ({ user_id, nama }))}
      sessionTypes={options}
      session={
        session
          ? { nama: session.nama, tanggal: session.tanggal, jam_mulai: session.jam_mulai, jam_selesai: session.jam_selesai, jenis: session.jenis, kelas_id: session.kelas_id, pengajar_id: session.pengajar_id }
          : undefined
      }
      date={date}
      today={session ? undefined : today}
    />
  );
}

export const fmtNumber = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined ? "-" : value.toLocaleString("id-ID", { maximumFractionDigits: digits });

export const fmtPercent = (value: number | null | undefined) => (value === null || value === undefined ? "-" : `${fmtNumber(value, 0)}%`);

export function ScoreSection({ section }: { section: ReportSection }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{section.title}</h2>
      </div>
      <div className="score-list">
        {section.rows.map((row) => (
          <div className="score-row" key={row.label}>
            <div className="row spread">
              <span>{row.label}</span>
              <b>{row.value}</b>
            </div>
            <meter className="capacity" min={0} max={100} value={row.score ?? 0} aria-label={`${row.label}: ${row.value}`} />
            <span className="cell-sub">{row.note}</span>
          </div>
        ))}
      </div>
      {section.note ? <p className="muted">{section.note}</p> : null}
    </section>
  );
}
