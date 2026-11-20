// Matriks hak akses (PRD bagian 2.1). Semua pemeriksaan dilakukan di server.
import { FITUR } from "./fitur";
import { linkedStudentIds, taughtClassIds, type Actor, type Enrollment, type FinanceAccess, type Role } from "./types";

const is = (actor: Actor, ...roles: Role[]) => roles.includes(actor.user.peran);

/** OWNER mengelola semua akun; ADMIN hanya akun pengajar, siswa, dan wali. */
export function canManageAccount(actor: Actor, targetRole: Role): boolean {
  if (is(actor, "OWNER")) return true;
  return is(actor, "ADMIN") && ["PENGAJAR", "SISWA", "WALI"].includes(targetRole);
}

export const canOpenAccounts = (actor: Actor) => is(actor, "OWNER", "ADMIN");
export const canSetFinanceAccess = (actor: Actor) => is(actor, "OWNER");
export const canManageInstitution = (actor: Actor) => is(actor, "OWNER");
export const canManageStudents = (actor: Actor) => is(actor, "OWNER", "ADMIN");
export const canManageClasses = (actor: Actor) => is(actor, "OWNER", "ADMIN");
export const canManageEnrollments = (actor: Actor) => is(actor, "OWNER", "ADMIN");

/** Tingkat akses keuangan efektif. OWNER selalu penuh; peran selain ADMIN tidak pernah punya akses. */
export function financeAccess(actor: Actor): FinanceAccess {
  if (is(actor, "OWNER")) return "CATAT";
  if (is(actor, "ADMIN")) return actor.user.akses_keuangan;
  return "TIDAK";
}

export const canViewFinance = (actor: Actor) => financeAccess(actor) !== "TIDAK";
export const canRecordFinance = (actor: Actor) => financeAccess(actor) === "CATAT";
/** Diskon, koreksi, refund, master, tutup periode: hanya OWNER. */
export const canCorrectFinance = (actor: Actor) => is(actor, "OWNER");
/** Siswa melihat tagihannya sendiri; wali melihat tagihan anak yang ditautkan. Mati bila fitur tagihan disembunyikan. */
export const canSeeChildBills = (actor: Actor) => FITUR.tagihan && is(actor, "WALI", "SISWA");
/** Siswa yang tagihannya boleh dilihat akun keluarga ini (dirinya sendiri, atau anak bagi wali). */
export const ownStudentIds = (actor: Actor) => linkedStudentIds(actor, actor.user.peran === "WALI" ? "WALI" : "SISWA");

/** Apakah pengguna boleh melihat profil seorang siswa. */
export function canViewStudent(actor: Actor, siswaId: string, enrollments: readonly Enrollment[]): boolean {
  if (is(actor, "OWNER", "ADMIN")) return true;
  if (is(actor, "SISWA")) return linkedStudentIds(actor, "SISWA").includes(siswaId);
  if (is(actor, "WALI")) return linkedStudentIds(actor, "WALI").includes(siswaId);
  if (is(actor, "PENGAJAR")) {
    const classes = new Set(taughtClassIds(actor));
    return enrollments.some((e) => e.siswa_id === siswaId && e.status === "AKTIF" && classes.has(e.kelas_id));
  }
  return false;
}

export interface MenuItem {
  key: string;
  label: string;
  /** Label pendek untuk navigasi bawah di ponsel. */
  short?: string;
  href: string;
  icon: "home" | "users" | "book" | "wallet" | "settings" | "user" | "check" | "chart" | "file" | "more" | "run" | "receipt" | "target" | "bell";
}

/**
 * Menu utama per peran. Urutan dipakai juga untuk navigasi bawah di ponsel (4 pertama + "Lainnya").
 * Bagian yang disembunyikan lewat FITUR tidak muncul; datanya tetap ada.
 */
export function menuFor(actor: Actor): MenuItem[] {
  const home: MenuItem = { key: "beranda", label: "Beranda", href: "/beranda", icon: "home" };
  const me: MenuItem = { key: "akun-saya", label: "Akun & PIN", short: "Akun", href: "/akun-saya", icon: "user" };
  const guide: MenuItem = { key: "panduan", label: "Panduan", href: "/panduan", icon: "file" };
  const presensi: MenuItem = { key: "presensi", label: "Presensi", href: "/akademik", icon: "check" };
  const samapta: MenuItem = { key: "samapta", label: "Tes Samapta", short: "Samapta", href: "/samapta", icon: "run" };
  const latihan: MenuItem = { key: "latihan", label: "Latihan", href: "/latihan", icon: "target" };
  const hidden: MenuItem[] = [
    ...(FITUR.nilai ? [{ key: "nilai", label: "Nilai & Tes", short: "Nilai", href: "/akademik/nilai", icon: "chart" } as MenuItem] : []),
    ...(FITUR.tugas ? [{ key: "tugas", label: "Tugas", href: "/akademik/tugas", icon: "book" } as MenuItem] : []),
    ...(FITUR.rapor ? [{ key: "rapor", label: "Rapor", href: "/akademik/rapor", icon: "file" } as MenuItem] : []),
  ];
  switch (actor.user.peran) {
    case "OWNER":
    case "ADMIN": {
      const items: MenuItem[] = [home, presensi, samapta];
      if (canViewFinance(actor)) items.push({ key: "keuangan", label: "Keuangan", href: "/keuangan", icon: "wallet" });
      items.push({ ...latihan, label: "Latihan siswa" });
      items.push({ key: "pengumuman", label: "Pengumuman", href: "/pengumuman", icon: "bell" });
      items.push({ key: "siswa", label: "Siswa", href: "/siswa", icon: "users" }, ...hidden);
      items.push({ key: "pengaturan", label: "Pengaturan", href: "/pengaturan", icon: "settings" }, guide);
      return items;
    }
    case "PENGAJAR":
      return [home, presensi, samapta, ...hidden, me, guide];
    case "SISWA":
      return [
        home,
        presensi,
        { ...samapta, label: "Hasil Samapta" },
        latihan,
        ...(FITUR.tagihan ? [{ key: "tagihan", label: "Tagihan", href: "/keuangan/tagihan", icon: "receipt" } as MenuItem] : []),
        ...hidden,
        me,
        guide,
      ];
    case "WALI":
      return [
        home,
        presensi,
        ...(FITUR.rapor ? [{ key: "rapor", label: "Rapor", href: "/akademik/rapor", icon: "file" } as MenuItem] : []),
        ...(FITUR.tagihan ? [{ key: "tagihan", label: "Tagihan", href: "/keuangan/tagihan", icon: "receipt" } as MenuItem] : []),
        me,
        guide,
      ];
  }
}
