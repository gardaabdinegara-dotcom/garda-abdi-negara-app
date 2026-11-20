import "server-only";
import { notFound } from "next/navigation";
import {
  academicSettings,
  assignmentFor,
  attendanceSummary,
  attendanceTrend,
  buildReport,
  canManageSession,
  canPublishReport,
  canTeachStudent,
  classesOfStudent,
  currentReport,
  describeWeekdays,
  DISCIPLINE,
  isAcademicStaff,
  isoWeekday,
  liveSession,
  latestPublished,
  localClock,
  mean,
  participantsOf,
  recordedSessionIds,
  REPORT_TABLES,
  seriesFollowers,
  sessionTypeCatalog,
  sessionTypeLabel,
  sessionTypeLabels,
  sessionTypeOptions,
  SKD_KEYS,
  skdPasses,
  teachesClass,
  toAssignment,
  toAttendance,
  toHealth,
  toReport,
  toSession,
  toSubmission,
  toTest,
  visibleSession,
  type AcademicSettings,
  type Assignment,
  type Attendance,
  type AttendanceSummary,
  type Health,
  type ReportRow,
  type ReportSnapshot,
  type Session,
  type Submission,
  type TestResult,
  statusEfektif,
} from "../core/akademik";
import { filterPresensi, susunDashboardPresensi, type RekapPresensiSiswa } from "../core/presensi-ringkasan";
import { linkedStudentIds, taughtClassIds, toClass, toEnrollment, toLink, toStudent, toUser, type Actor, type ClassGroup, type Enrollment, type Student } from "../core/types";
import { waTemplates } from "../core/wa";
import { str } from "../data/rows";
import type { Tables } from "../data/types";
import { dataDeps } from "./data";

const read = async (tables: readonly string[]) => (await dataDeps()).store.read("inti", tables);

export interface SessionTypeRow {
  value: string;
  label: string;
  hidden: boolean;
  builtIn: boolean;
  /** Jumlah sesi (selain yang dihapus) yang memakai bidang ini. */
  dipakai: number;
  /** Tanggal sesi terakhir yang memakai bidang ini. */
  terakhir: string;
}

/** Semua bidang presensi sesuai susunan owner, beserta jumlah pemakaiannya. */
export async function loadSessionTypeCatalog(): Promise<SessionTypeRow[]> {
  const t = await read(["Pengaturan", "Sesi"]);
  const usage = new Map<string, { dipakai: number; terakhir: string }>();
  for (const s of (t.Sesi ?? []).map(toSession).filter(liveSession)) {
    const used = usage.get(s.jenis) ?? { dipakai: 0, terakhir: "" };
    used.dipakai += 1;
    if (s.tanggal > used.terakhir) used.terakhir = s.tanggal;
    usage.set(s.jenis, used);
  }
  return sessionTypeCatalog(t).map((entry) => ({ ...entry, ...(usage.get(entry.value) ?? { dipakai: 0, terakhir: "" }) }));
}

/** Nama kelas sesi; sesi tanpa kelas berlaku untuk semua siswa aktif. */
const kelasLabel = (names: ReadonlyMap<string, string>, id: string, unknown = "-") => (id ? (names.get(id) ?? unknown) : "Semua siswa");

export interface Clock {
  settings: AcademicSettings;
  today: string;
  now: string;
  periode: string;
}

function clockOf(t: Tables): Clock {
  const settings = academicSettings(t);
  const { date, time } = localClock(settings.zona_waktu, new Date().toISOString());
  return { settings, today: date, now: time, periode: date.slice(0, 7) };
}

const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
export const isPeriod = (value: unknown): value is string => typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

function base(t: Tables) {
  const students = (t.Siswa ?? []).map(toStudent);
  const enrollments = (t.Pendaftaran ?? []).map(toEnrollment);
  const classes = (t.Kelas ?? []).map(toClass);
  const users = (t.Pengguna ?? []).map(toUser);
  return {
    students,
    enrollments,
    classes,
    studentById: new Map(students.map((s) => [s.siswa_id, s])),
    className: new Map(classes.map((c) => [c.kelas_id, c.nama_kelas])),
    userName: new Map(users.map((u) => [u.user_id, u.nama])),
    users,
  };
}

/** Siswa aktif yang boleh dinilai/dicatat staf ini. */
export function teachableStudents(actor: Actor, students: readonly Student[], enrollments: readonly Enrollment[]): Student[] {
  return students
    .filter((s) => s.aktif && canTeachStudent(actor, s.siswa_id, enrollments))
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
}

/** Siswa yang ditautkan ke akun siswa/wali ini. */
function familyStudents(actor: Actor, students: readonly Student[], includeInactive = false): Student[] {
  const ids = new Set(linkedStudentIds(actor, actor.user.peran === "WALI" ? "WALI" : "SISWA"));
  return students.filter((s) => ids.has(s.siswa_id) && (includeInactive || s.aktif));
}

/** Kelas yang boleh dipakai staf ini untuk sesi/tugas baru. */
function creatableClasses(actor: Actor, classes: readonly ClassGroup[]) {
  return classes.filter((c) => c.aktif && teachesClass(actor, c.kelas_id)).sort((a, b) => a.nama_kelas.localeCompare(b.nama_kelas, "id"));
}

function teacherOptions(t: Tables) {
  const links = (t.Tautan_Akun ?? []).map(toLink).filter((l) => l.aktif && l.jenis === "PENGAJAR_KELAS");
  return (t.Pengguna ?? [])
    .map(toUser)
    .filter((u) => u.aktif && u.peran === "PENGAJAR")
    .map((u) => ({ user_id: u.user_id, nama: u.nama, kelas_ids: links.filter((l) => l.user_id === u.user_id).map((l) => l.kelas_id) }))
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
}

// ---------------------------------------------------------------- Jadwal & presensi

export interface SessionCard extends Session {
  /** Nama tampilan bidang (mengikuti nama yang diatur owner). */
  bidang: string;
  kelas: string;
  pengajar: string;
  peserta: number;
  hadir: number;
  menunggu: number;
  canManage: boolean;
}

export interface MySession extends Session {
  kelas: string;
  record: Attendance | null;
}

export interface FamilyAttendance {
  student: Student;
  summary: AttendanceSummary;
  /** Sesi hari ini (tanpa yang dibatalkan), urut jam. */
  today: MySession[];
  /** Sesi terdekat setelah hari ini. */
  next: MySession | null;
  history: MySession[];
}

export interface RosterRow {
  siswa_id: string;
  nama: string;
  kode_siswa: string;
  record: Attendance | null;
}

/** Ringkasan seri untuk sesi berulang. */
export interface SeriesInfo {
  /** Jumlah sesi dalam seri (selain yang dihapus). */
  total: number;
  dari: string;
  sampai: string;
  /** Mis. "Senin sampai Sabtu". */
  hari: string;
  /** Sesi sesudahnya yang ikut bila memilih "Sesi ini dan berikutnya". */
  berikutnya: number;
  /** Sesi sesudahnya yang dibiarkan karena sudah berjalan atau sudah ada presensinya. */
  dilewati: number;
}

/** Satu sesi lengkap untuk layar presensi staf: kartu sesi dan daftar peserta beserta catatannya. */
export interface SessionWorkspace {
  session: SessionCard;
  roster: RosterRow[];
  seri: SeriesInfo | null;
}

export interface MonthlyRecap {
  periode: string;
  /** Urut dari persentase terendah; siswa tanpa sesi selesai di akhir. */
  rows: RekapPresensiSiswa[];
  /** Rata-rata tertimbang (total hadir / total sesi peserta). */
  average: number | null;
  /** Jumlah siswa di bawah batas cukup (75%). */
  low: number;
  /** Sesi selesai pada bulan itu yang terlihat oleh staf ini. */
  sessions: number;
}

const SCHEDULE_TABLES = ["Pengaturan", "Pengguna", "Tautan_Akun", "Siswa", "Pendaftaran", "Kelas", "Sesi", "Presensi"];

const byTime = (a: Session, b: Session) => `${a.tanggal} ${a.jam_mulai}`.localeCompare(`${b.tanggal} ${b.jam_mulai}`);

function sessionCards(actor: Actor, t: Tables, sessions: Session[], attendance: Attendance[]) {
  const { students, enrollments, className, userName } = base(t);
  const labels = sessionTypeLabels(t);
  return sessions.map(
    (s): SessionCard => ({
      ...s,
      bidang: sessionTypeLabel(s.jenis, labels),
      kelas: kelasLabel(className, s.kelas_id, "Kelas tidak dikenal"),
      pengajar: userName.get(s.pengajar_id) ?? "-",
      peserta: participantsOf(s, students, enrollments).length,
      hadir: attendance.filter((a) => a.sesi_id === s.sesi_id && a.status === "HADIR").length,
      menunggu: attendance.filter((a) => a.sesi_id === s.sesi_id && a.status === "MENUNGGU").length,
      canManage: canManageSession(actor, s),
    }),
  );
}

function workspaceOf(actor: Actor, t: Tables, session: Session, attendance: Attendance[]): SessionWorkspace {
  const { students, enrollments, studentById } = base(t);
  const recordOf = new Map(attendance.filter((a) => a.sesi_id === session.sesi_id).map((a) => [a.siswa_id, a]));
  const roster = participantsOf(session, students, enrollments)
    .map((id) => studentById.get(id))
    .filter((s): s is Student => Boolean(s))
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"))
    .map((s): RosterRow => ({ siswa_id: s.siswa_id, nama: s.nama, kode_siswa: s.kode_siswa, record: recordOf.get(s.siswa_id) ?? null }));
  return { session: sessionCards(actor, t, [session], attendance)[0]!, roster, seri: seriesInfo(t, session, attendance) };
}

function seriesInfo(t: Tables, session: Session, attendance: Attendance[]): SeriesInfo | null {
  if (!session.seri_id) return null;
  const today = clockOf(t).today;
  const all = (t.Sesi ?? []).map(toSession).map((s) => statusEfektif(s, today));
  const members = all.filter((s) => s.seri_id === session.seri_id && liveSession(s)).sort(byTime);
  if (members.length === 0) return null;
  const followers = seriesFollowers(session, all, recordedSessionIds(attendance), today);
  return {
    total: members.length,
    dari: members[0]!.tanggal,
    sampai: members[members.length - 1]!.tanggal,
    hari: describeWeekdays(members.map((s) => isoWeekday(s.tanggal))),
    berikutnya: followers.eligible.length,
    dilewati: followers.skipped.length,
  };
}

/** Rekap kehadiran bulanan siswa yang diajar staf ini. */
function monthlyRecap(
  actor: Actor,
  students: readonly Student[],
  enrollments: readonly Enrollment[],
  sessions: readonly Session[],
  records: ReadonlyMap<string, Attendance>,
  periode: string,
  visible: readonly Session[],
): MonthlyRecap {
  const rows = teachableStudents(actor, students, enrollments).map((student) => ({ student, summary: attendanceSummary(student.siswa_id, sessions, records, periode) }));
  rows.sort((a, b) => (a.summary.persen ?? 101) - (b.summary.persen ?? 101) || a.student.nama.localeCompare(b.student.nama, "id"));
  const totals = rows.reduce((acc, { summary }) => ({ hadir: acc.hadir + summary.hadir, total: acc.total + summary.total }), { hadir: 0, total: 0 });
  return {
    periode,
    rows,
    average: totals.total ? (totals.hadir / totals.total) * 100 : null,
    low: rows.filter(({ summary }) => summary.persen !== null && summary.persen < DISCIPLINE.cukup).length,
    sessions: visible.filter((s) => s.status === "SELESAI" && s.tanggal.startsWith(periode)).length,
  };
}

/**
 * Data layar Presensi.
 * Staf: layar operasional presensi atau ringkasan kehadiran per rentang tanggal.
 * Siswa/wali: sesi hari ini, rekap bulan ini, dan riwayat.
 */
export async function loadPresensi(actor: Actor, params: Record<string, string | string[] | undefined>) {
  const t = await read(SCHEDULE_TABLES);
  const clock = clockOf(t);
  const { students, enrollments, classes, className } = base(t);
  const sessions = (t.Sesi ?? []).map(toSession).filter(liveSession).map((s) => statusEfektif(s, clock.today));
  const attendance = (t.Presensi ?? []).map(toAttendance);
  const records = new Map(attendance.map((a) => [a.presensi_id, a]));
  const visible = sessions.filter((s) => visibleSession(actor, s, students, enrollments));

  if (isAcademicStaff(actor)) {
    const options = {
      sessionTypes: sessionTypeOptions(t),
      classes: creatableClasses(actor, classes),
      teachers: actor.user.peran === "PENGAJAR" ? [] : teacherOptions(t),
    };
    if (params.tab === "ringkasan") {
      const filter = filterPresensi(clock.today, { periode: params.periode, dari: params.dari, sampai: params.sampai });
      return {
        kind: "overview" as const,
        clock,
        ...options,
        filter,
        ringkasan: susunDashboardPresensi(filter, visible, records, students),
      };
    }

    const cards = (list: Session[]) => sessionCards(actor, t, list, attendance);
    const today = visible.filter((s) => s.tanggal === clock.today).sort(byTime);
    const future = visible.filter((s) => s.tanggal > clock.today && s.status !== "DIBATALKAN").sort(byTime);
    const running = today.filter((s) => s.status !== "DIBATALKAN");
    const requested = typeof params.sesi === "string" ? visible.find((s) => s.sesi_id === params.sesi) : undefined;
    const selected =
      requested ??
      running.find((s) => s.status === "AKTIF") ??
      running.find((s) => s.status === "AKAN_DATANG") ??
      running[running.length - 1] ??
      today[0] ??
      null;
    const strip = [...today, ...future.slice(0, 1)];
    if (selected && !strip.some((s) => s.sesi_id === selected.sesi_id)) strip.push(selected);
    const date = isDate(params.tanggal) ? params.tanggal : clock.today;
    const periode = isPeriod(params.bulan) ? params.bulan : clock.periode;
    const templates = waTemplates({ Pengaturan: t.Pengaturan ?? [] });
    return {
      kind: "staff" as const,
      clock,
      waKehadiran: templates.kehadiran,
      strip: cards(strip.sort(byTime)),
      selected: selected ? workspaceOf(actor, t, selected, attendance) : null,
      nearby: cards([...today, ...future].filter((s) => s.sesi_id !== selected?.sesi_id && s.status !== "DIBATALKAN").slice(0, 4)),
      schedule: {
        date,
        sessions: cards(visible.filter((s) => s.tanggal === date).sort(byTime)),
        next: cards(visible.filter((s) => s.tanggal > date && s.status !== "DIBATALKAN").sort(byTime).slice(0, 6)),
        previous: cards(visible.filter((s) => s.tanggal < date).sort((a, b) => byTime(b, a)).slice(0, 6)),
      },
      recap: monthlyRecap(actor, students, enrollments, sessions, records, periode, visible),
      ...options,
    };
  }

  const family: FamilyAttendance[] = familyStudents(actor, students).map((student) => {
    const mine = visible
      .filter((s) => participantsOf(s, students, enrollments).includes(student.siswa_id))
      .map((s): MySession => ({ ...s, kelas: kelasLabel(className, s.kelas_id), record: records.get(`${s.sesi_id}:${student.siswa_id}`) ?? null }));
    return {
      student,
      summary: attendanceSummary(student.siswa_id, sessions, records, clock.periode),
      today: mine.filter((s) => s.tanggal === clock.today && s.status !== "DIBATALKAN").sort(byTime),
      next: mine.filter((s) => s.tanggal > clock.today && s.status === "AKAN_DATANG").sort(byTime)[0] ?? null,
      history: mine
        .filter((s) => s.status === "SELESAI" || (s.status === "AKTIF" && s.tanggal < clock.today))
        .sort((a, b) => byTime(b, a))
        .slice(0, 20),
    };
  });
  return { kind: "family" as const, clock, family };
}

/** Layar QR penuh: sesi dan daftar hadirnya. Hanya staf yang boleh melihat sesi ini. */
export async function loadQrScreen(actor: Actor, sesiId: string) {
  if (!isAcademicStaff(actor)) notFound();
  const t = await read(SCHEDULE_TABLES);
  const clock = clockOf(t);
  const { students, enrollments } = base(t);
  const row = (t.Sesi ?? []).find((r) => r.sesi_id === sesiId);
  if (!row || row.status === "DIHAPUS") notFound();
  const session = statusEfektif(toSession(row), clock.today);
  if (!visibleSession(actor, session, students, enrollments)) notFound();
  return { clock, ...workspaceOf(actor, t, session, (t.Presensi ?? []).map(toAttendance)) };
}

/** Sesi untuk halaman QR siswa. */
export async function loadQrSession(actor: Actor, sesiId: string) {
  const t = await read(SCHEDULE_TABLES);
  const clock = clockOf(t);
  const { students, enrollments, className } = base(t);
  const row = (t.Sesi ?? []).find((r) => r.sesi_id === sesiId);
  if (!row) return null;
  const session = statusEfektif(toSession(row), clock.today);
  const siswaId = linkedStudentIds(actor, "SISWA")[0] ?? "";
  const record = (t.Presensi ?? []).map(toAttendance).find((a) => a.presensi_id === `${sesiId}:${siswaId}`) ?? null;
  return {
    clock,
    session,
    bidang: sessionTypeLabel(session.jenis, sessionTypeLabels(t)),
    kelas: kelasLabel(className, session.kelas_id),
    participant: participantsOf(session, students, enrollments).includes(siswaId),
    record,
  };
}

/** Baris CSV presensi satu bulan untuk sesi yang terlihat oleh staf ini. */
export async function loadAttendanceExport(actor: Actor, periode: string) {
  if (!isAcademicStaff(actor)) notFound();
  const t = await read(SCHEDULE_TABLES);
  const { students, enrollments, studentById, className } = base(t);
  const records = new Map((t.Presensi ?? []).map((r) => [str(r.presensi_id), toAttendance(r)]));
  const sessions = (t.Sesi ?? [])
    .map(toSession)
    .filter((s) => s.tanggal.startsWith(periode) && (s.status === "SELESAI" || s.status === "AKTIF") && visibleSession(actor, s, students, enrollments))
    .sort((a, b) => `${a.tanggal} ${a.jam_mulai}`.localeCompare(`${b.tanggal} ${b.jam_mulai}`));
  const out: (string | number | boolean)[][] = [];
  for (const s of sessions) {
    for (const id of participantsOf(s, students, enrollments)) {
      const student = studentById.get(id);
      const record = records.get(`${s.sesi_id}:${id}`);
      const status = record && record.status !== "KOSONG" ? record.status : s.status === "SELESAI" ? "ALFA" : "BELUM";
      out.push([s.tanggal, `${s.jam_mulai}-${s.jam_selesai}`, s.nama, kelasLabel(className, s.kelas_id, ""), student?.kode_siswa ?? "", student?.nama ?? id, status, record?.waktu ?? "", record?.terlambat ? "ya" : "", record?.metode ?? "", record?.catatan ?? ""]);
    }
  }
  return out;
}

// ---------------------------------------------------------------- Nilai & tes

export interface StudentScoreRow {
  student: Student;
  tests: number;
  skd: number | null;
  skdPass: boolean | null;
  academic: number | null;
}

export async function loadScores(actor: Actor, siswaParam: unknown, periodeParam: unknown) {
  const t = await read(REPORT_TABLES);
  const clock = clockOf(t);
  const periode = isPeriod(periodeParam) ? periodeParam : clock.periode;
  const { students, enrollments, className } = base(t);
  const tests = (t.Hasil_Tes ?? []).map(toTest).filter((x) => !x.diarsipkan && x.tanggal.startsWith(periode));

  if (isAcademicStaff(actor)) {
    const list = teachableStudents(actor, students, enrollments);
    const rows: StudentScoreRow[] = list.map((student) => {
      const mine = tests.filter((x) => x.siswa_id === student.siswa_id);
      const skdTests = mine.filter((x) => x.kategori === "SKD");
      const skd = { twk: mean(skdTests.map((x) => x.twk)), tiu: mean(skdTests.map((x) => x.tiu)), tkp: mean(skdTests.map((x) => x.tkp)) };
      return {
        student,
        tests: mine.length,
        skd: skdTests.length ? (skd.twk ?? 0) + (skd.tiu ?? 0) + (skd.tkp ?? 0) : null,
        skdPass: skdTests.length ? skdPasses(skd, clock.settings.acuan) : null,
        academic: mean(mine.filter((x) => x.kategori === "AKADEMIK").map((x) => x.skor)),
      };
    });
    const selected = typeof siswaParam === "string" ? list.find((s) => s.siswa_id === siswaParam) ?? null : null;
    return {
      kind: "staff" as const,
      clock,
      periode,
      rows,
      students: list.map((s) => ({ siswa_id: s.siswa_id, nama: s.nama, kode_siswa: s.kode_siswa, kelas: classesOfStudent(s.siswa_id, enrollments).map((id) => className.get(id)).join(", ") })),
      selected,
      selectedTests: selected ? tests.filter((x) => x.siswa_id === selected.siswa_id).sort((a, b) => `${b.tanggal}${b.created_at}`.localeCompare(`${a.tanggal}${a.created_at}`)) : [],
    };
  }

  const family = familyStudents(actor, students).map((student) => ({
    student,
    report: buildReport(t, student.siswa_id, periode, new Date().toISOString()),
    skdTests: tests.filter((x) => x.siswa_id === student.siswa_id && x.kategori === "SKD").sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
  }));
  return { kind: "family" as const, clock, periode, family };
}

// ---------------------------------------------------------------- Tugas

export interface TaskCard extends Assignment {
  kelas: string;
  pengajar: string;
  peserta: number;
  dikirim: number;
  diperiksa: number;
  mine: Submission | null;
  canEdit: boolean;
}

const TASK_TABLES = ["Pengaturan", "Pengguna", "Siswa", "Pendaftaran", "Kelas", "Tugas", "Pengumpulan", "Tautan_Akun"];

function taskParticipants(task: Assignment, students: readonly Student[], enrollments: readonly Enrollment[]): string[] {
  const active = students.filter((s) => s.aktif);
  if (!task.kelas_id) return active.map((s) => s.siswa_id);
  const ids = new Set(enrollments.filter((e) => e.kelas_id === task.kelas_id && e.status === "AKTIF").map((e) => e.siswa_id));
  return active.filter((s) => ids.has(s.siswa_id)).map((s) => s.siswa_id);
}

function visibleTask(actor: Actor, task: Assignment): boolean {
  if (actor.user.peran === "OWNER" || actor.user.peran === "ADMIN") return true;
  if (actor.user.peran === "PENGAJAR") return task.pengajar_id === actor.user.user_id || !task.kelas_id || taughtClassIds(actor).includes(task.kelas_id);
  return false;
}

export async function loadTasks(actor: Actor) {
  const t = await read(TASK_TABLES);
  const clock = clockOf(t);
  const { students, enrollments, classes, className, userName } = base(t);
  const tasks = (t.Tugas ?? []).map(toAssignment);
  const submissions = (t.Pengumpulan ?? []).map(toSubmission);
  const card = (task: Assignment, siswaId?: string): TaskCard => {
    const participants = new Set(taskParticipants(task, students, enrollments));
    const subs = submissions.filter((s) => s.tugas_id === task.tugas_id && participants.has(s.siswa_id));
    return {
      ...task,
      kelas: task.kelas_id ? (className.get(task.kelas_id) ?? "-") : "Semua kelas",
      pengajar: userName.get(task.pengajar_id) ?? "-",
      peserta: participants.size,
      dikirim: subs.filter((s) => s.status === "DIKIRIM").length,
      diperiksa: subs.filter((s) => s.status === "DIPERIKSA").length,
      mine: siswaId ? (submissions.find((s) => s.pengumpulan_id === `${task.tugas_id}:${siswaId}`) ?? null) : null,
      canEdit: actor.user.peran === "OWNER" || actor.user.peran === "ADMIN" || task.pengajar_id === actor.user.user_id,
    };
  };
  const byDue = (a: Assignment, b: Assignment) => b.tenggat.localeCompare(a.tenggat);
  if (isAcademicStaff(actor)) {
    return {
      kind: "staff" as const,
      clock,
      tasks: tasks.filter((task) => visibleTask(actor, task)).sort(byDue).map((task) => card(task)),
      classes: creatableClasses(actor, classes),
      allClasses: actor.user.peran !== "PENGAJAR",
    };
  }
  const student = familyStudents(actor, students)[0] ?? null;
  const classIds = student ? classesOfStudent(student.siswa_id, enrollments) : [];
  return {
    kind: "student" as const,
    clock,
    student,
    tasks: student ? tasks.filter((task) => task.aktif && assignmentFor(task, classIds)).sort(byDue).map((task) => card(task, student.siswa_id)) : [],
  };
}

export async function loadTaskDetail(actor: Actor, tugasId: string) {
  if (!isAcademicStaff(actor)) notFound();
  const t = await read(TASK_TABLES);
  const clock = clockOf(t);
  const { students, enrollments, classes, studentById, className, userName } = base(t);
  const row = (t.Tugas ?? []).find((r) => r.tugas_id === tugasId);
  if (!row) notFound();
  const task = toAssignment(row);
  if (!visibleTask(actor, task)) notFound();
  const submissions = new Map((t.Pengumpulan ?? []).map((r) => [str(r.pengumpulan_id), toSubmission(r)]));
  const roster = taskParticipants(task, students, enrollments)
    .filter((id) => canTeachStudent(actor, id, enrollments))
    .map((id) => studentById.get(id)!)
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"))
    .map((student) => ({ student, submission: submissions.get(`${task.tugas_id}:${student.siswa_id}`) ?? null }));
  return {
    clock,
    task,
    kelas: task.kelas_id ? (className.get(task.kelas_id) ?? "-") : "Semua kelas",
    pengajar: userName.get(task.pengajar_id) ?? "-",
    roster,
    canEdit: actor.user.peran === "OWNER" || actor.user.peran === "ADMIN" || task.pengajar_id === actor.user.user_id,
    classes: creatableClasses(actor, classes),
    allClasses: actor.user.peran !== "PENGAJAR",
  };
}

// ---------------------------------------------------------------- Kesehatan

export async function loadHealth(actor: Actor, siswaParam: unknown) {
  if (!isAcademicStaff(actor)) notFound();
  const t = await read(["Pengaturan", "Siswa", "Pendaftaran", "Kesehatan"]);
  const clock = clockOf(t);
  const { students, enrollments } = base(t);
  const list = teachableStudents(actor, students, enrollments);
  const selected = typeof siswaParam === "string" ? (list.find((s) => s.siswa_id === siswaParam) ?? null) : null;
  const all = (t.Kesehatan ?? []).map(toHealth);
  const latest = new Map<string, Health>();
  for (const h of all) {
    const prev = latest.get(h.siswa_id);
    if (!prev || `${h.tanggal}${h.created_at}` > `${prev.tanggal}${prev.created_at}`) latest.set(h.siswa_id, h);
  }
  return {
    clock,
    students: list,
    latest,
    selected,
    measurements: selected ? all.filter((h) => h.siswa_id === selected.siswa_id).sort((a, b) => `${b.tanggal}${b.created_at}`.localeCompare(`${a.tanggal}${a.created_at}`)) : [],
  };
}

// ---------------------------------------------------------------- Rapor

export interface ReportListRow {
  student: Student;
  current: ReportRow | null;
  published: ReportRow | null;
}

export async function loadReportList(actor: Actor, periodeParam: unknown) {
  const t = await read(["Pengaturan", "Siswa", "Pendaftaran", "Kelas", "Rapor"]);
  const clock = clockOf(t);
  const periode = isPeriod(periodeParam) ? periodeParam : clock.periode;
  const { students, enrollments } = base(t);
  const reports = (t.Rapor ?? []).map(toReport);
  if (isAcademicStaff(actor)) {
    const rows: ReportListRow[] = teachableStudents(actor, students, enrollments).map((student) => ({
      student,
      current: currentReport(reports, student.siswa_id, periode),
      published: latestPublished(reports, student.siswa_id, periode),
    }));
    return { kind: "staff" as const, clock, periode, rows };
  }
  const family = familyStudents(actor, students, true).map((student) => {
    const periods = [...new Set(reports.filter((r) => r.siswa_id === student.siswa_id && r.status === "TERBIT").map((r) => r.periode))].sort().reverse();
    return { student, published: periods.map((p) => latestPublished(reports, student.siswa_id, p)).filter((r): r is ReportRow => Boolean(r)) };
  });
  return { kind: "family" as const, clock, periode, family };
}

export interface ReportView {
  clock: Clock;
  snapshot: ReportSnapshot;
  live: boolean;
  status: "BELUM" | "DRAF" | "TERBIT";
  versi: number;
  catatan: string;
  publishedVersion: number | null;
  publishedAt: string;
  canEdit: boolean;
  canPublish: boolean;
}

export async function loadReport(actor: Actor, siswaId: string, periodeParam: unknown): Promise<ReportView> {
  const t = await read(REPORT_TABLES);
  const clock = clockOf(t);
  const periode = isPeriod(periodeParam) ? periodeParam : clock.periode;
  const { students, enrollments } = base(t);
  const student = students.find((s) => s.siswa_id === siswaId);
  if (!student) notFound();
  const reports = (t.Rapor ?? []).map(toReport);
  const published = latestPublished(reports, siswaId, periode);

  if (isAcademicStaff(actor)) {
    if (!canTeachStudent(actor, siswaId, enrollments)) notFound();
    const current = currentReport(reports, siswaId, periode);
    const frozen = current?.status === "TERBIT" && current.snapshot;
    return {
      clock,
      snapshot: frozen ? current.snapshot! : buildReport(t, siswaId, periode, new Date().toISOString()),
      live: !frozen,
      status: current ? current.status : "BELUM",
      versi: current?.versi ?? 1,
      catatan: current?.catatan ?? "",
      publishedVersion: published?.versi ?? null,
      publishedAt: published?.diterbitkan_pada ?? "",
      canEdit: student.aktif,
      canPublish: canPublishReport(actor) && student.aktif,
    };
  }
  if (!familyStudents(actor, students, true).some((s) => s.siswa_id === siswaId) || !published?.snapshot) notFound();
  return {
    clock,
    snapshot: published.snapshot,
    live: false,
    status: "TERBIT",
    versi: published.versi,
    catatan: published.catatan,
    publishedVersion: published.versi,
    publishedAt: published.diterbitkan_pada,
    canEdit: false,
    canPublish: false,
  };
}

// ---------------------------------------------------------------- Beranda

export async function loadAcademicHome(actor: Actor) {
  const t = await read(["Pengaturan", "Pengguna", "Tautan_Akun", "Siswa", "Pendaftaran", "Kelas", "Sesi", "Presensi", "Hasil_Tes", "Tugas", "Pengumpulan", "Rapor"]);
  const clock = clockOf(t);
  const { students, enrollments, className } = base(t);
  const sessions = (t.Sesi ?? []).map(toSession).filter(liveSession).map((s) => statusEfektif(s, clock.today));
  const attendance = (t.Presensi ?? []).map(toAttendance);
  const records = new Map(attendance.map((a) => [a.presensi_id, a]));
  const visible = sessions.filter((s) => visibleSession(actor, s, students, enrollments));
  const todays = sessionCards(
    actor,
    t,
    visible.filter((s) => s.tanggal === clock.today && s.status !== "DIBATALKAN").sort((a, b) => a.jam_mulai.localeCompare(b.jam_mulai)),
    attendance,
  );
  const tests = (t.Hasil_Tes ?? []).map(toTest).filter((x) => !x.diarsipkan);
  const skdTotal = (x: TestResult) => (x.twk ?? 0) + (x.tiu ?? 0) + (x.tkp ?? 0);

  if (isAcademicStaff(actor)) {
    const mine = teachableStudents(actor, students, enrollments);
    const summaries = mine.map((student) => ({ student, summary: attendanceSummary(student.siswa_id, sessions, records, clock.periode) }));
    const totals = summaries.reduce((acc, { summary }) => ({ hadir: acc.hadir + summary.hadir, total: acc.total + summary.total }), { hadir: 0, total: 0 });
    const ids = new Set(mine.map((s) => s.siswa_id));
    const monthSkd = tests.filter((x) => x.kategori === "SKD" && x.tanggal.startsWith(clock.periode) && ids.has(x.siswa_id));
    const tasks = (t.Tugas ?? []).map(toAssignment).filter((task) => task.aktif && visibleTask(actor, task));
    const taskIds = new Set(tasks.map((task) => task.tugas_id));
    const visibleSessionIds = new Set(visible.map((s) => s.sesi_id));
    return {
      kind: "staff" as const,
      clock,
      todays,
      pending: attendance.filter((a) => a.status === "MENUNGGU" && visibleSessionIds.has(a.sesi_id)).length,
      attendance: totals.total ? (totals.hadir / totals.total) * 100 : null,
      skdAverage: mean(monthSkd.map(skdTotal)),
      skdCount: monthSkd.length,
      unchecked: (t.Pengumpulan ?? []).map(toSubmission).filter((s) => s.status === "DIKIRIM" && taskIds.has(s.tugas_id) && ids.has(s.siswa_id)).length,
      lowAttendance: summaries.filter(({ summary }) => summary.persen !== null && summary.persen < 75).sort((a, b) => a.summary.persen! - b.summary.persen!).slice(0, 5),
      trend: attendanceTrend(sessions, records, ids, 8),
    };
  }

  const reports = (t.Rapor ?? []).map(toReport);
  const family = familyStudents(actor, students).map((student) => {
    const classIds = classesOfStudent(student.siswa_id, enrollments);
    const skd = tests.filter((x) => x.siswa_id === student.siswa_id && x.kategori === "SKD").sort((a, b) => `${b.tanggal}${b.created_at}`.localeCompare(`${a.tanggal}${a.created_at}`))[0];
    const submissions = new Map((t.Pengumpulan ?? []).map((r) => [str(r.pengumpulan_id), toSubmission(r)]));
    const dueSoon = (t.Tugas ?? [])
      .map(toAssignment)
      .filter((task) => task.aktif && assignmentFor(task, classIds) && task.tenggat >= clock.today && !submissions.has(`${task.tugas_id}:${student.siswa_id}`))
      .sort((a, b) => a.tenggat.localeCompare(b.tenggat))
      .slice(0, 3);
    const latestReport = reports
      .filter((r) => r.siswa_id === student.siswa_id && r.status === "TERBIT" && r.rapor_id.includes(":v"))
      .sort((a, b) => `${b.periode}${String(b.versi).padStart(3, "0")}`.localeCompare(`${a.periode}${String(a.versi).padStart(3, "0")}`))[0];
    return {
      student,
      summary: attendanceSummary(student.siswa_id, sessions, records, clock.periode),
      todays: todays
        .filter((s) => participantsOf(s, students, enrollments).includes(student.siswa_id))
        .map((s) => ({ ...s, record: records.get(`${s.sesi_id}:${student.siswa_id}`) ?? null })),
      skd: skd ? { test: skd, total: skdTotal(skd), pass: skdPasses(skd, clock.settings.acuan) } : null,
      dueSoon,
      latestReport: latestReport ?? null,
      kelas: classIds.map((id) => className.get(id)).filter(Boolean).join(", "),
    };
  });
  return { kind: "family" as const, clock, family };
}

/** Ringkasan akademik untuk profil siswa. Pemanggil sudah memastikan profil ini boleh dilihat. */
export async function loadStudentAcademic(actor: Actor, siswaId: string) {
  const t = await read(["Pengaturan", "Sesi", "Presensi", "Hasil_Tes", "Rapor"]);
  const clock = clockOf(t);
  const sessions = (t.Sesi ?? []).map(toSession).filter(liveSession).map((s) => statusEfektif(s, clock.today));
  const records = new Map((t.Presensi ?? []).map((r) => [str(r.presensi_id), toAttendance(r)]));
  const skd = (t.Hasil_Tes ?? [])
    .map(toTest)
    .filter((x) => x.siswa_id === siswaId && !x.diarsipkan && x.kategori === "SKD")
    .sort((a, b) => `${b.tanggal}${b.created_at}`.localeCompare(`${a.tanggal}${a.created_at}`))[0];
  const reports = (t.Rapor ?? []).map(toReport).filter((r) => r.siswa_id === siswaId && r.status === "TERBIT" && r.rapor_id.includes(":v"));
  const latest = reports.sort((a, b) => `${b.periode}${String(b.versi).padStart(3, "0")}`.localeCompare(`${a.periode}${String(a.versi).padStart(3, "0")}`))[0];
  return {
    clock,
    summary: attendanceSummary(siswaId, sessions, records, clock.periode),
    skd: skd ? { test: skd, total: (skd.twk ?? 0) + (skd.tiu ?? 0) + (skd.tkp ?? 0), pass: skdPasses(skd, clock.settings.acuan) } : null,
    latestReport: latest ?? null,
    staff: isAcademicStaff(actor),
  };
}

export { SKD_KEYS };
