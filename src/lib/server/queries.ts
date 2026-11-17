import "server-only";
import { notFound } from "next/navigation";
import { DEFAULT_SETTINGS } from "../data/schema";
import { num, str } from "../data/rows";
import { canManageAccount, canManageStudents, canOpenAccounts, canViewStudent } from "../core/permissions";
import {
  linkedStudentIds,
  taughtClassIds,
  toClass,
  toEnrollment,
  toLink,
  toProgram,
  toStudent,
  toUser,
  type AccountLink,
  type Actor,
  type ClassGroup,
  type Enrollment,
  type Program,
  type Role,
  type Student,
  type User,
} from "../core/types";
import { deps } from "../deps";

/** Data akun yang aman dikirim ke tampilan (tanpa hash password). */
/** Data akun tanpa hash; `punya_kredensial` = sudah punya password/PIN (untuk siswa: PIN sudah dibuat). */
export type PublicUser = Omit<User, "password_hash"> & { punya_kredensial: boolean };
const publicUser = ({ password_hash, ...rest }: User): PublicUser => ({ ...rest, punya_kredensial: Boolean(password_hash) });

async function read(tables: string[]) {
  return deps().store.read("inti", tables);
}

export interface Settings {
  nama_lembaga: string;
  lokasi: string;
  zona_waktu: string;
  toleransi_terlambat_menit: number;
  kapasitas_siswa: number;
  predikat_a: number;
  predikat_b: number;
  predikat_c: number;
  acuan_twk: number;
  acuan_tiu: number;
  acuan_tkp: number;
  presensi_qr_langsung_sah: boolean;
  samapta_kop: string;
  samapta_tempat: string;
  samapta_kota: string;
  samapta_ttd_jabatan: string;
  samapta_ttd_nama: string;
  samapta_baik_sekali: number;
  samapta_baik: number;
  samapta_cukup: number;
}

export async function loadSettings(): Promise<Settings> {
  const t = await read(["Pengaturan"]);
  const value = (key: string) => str(t.Pengaturan!.find((row) => row.key === key)?.value ?? DEFAULT_SETTINGS[key]);
  return {
    nama_lembaga: value("nama_lembaga"),
    lokasi: value("lokasi"),
    zona_waktu: value("zona_waktu"),
    toleransi_terlambat_menit: num(value("toleransi_terlambat_menit")),
    kapasitas_siswa: num(value("kapasitas_siswa")),
    predikat_a: num(value("predikat_a")),
    predikat_b: num(value("predikat_b")),
    predikat_c: num(value("predikat_c")),
    acuan_twk: num(value("acuan_twk")),
    acuan_tiu: num(value("acuan_tiu")),
    acuan_tkp: num(value("acuan_tkp")),
    presensi_qr_langsung_sah: ["true", "1"].includes(value("presensi_qr_langsung_sah").toLowerCase()),
    samapta_kop: value("samapta_kop"),
    samapta_tempat: value("samapta_tempat"),
    samapta_kota: value("samapta_kota"),
    samapta_ttd_jabatan: value("samapta_ttd_jabatan"),
    samapta_ttd_nama: value("samapta_ttd_nama"),
    samapta_baik_sekali: num(value("samapta_baik_sekali")),
    samapta_baik: num(value("samapta_baik")),
    samapta_cukup: num(value("samapta_cukup")),
  };
}

export interface Catalog {
  programs: Program[];
  classes: ClassGroup[];
}

export async function loadCatalog(): Promise<Catalog> {
  const t = await read(["Program", "Kelas"]);
  return { programs: t.Program!.map(toProgram), classes: t.Kelas!.map(toClass) };
}

export interface StudentListItem extends Student {
  enrollments: Enrollment[];
}

/** Daftar siswa yang boleh dilihat pengguna ini. */
export async function loadStudents(actor: Actor): Promise<StudentListItem[]> {
  const t = await read(["Siswa", "Pendaftaran"]);
  const enrollments = t.Pendaftaran!.map(toEnrollment);
  return t
    .Siswa!.map(toStudent)
    .filter((student) => canViewStudent(actor, student.siswa_id, enrollments))
    .map((student) => ({ ...student, enrollments: enrollments.filter((e) => e.siswa_id === student.siswa_id) }))
    .sort((a, b) => Number(b.aktif) - Number(a.aktif) || a.nama.localeCompare(b.nama, "id"));
}

export interface StudentProfile {
  student: Student;
  enrollments: Enrollment[];
  accounts: { link: AccountLink; user: PublicUser }[];
  canManage: boolean;
}

export async function loadStudentProfile(actor: Actor, siswaId: string): Promise<StudentProfile> {
  const t = await read(["Siswa", "Pendaftaran", "Pengguna", "Tautan_Akun"]);
  const enrollments = t.Pendaftaran!.map(toEnrollment);
  const row = t.Siswa!.find((r) => r.siswa_id === siswaId);
  // Siswa yang tidak boleh dilihat diperlakukan sama dengan yang tidak ada.
  if (!row || !canViewStudent(actor, siswaId, enrollments)) notFound();
  const canManage = canManageStudents(actor);
  const users = new Map(t.Pengguna!.map((r) => [str(r.user_id), toUser(r)]));
  const accounts = canManage
    ? t
        .Tautan_Akun!.map(toLink)
        .filter((link) => link.aktif && link.siswa_id === siswaId && users.has(link.user_id))
        .map((link) => ({ link, user: publicUser(users.get(link.user_id)!) }))
    : [];
  return {
    student: toStudent(row),
    enrollments: enrollments.filter((e) => e.siswa_id === siswaId).sort((a, b) => b.tanggal_mulai.localeCompare(a.tanggal_mulai)),
    accounts,
    canManage,
  };
}

export interface AccountListItem extends PublicUser {
  links: AccountLink[];
  manageable: boolean;
}

export async function loadAccounts(actor: Actor): Promise<AccountListItem[]> {
  if (!canOpenAccounts(actor)) notFound();
  const t = await read(["Pengguna", "Tautan_Akun"]);
  const links = t.Tautan_Akun!.map(toLink).filter((link) => link.aktif);
  const order: Role[] = ["OWNER", "ADMIN", "PENGAJAR", "WALI", "SISWA"];
  return t
    .Pengguna!.map(toUser)
    .map((user) => ({
      ...publicUser(user),
      links: links.filter((link) => link.user_id === user.user_id),
      manageable: canManageAccount(actor, user.peran),
    }))
    .sort((a, b) => Number(b.aktif) - Number(a.aktif) || order.indexOf(a.peran) - order.indexOf(b.peran) || a.nama.localeCompare(b.nama, "id"));
}

export async function loadAccount(actor: Actor, userId: string): Promise<AccountListItem> {
  const account = (await loadAccounts(actor)).find((a) => a.user_id === userId);
  if (!account) notFound();
  return account;
}

export interface Overview {
  activeStudents: number;
  capacity: number;
  activeClasses: number;
  activeEnrollments: number;
  onLeave: number;
  accountsByRole: Record<Role, number>;
  /** Siswa aktif per jalur target (hanya untuk pengelola siswa). "" = belum diisi. */
  byTrack: { TNI: number; Polri: number; Kedinasan: number; lainnya: number };
  myStudents: Student[];
  myClasses: (ClassGroup & { students: number })[];
}

export async function loadOverview(actor: Actor): Promise<Overview> {
  const t = await read(["Pengaturan", "Siswa", "Kelas", "Pendaftaran", "Pengguna"]);
  const students = t.Siswa!.map(toStudent);
  const enrollments = t.Pendaftaran!.map(toEnrollment);
  const classes = t.Kelas!.map(toClass);
  const users = t.Pengguna!.map(toUser).filter((u) => u.aktif);
  const accountsByRole = { OWNER: 0, ADMIN: 0, PENGAJAR: 0, SISWA: 0, WALI: 0 } as Record<Role, number>;
  if (canOpenAccounts(actor)) for (const user of users) accountsByRole[user.peran] += 1;
  const visibleIds = new Set([...linkedStudentIds(actor, "SISWA"), ...linkedStudentIds(actor, "WALI")]);
  const taught = new Set(taughtClassIds(actor));
  const admin = canManageStudents(actor);
  const byTrack = { TNI: 0, Polri: 0, Kedinasan: 0, lainnya: 0 };
  if (admin) for (const s of students) if (s.aktif) byTrack[s.jalur_target || "lainnya"] += 1;
  return {
    byTrack,
    activeStudents: admin ? students.filter((s) => s.aktif).length : 0,
    capacity: num(t.Pengaturan!.find((r) => r.key === "kapasitas_siswa")?.value, 30),
    activeClasses: admin ? classes.filter((c) => c.aktif).length : 0,
    activeEnrollments: admin ? enrollments.filter((e) => e.status === "AKTIF").length : 0,
    onLeave: admin ? enrollments.filter((e) => e.status === "CUTI").length : 0,
    accountsByRole,
    myStudents: students.filter((s) => visibleIds.has(s.siswa_id)),
    myClasses: classes
      .filter((c) => taught.has(c.kelas_id))
      .map((c) => ({ ...c, students: enrollments.filter((e) => e.kelas_id === c.kelas_id && e.status === "AKTIF").length })),
  };
}
