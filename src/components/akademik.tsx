import { notFound } from "next/navigation";
import {
  ATTENDANCE_LABEL,
  SESSION_STATUS_LABEL,
  SESSION_TYPE_LABEL,
  SESSION_TYPES,
  SUBMISSION_LABEL,
  type AttendanceStatus,
  type ReportSection,
  type Session,
  type SessionStatus,
  type SubmissionStatus,
} from "@/lib/core/akademik";
import { FITUR } from "@/lib/core/fitur";
import type { Actor, ClassGroup, Role } from "@/lib/core/types";
import { Field } from "./form";
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

/** Isian sesi untuk tambah dan ubah. */
export function SessionFields({
  classes,
  teachers,
  session,
  date,
}: {
  classes: ClassGroup[];
  teachers: { user_id: string; nama: string }[];
  session?: Session;
  date: string;
}) {
  return (
    <div className="form-grid two">
      <Field label="Nama kegiatan" name="nama" defaultValue={session?.nama} placeholder="mis. Latihan jasmani pagi" required className="span-all" />
      <Field label="Tanggal" name="tanggal" type="date" defaultValue={session?.tanggal ?? date} required />
      <Field label="Bidang" name="jenis" type="select" defaultValue={session?.jenis ?? "FISIK"} options={typeOptions} />
      <Field label="Jam mulai" name="jam_mulai" type="time" defaultValue={session?.jam_mulai ?? "07:00"} required />
      <Field label="Jam selesai" name="jam_selesai" type="time" defaultValue={session?.jam_selesai ?? "09:00"} required />
      <Field
        label="Peserta"
        name="kelas_id"
        type="select"
        defaultValue={session?.kelas_id ?? ""}
        options={[{ value: "", label: "Semua siswa aktif" }, ...classes.map((c) => ({ value: c.kelas_id, label: `Kelas ${c.nama_kelas}` }))]}
        hint="Peserta dibekukan saat sesi dibuka."
      />
      {teachers.length ? (
        <Field
          label="Pengajar"
          name="pengajar_id"
          type="select"
          defaultValue={session?.pengajar_id ?? ""}
          options={[{ value: "", label: "Saya sendiri" }, ...teachers.map((t) => ({ value: t.user_id, label: t.nama }))]}
          hint="Pengajar harus sudah ditautkan ke kelas yang dipilih."
        />
      ) : null}
    </div>
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
