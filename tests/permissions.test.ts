import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  canCorrectFinance,
  canManageAccount,
  canManageInstitution,
  canManageStudents,
  canOpenAccounts,
  canRecordFinance,
  canSeeChildBills,
  canSetFinanceAccess,
  canViewFinance,
  canViewStudent,
  financeAccess,
  menuFor,
} from "../src/lib/core/permissions";
import { ROLES, type Enrollment, type Role } from "../src/lib/core/types";
import { actor, link } from "./helpers";
import { FITUR } from "../src/lib/core/fitur";

describe("matriks hak akses per peran (PRD 2.1)", () => {
  test("siapa boleh mengelola akun siapa", () => {
    const expected: Record<Role, Role[]> = {
      OWNER: ["OWNER", "ADMIN", "PENGAJAR", "SISWA", "WALI"],
      ADMIN: ["PENGAJAR", "SISWA", "WALI"],
      PENGAJAR: [],
      SISWA: [],
      WALI: [],
    };
    for (const role of ROLES) {
      const allowed = ROLES.filter((target) => canManageAccount(actor(role), target));
      assert.deepEqual(allowed, expected[role], `peran ${role}`);
    }
  });

  test("hak kelola data inti dan lembaga", () => {
    const table = ROLES.map((role) => {
      const a = actor(role);
      return [role, canOpenAccounts(a), canManageStudents(a), canManageInstitution(a), canSetFinanceAccess(a)];
    });
    assert.deepEqual(table, [
      ["OWNER", true, true, true, true],
      ["ADMIN", true, true, false, false],
      ["PENGAJAR", false, false, false, false],
      ["SISWA", false, false, false, false],
      ["WALI", false, false, false, false],
    ]);
  });

  test("akses keuangan: owner penuh, admin sesuai akun, peran lain tidak pernah", () => {
    assert.equal(financeAccess(actor("OWNER")), "CATAT");
    assert.equal(financeAccess(actor("ADMIN")), "TIDAK");
    assert.equal(financeAccess(actor("ADMIN", { akses: "LIHAT" })), "LIHAT");
    assert.equal(financeAccess(actor("ADMIN", { akses: "CATAT" })), "CATAT");
    // Nilai rusak di spreadsheet tidak boleh membuka keuangan untuk peran lain.
    for (const role of ["PENGAJAR", "SISWA", "WALI"] as const) assert.equal(financeAccess(actor(role, { akses: "CATAT" })), "TIDAK");
  });

  test("lihat, catat, dan koreksi keuangan", () => {
    const lihat = actor("ADMIN", { akses: "LIHAT" });
    const catat = actor("ADMIN", { akses: "CATAT" });
    assert.deepEqual([canViewFinance(lihat), canRecordFinance(lihat), canCorrectFinance(lihat)], [true, false, false]);
    assert.deepEqual([canViewFinance(catat), canRecordFinance(catat), canCorrectFinance(catat)], [true, true, false]);
    assert.deepEqual([canViewFinance(actor("OWNER")), canRecordFinance(actor("OWNER")), canCorrectFinance(actor("OWNER"))], [true, true, true]);
    assert.equal(canViewFinance(actor("ADMIN")), false);
  });

  test("tagihan milik sendiri (siswa dan wali) hanya bila fitur tagihan menyala", () => {
    assert.deepEqual(
      ROLES.filter((role) => canSeeChildBills(actor(role))),
      FITUR.tagihan ? ["SISWA", "WALI"] : [],
    );
  });
});

describe("siapa boleh melihat profil siswa", () => {
  const enrollments: Enrollment[] = [
    { pendaftaran_id: "DAF_1", siswa_id: "SIS_A", program_id: "PRG_1", kelas_id: "KLS_1", tanggal_mulai: "2026-07-01", tanggal_selesai: "", status: "AKTIF" },
    { pendaftaran_id: "DAF_2", siswa_id: "SIS_B", program_id: "PRG_1", kelas_id: "KLS_2", tanggal_mulai: "2026-07-01", tanggal_selesai: "", status: "AKTIF" },
    { pendaftaran_id: "DAF_3", siswa_id: "SIS_C", program_id: "PRG_1", kelas_id: "KLS_1", tanggal_mulai: "2026-07-01", tanggal_selesai: "", status: "CUTI" },
  ];

  test("owner dan admin melihat semua", () => {
    for (const role of ["OWNER", "ADMIN"] as const) {
      assert.ok(["SIS_A", "SIS_B", "SIS_X"].every((id) => canViewStudent(actor(role), id, enrollments)));
    }
  });

  test("siswa hanya dirinya, wali hanya anak yang ditautkan", () => {
    const siswa = actor("SISWA", { links: [link("SISWA", { siswa_id: "SIS_A" })] });
    assert.equal(canViewStudent(siswa, "SIS_A", enrollments), true);
    assert.equal(canViewStudent(siswa, "SIS_B", enrollments), false);
    const wali = actor("WALI", { links: [link("WALI", { siswa_id: "SIS_A" }), link("WALI", { siswa_id: "SIS_B" }, false)] });
    assert.equal(canViewStudent(wali, "SIS_A", enrollments), true);
    assert.equal(canViewStudent(wali, "SIS_B", enrollments), false, "tautan nonaktif tidak berlaku");
    // Tautan jenis lain tidak memberi akses.
    const waliSalah = actor("WALI", { links: [link("SISWA", { siswa_id: "SIS_A" })] });
    assert.equal(canViewStudent(waliSalah, "SIS_A", enrollments), false);
  });

  test("pengajar hanya siswa aktif di kelas yang diajar", () => {
    const pengajar = actor("PENGAJAR", { links: [link("PENGAJAR_KELAS", { kelas_id: "KLS_1" })] });
    assert.equal(canViewStudent(pengajar, "SIS_A", enrollments), true);
    assert.equal(canViewStudent(pengajar, "SIS_B", enrollments), false, "kelas lain");
    assert.equal(canViewStudent(pengajar, "SIS_C", enrollments), false, "sedang cuti");
  });
});

describe("menu per peran (PRD 3)", () => {
  const keys = (a: ReturnType<typeof actor>) => menuFor(a).map((item) => item.key);

  test("susunan menu", () => {
    // Arah 17 Nov 2026: Presensi, Tes Samapta, Keuangan; nilai/tugas/rapor disembunyikan (lib/core/fitur.ts).
    assert.deepEqual(keys(actor("OWNER")), ["beranda", "presensi", "samapta", "keuangan", "siswa", "pengaturan", "panduan"]);
    assert.deepEqual(keys(actor("ADMIN")), ["beranda", "presensi", "samapta", "siswa", "pengaturan", "panduan"]);
    assert.deepEqual(keys(actor("ADMIN", { akses: "LIHAT" })), ["beranda", "presensi", "samapta", "keuangan", "siswa", "pengaturan", "panduan"]);
    assert.deepEqual(keys(actor("PENGAJAR")), ["beranda", "presensi", "samapta", "akun-saya", "panduan"]);
    // Tagihan siswa disembunyikan: keuangan dicatat manual oleh owner.
    assert.deepEqual(keys(actor("SISWA")), ["beranda", "presensi", "samapta", "akun-saya", "panduan"]);
    assert.deepEqual(keys(actor("WALI")), ["beranda", "presensi", "akun-saya", "panduan"]);
  });

  test("menu keuangan dan pengaturan tidak bocor ke peran lain", () => {
    for (const role of ["PENGAJAR", "SISWA", "WALI"] as const) {
      const hrefs = menuFor(actor(role, { akses: "CATAT" })).map((item) => item.href);
      assert.ok(!hrefs.includes("/pengaturan"), role);
      assert.ok(!hrefs.includes("/keuangan"), role);
    }
    assert.deepEqual(menuFor(actor("SISWA")).filter((item) => item.href.startsWith("/keuangan")).map((item) => item.href), FITUR.tagihan ? ["/keuangan/tagihan"] : []);
  });
});
