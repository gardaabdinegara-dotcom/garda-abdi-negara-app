// Perintah domain Fase 1. Setiap fungsi mengubah salinan tabel (`t`) secara langsung dan
// mengembalikan ringkasan untuk tab Operasi. Tidak ada akses jaringan di sini.
import type { OperationContext, OperationOutcome } from "../data/coordinator";
import { num, str } from "../data/rows";
import { AppError, type Row, type Tables } from "../data/types";
import { created, find, forbidden, notFound, replace, rows, updated } from "./table-ops";
import {
  canManageAccount,
  canManageClasses,
  canManageEnrollments,
  canManageInstitution,
  canManageStudents,
  canSetFinanceAccess,
} from "./permissions";
import {
  toClass,
  toEnrollment,
  toLink,
  toProgram,
  toStudent,
  toUser,
  type Actor,
  type FinanceAccess,
  type Role,
} from "./types";
import type {
  ClassInput,
  EnrollmentInput,
  EnrollmentStatusInput,
  LinkInput,
  ProgramInput,
  SettingsInput,
  StudentInput,
  UserCreateInput,
  UserUpdateInput,
} from "./validation";

const today = (ctx: OperationContext) => ctx.now.slice(0, 10);

// ---------------------------------------------------------------- Pengaturan

export function setting(t: Tables, key: string): string {
  return str(rows(t, "Pengaturan").find((row) => row.key === key)?.value);
}

function putSetting(t: Tables, key: string, value: string | number | boolean, ctx: OperationContext): void {
  const list = rows(t, "Pengaturan");
  const index = list.findIndex((row) => row.key === key);
  const row = { key, value, updated_at: ctx.now, updated_by: ctx.actorId };
  if (index < 0) list.push(row);
  else list[index] = row;
}

export function updateSettings(t: Tables, input: SettingsInput, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!canManageInstitution(actor)) throw forbidden("Hanya Owner yang dapat mengubah pengaturan lembaga.");
  const before = Object.fromEntries(rows(t, "Pengaturan").map((row) => [String(row.key), row.value]));
  const activeStudents = rows(t, "Siswa").filter((row) => toStudent(row).aktif).length;
  if (input.kapasitas_siswa < activeStudents) {
    throw new AppError(`Kapasitas tidak boleh lebih kecil dari jumlah siswa aktif (${activeStudents}).`);
  }
  for (const [key, value] of Object.entries(input)) putSetting(t, key, value, ctx);
  return { entityType: "Pengaturan", entityId: "lembaga", message: "Pengaturan lembaga disimpan.", before, after: { ...input } };
}

// ---------------------------------------------------------------- Program & kelas

export function saveProgram(t: Tables, input: ProgramInput, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!canManageClasses(actor)) throw forbidden();
  const sameName = rows(t, "Program").find(
    (row) => str(row.nama_program).toLowerCase() === input.nama_program.toLowerCase() && row.program_id !== input.program_id,
  );
  if (sameName) throw new AppError("Nama program sudah dipakai.");
  if (input.program_id) {
    const found = find(t, "Program", "program_id", input.program_id);
    if (!found) throw notFound("Program");
    const row = { ...found.row, nama_program: input.nama_program, target_seleksi: input.target_seleksi, aktif: input.aktif, ...updated(ctx) };
    replace(t, "Program", found.index, row);
    return { entityType: "Program", entityId: input.program_id, message: "Program diperbarui.", before: found.row, after: row };
  }
  const row = {
    program_id: ctx.newId("PRG"),
    nama_program: input.nama_program,
    target_seleksi: input.target_seleksi,
    aktif: true,
    ...created(ctx),
  };
  rows(t, "Program").push(row);
  return { entityType: "Program", entityId: row.program_id, message: "Program ditambahkan.", after: row };
}

export function saveClass(t: Tables, input: ClassInput, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!canManageClasses(actor)) throw forbidden();
  const program = find(t, "Program", "program_id", input.program_id);
  if (!program) throw notFound("Program");
  const sameName = rows(t, "Kelas").find(
    (row) => str(row.nama_kelas).toLowerCase() === input.nama_kelas.toLowerCase() && row.kelas_id !== input.kelas_id,
  );
  if (sameName) throw new AppError("Nama kelas sudah dipakai.");
  if (input.kelas_id) {
    const found = find(t, "Kelas", "kelas_id", input.kelas_id);
    if (!found) throw notFound("Kelas");
    if (found.row.program_id !== input.program_id) {
      const used = rows(t, "Pendaftaran").some((row) => row.kelas_id === input.kelas_id && ["AKTIF", "CUTI"].includes(str(row.status)));
      if (used) throw new AppError("Program kelas tidak bisa diganti selama masih ada pendaftaran aktif di kelas ini.");
    }
    const row = { ...found.row, nama_kelas: input.nama_kelas, program_id: input.program_id, angkatan: input.angkatan, aktif: input.aktif, ...updated(ctx) };
    replace(t, "Kelas", found.index, row);
    return { entityType: "Kelas", entityId: input.kelas_id, message: "Kelas diperbarui.", before: found.row, after: row };
  }
  if (!toProgram(program.row).aktif) throw new AppError("Program sudah nonaktif.");
  const row = { kelas_id: ctx.newId("KLS"), nama_kelas: input.nama_kelas, program_id: input.program_id, angkatan: input.angkatan, aktif: true, ...created(ctx) };
  rows(t, "Kelas").push(row);
  return { entityType: "Kelas", entityId: row.kelas_id, message: "Kelas ditambahkan.", after: row };
}

// ---------------------------------------------------------------- Siswa

export function formatStudentCode(n: number): string {
  return `GAN-${String(n).padStart(4, "0")}`;
}

function activeStudentCount(t: Tables): number {
  return rows(t, "Siswa").filter((row) => toStudent(row).aktif).length;
}

function ensureCapacity(t: Tables): void {
  const capacity = num(setting(t, "kapasitas_siswa"), 30);
  if (activeStudentCount(t) >= capacity) {
    throw new AppError(`Kapasitas siswa aktif (${capacity}) sudah penuh. Ubah kapasitas di Pengaturan atau nonaktifkan siswa lain.`, "CAPACITY", 409);
  }
}

export function createStudent(t: Tables, input: StudentInput, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!canManageStudents(actor)) throw forbidden();
  ensureCapacity(t);
  // Kode siswa dibuat di dalam gerbang penyimpanan, sehingga tidak pernah ganda. Kode milik siswa yang DIHAPUS
  // dibebaskan dan dipakai lagi lebih dulu (kode bebas terkecil); siswa nonaktif tetap memegang kodenya.
  const used = new Set(rows(t, "Siswa").filter((row) => !str(row.dihapus_pada)).map((row) => str(row.kode_siswa)));
  let counter = num(setting(t, "penghitung_kode_siswa"), 0);
  let code = "";
  for (let n = 1; n <= counter && !code; n++) if (!used.has(formatStudentCode(n))) code = formatStudentCode(n);
  if (!code) {
    do code = formatStudentCode(++counter);
    while (used.has(code));
    putSetting(t, "penghitung_kode_siswa", counter, ctx);
  }
  const row = {
    siswa_id: ctx.newId("SIS"),
    kode_siswa: code,
    nama: input.nama,
    jenis_kelamin: input.jenis_kelamin,
    tanggal_lahir: input.tanggal_lahir,
    jalur_target: input.jalur_target,
    no_wa: input.no_wa,
    nama_wali: input.nama_wali,
    no_wa_wali: input.no_wa_wali,
    tanggal_daftar: input.tanggal_daftar || today(ctx),
    aktif: true,
    catatan: input.catatan,
    tempat_lahir: input.tempat_lahir,
    asal_sekolah: input.asal_sekolah,
    ...created(ctx),
  };
  rows(t, "Siswa").push(row);
  return { entityType: "Siswa", entityId: row.siswa_id, message: `Siswa ${row.nama} ditambahkan dengan kode ${code}.`, after: row, data: { kode_siswa: code } };
}

/** Akun login siswa (tautan jenis SISWA). Kosong bila tab akun tidak ikut dimuat. */
function studentAccounts(t: Tables, siswaId: string): { row: Row; index: number }[] {
  if (!t.Pengguna || !t.Tautan_Akun) return [];
  const ids = new Set(t.Tautan_Akun.filter((l) => l.jenis === "SISWA" && l.siswa_id === siswaId).map((l) => String(l.user_id)));
  return t.Pengguna.map((row, index) => ({ row, index })).filter(({ row }) => ids.has(String(row.user_id)) && row.peran === "SISWA");
}

export function updateStudent(t: Tables, siswaId: string, input: StudentInput, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!canManageStudents(actor)) throw forbidden();
  const found = find(t, "Siswa", "siswa_id", siswaId);
  if (!found) throw notFound("Siswa");
  // Kode siswa dan status aktif tidak diubah dari form identitas.
  const row = {
    ...found.row,
    nama: input.nama,
    jenis_kelamin: input.jenis_kelamin,
    tanggal_lahir: input.tanggal_lahir,
    jalur_target: input.jalur_target,
    no_wa: input.no_wa,
    nama_wali: input.nama_wali,
    no_wa_wali: input.no_wa_wali,
    tanggal_daftar: input.tanggal_daftar || str(found.row.tanggal_daftar),
    catatan: input.catatan,
    tempat_lahir: input.tempat_lahir,
    asal_sekolah: input.asal_sekolah,
    ...updated(ctx),
  };
  replace(t, "Siswa", found.index, row);
  // Nama di akun login siswa ikut berubah agar sapaan dan daftar akun tetap sama dengan data siswa.
  if (str(found.row.nama) !== input.nama) {
    for (const account of studentAccounts(t, siswaId)) replace(t, "Pengguna", account.index, { ...account.row, nama: input.nama, ...updated(ctx) });
  }
  return { entityType: "Siswa", entityId: siswaId, message: "Data siswa diperbarui.", before: found.row, after: row };
}

/** Akun yang dihapus: nonaktif, sesi berakhir, tautan dilepas, username dibebaskan agar bisa dipakai lagi. */
function markUserDeleted(t: Tables, index: number, ctx: OperationContext): Row {
  const row = rows(t, "Pengguna")[index]!;
  const after = {
    ...row,
    aktif: false,
    username: `${str(row.username)}~hapus-${str(row.user_id).slice(-6).toLowerCase()}`,
    versi_otorisasi: num(row.versi_otorisasi, 1) + 1,
    dihapus_pada: ctx.now,
    ...updated(ctx),
  };
  replace(t, "Pengguna", index, after);
  rows(t, "Tautan_Akun").forEach((link, i) => {
    if (link.user_id === row.user_id && link.aktif) replace(t, "Tautan_Akun", i, { ...link, aktif: false, ...updated(ctx) });
  });
  return after;
}

/**
 * Menghapus siswa: hilang dari daftar dan hitungan, akun loginnya ikut dihapus. Baris tetap ada di spreadsheet
 * (ditandai dihapus_pada) agar riwayat presensi, tes, dan keuangan tidak rusak.
 */
export function deleteStudent(t: Tables, siswaId: string, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!canManageStudents(actor)) throw forbidden();
  const found = find(t, "Siswa", "siswa_id", siswaId);
  if (!found || str(found.row.dihapus_pada)) throw notFound("Siswa");
  // Kode diberi akhiran agar jelas di spreadsheet dan bebas dipakai siswa baru.
  const row = { ...found.row, aktif: false, kode_siswa: `${str(found.row.kode_siswa)}~hapus`, dihapus_pada: ctx.now, ...updated(ctx) };
  replace(t, "Siswa", found.index, row);
  for (const account of studentAccounts(t, siswaId)) if (!str(account.row.dihapus_pada)) markUserDeleted(t, account.index, ctx);
  return { entityType: "Siswa", entityId: siswaId, message: `Siswa ${str(found.row.nama)} dihapus.`, before: found.row, after: row };
}

export function setStudentActive(t: Tables, siswaId: string, active: boolean, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!canManageStudents(actor)) throw forbidden();
  const found = find(t, "Siswa", "siswa_id", siswaId);
  if (!found) throw notFound("Siswa");
  if (toStudent(found.row).aktif === active) {
    return { entityType: "Siswa", entityId: siswaId, message: active ? "Siswa sudah aktif." : "Siswa sudah nonaktif." };
  }
  if (active) ensureCapacity(t);
  const row = { ...found.row, aktif: active, ...updated(ctx) };
  replace(t, "Siswa", found.index, row);
  // Siswa nonaktif tidak bisa masuk lagi; akunnya aktif kembali bersama siswanya.
  for (const account of studentAccounts(t, siswaId)) replace(t, "Pengguna", account.index, { ...account.row, aktif: active, ...updated(ctx) });
  return {
    entityType: "Siswa",
    entityId: siswaId,
    message: active ? "Siswa diaktifkan kembali." : "Siswa dinonaktifkan. Riwayatnya tetap tersimpan.",
    before: found.row,
    after: row,
  };
}

// ---------------------------------------------------------------- Pendaftaran

const OPEN_STATUS = ["AKTIF", "CUTI"];

export function createEnrollment(t: Tables, input: EnrollmentInput, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!canManageEnrollments(actor)) throw forbidden();
  const student = find(t, "Siswa", "siswa_id", input.siswa_id);
  if (!student) throw notFound("Siswa");
  if (!toStudent(student.row).aktif) throw new AppError("Siswa nonaktif tidak bisa didaftarkan.");
  const program = find(t, "Program", "program_id", input.program_id);
  if (!program || !toProgram(program.row).aktif) throw new AppError("Program tidak ditemukan atau nonaktif.");
  const kelas = find(t, "Kelas", "kelas_id", input.kelas_id);
  if (!kelas || !toClass(kelas.row).aktif) throw new AppError("Kelas tidak ditemukan atau nonaktif.");
  if (kelas.row.program_id !== input.program_id) throw new AppError("Kelas yang dipilih bukan bagian dari program ini.");
  const open = rows(t, "Pendaftaran").some(
    (row) => row.siswa_id === input.siswa_id && row.program_id === input.program_id && OPEN_STATUS.includes(str(row.status)),
  );
  if (open) throw new AppError("Siswa masih punya pendaftaran aktif atau cuti di program ini.", "DUPLICATE", 409);
  const row = {
    pendaftaran_id: ctx.newId("DAF"),
    siswa_id: input.siswa_id,
    program_id: input.program_id,
    kelas_id: input.kelas_id,
    tanggal_mulai: input.tanggal_mulai || today(ctx),
    tanggal_selesai: "",
    status: "AKTIF",
    ...created(ctx),
  };
  rows(t, "Pendaftaran").push(row);
  return { entityType: "Pendaftaran", entityId: row.pendaftaran_id, message: "Pendaftaran ditambahkan.", after: row };
}

export function updateEnrollmentStatus(t: Tables, input: EnrollmentStatusInput, ctx: OperationContext, actor: Actor): OperationOutcome {
  if (!canManageEnrollments(actor)) throw forbidden();
  const found = find(t, "Pendaftaran", "pendaftaran_id", input.pendaftaran_id);
  if (!found) throw notFound("Pendaftaran");
  const current = toEnrollment(found.row);
  if (OPEN_STATUS.includes(input.status) && !OPEN_STATUS.includes(current.status)) {
    const other = rows(t, "Pendaftaran").some(
      (row) =>
        row.pendaftaran_id !== current.pendaftaran_id &&
        row.siswa_id === current.siswa_id &&
        row.program_id === current.program_id &&
        OPEN_STATUS.includes(str(row.status)),
    );
    if (other) throw new AppError("Siswa sudah punya pendaftaran aktif lain di program ini.", "DUPLICATE", 409);
  }
  const closing = input.status === "SELESAI" || input.status === "BERHENTI";
  const row = {
    ...found.row,
    status: input.status,
    tanggal_selesai: closing ? input.tanggal_selesai || today(ctx) : "",
    ...updated(ctx),
  };
  replace(t, "Pendaftaran", found.index, row);
  return { entityType: "Pendaftaran", entityId: current.pendaftaran_id, message: "Status pendaftaran diperbarui.", before: found.row, after: row };
}

// ---------------------------------------------------------------- Akun

function activeOwners(t: Tables): string[] {
  return rows(t, "Pengguna")
    .map(toUser)
    .filter((user) => user.peran === "OWNER" && user.aktif)
    .map((user) => user.user_id);
}

export const hasActiveOwner = (t: Tables) => activeOwners(t).length > 0;

/** Akses keuangan hanya bermakna untuk ADMIN; peran lain selalu "TIDAK". */
const financeFor = (role: Role, requested: FinanceAccess): FinanceAccess => (role === "ADMIN" ? requested : "TIDAK");

/**
 * Membuat akun. `actor` bernilai null hanya untuk pembuatan OWNER pertama lewat perintah setup,
 * dan hanya bila belum ada OWNER aktif.
 */
export function createUser(
  t: Tables,
  input: UserCreateInput,
  passwordHash: string,
  ctx: OperationContext,
  actor: Actor | null,
): OperationOutcome {
  if (actor === null) {
    if (input.peran !== "OWNER" || hasActiveOwner(t)) throw forbidden("Akun awal hanya untuk OWNER pertama.");
  } else {
    if (!canManageAccount(actor, input.peran)) throw forbidden(`Anda tidak dapat membuat akun ${input.peran}.`);
    if (input.akses_keuangan !== "TIDAK" && !canSetFinanceAccess(actor)) throw forbidden("Hanya Owner yang dapat memberi akses keuangan.");
  }
  const username = input.username.trim().toLowerCase();
  const taken = rows(t, "Pengguna").some((row) => str(row.username).toLowerCase() === username);
  if (taken) throw new AppError("Username sudah dipakai.", "DUPLICATE", 409);
  const row = {
    user_id: ctx.newId("USR"),
    username,
    nama: input.nama,
    peran: input.peran,
    password_hash: passwordHash,
    wajib_ganti_password: true,
    versi_otorisasi: 1,
    akses_keuangan: financeFor(input.peran, input.akses_keuangan),
    aktif: true,
    terakhir_masuk: "",
    ...created(ctx),
  };
  rows(t, "Pengguna").push(row);
  return { entityType: "Pengguna", entityId: row.user_id, message: `Akun ${row.username} dibuat.`, after: row };
}

function targetUser(t: Tables, userId: string) {
  const found = find(t, "Pengguna", "user_id", userId);
  if (!found) throw notFound("Akun");
  return { ...found, user: toUser(found.row) };
}

/** Menghapus akun (bukan akun sendiri, dan owner terakhir tidak boleh dihapus). */
export function deleteUser(t: Tables, userId: string, ctx: OperationContext, actor: Actor): OperationOutcome {
  const target = targetUser(t, userId);
  if (str(target.row.dihapus_pada)) throw notFound("Akun");
  if (!canManageAccount(actor, target.user.peran)) throw forbidden();
  if (target.user.user_id === actor.user.user_id) throw new AppError("Akun yang sedang dipakai tidak bisa dihapus.");
  if (target.user.peran === "OWNER" && activeOwners(t).filter((id) => id !== target.user.user_id).length === 0) {
    throw new AppError("Owner terakhir tidak bisa dihapus.");
  }
  const after = markUserDeleted(t, target.index, ctx);
  return { entityType: "Pengguna", entityId: userId, message: `Akun ${target.user.username} dihapus.`, before: target.row, after };
}

export function updateUser(t: Tables, input: UserUpdateInput, ctx: OperationContext, actor: Actor): OperationOutcome {
  const target = targetUser(t, input.user_id);
  if (!canManageAccount(actor, target.user.peran) || !canManageAccount(actor, input.peran)) throw forbidden();
  const self = target.user.user_id === actor.user.user_id;
  if (self && (input.peran !== target.user.peran || !input.aktif)) {
    throw new AppError("Anda tidak dapat mengubah peran atau menonaktifkan akun sendiri.");
  }
  const losingOwner = target.user.peran === "OWNER" && target.user.aktif && (input.peran !== "OWNER" || !input.aktif);
  if (losingOwner && activeOwners(t).length <= 1) throw new AppError("Harus selalu ada setidaknya satu Owner aktif.");
  let access = financeFor(input.peran, input.akses_keuangan);
  if (access !== target.user.akses_keuangan && !canSetFinanceAccess(actor)) {
    access = financeFor(input.peran, target.user.akses_keuangan);
  }
  const roleChanged = input.peran !== target.user.peran || input.aktif !== target.user.aktif || access !== target.user.akses_keuangan;
  const row = {
    ...target.row,
    nama: input.nama,
    peran: input.peran,
    aktif: input.aktif,
    akses_keuangan: access,
    // Perubahan hak akses memaksa semua sesi akun ini masuk ulang.
    versi_otorisasi: target.user.versi_otorisasi + (roleChanged ? 1 : 0),
    ...updated(ctx),
  };
  replace(t, "Pengguna", target.index, row);
  return { entityType: "Pengguna", entityId: target.user.user_id, message: "Akun diperbarui.", before: target.row, after: row };
}

export function resetPassword(t: Tables, userId: string, passwordHash: string, ctx: OperationContext, actor: Actor): OperationOutcome {
  const target = targetUser(t, userId);
  if (!canManageAccount(actor, target.user.peran)) throw forbidden();
  const row = {
    ...target.row,
    password_hash: passwordHash,
    wajib_ganti_password: true,
    versi_otorisasi: target.user.versi_otorisasi + 1,
    ...updated(ctx),
  };
  replace(t, "Pengguna", target.index, row);
  return { entityType: "Pengguna", entityId: userId, message: `Password sementara untuk ${target.user.username} dibuat.`, before: target.row, after: row };
}

/** Mengganti password sendiri. Semua sesi lain ikut keluar; sesi saat ini diterbitkan ulang oleh pemanggil. */
export function changeOwnPassword(t: Tables, passwordHash: string, ctx: OperationContext, actor: Actor): OperationOutcome<{ versi: number }> {
  const target = targetUser(t, actor.user.user_id);
  const versi = target.user.versi_otorisasi + 1;
  const row = { ...target.row, password_hash: passwordHash, wajib_ganti_password: false, versi_otorisasi: versi, ...updated(ctx) };
  replace(t, "Pengguna", target.index, row);
  return { entityType: "Pengguna", entityId: actor.user.user_id, message: "Password diganti.", before: target.row, after: row, data: { versi } };
}

export function revokeSessions(t: Tables, userId: string, ctx: OperationContext, actor: Actor): OperationOutcome {
  const target = targetUser(t, userId);
  if (target.user.user_id !== actor.user.user_id && !canManageAccount(actor, target.user.peran)) throw forbidden();
  const row = { ...target.row, versi_otorisasi: target.user.versi_otorisasi + 1, ...updated(ctx) };
  replace(t, "Pengguna", target.index, row);
  return { entityType: "Pengguna", entityId: userId, message: "Semua sesi akun ini telah diakhiri.", before: target.row, after: row };
}

// ---------------------------------------------------------------- Tautan akun

const LINK_ROLE: Record<LinkInput["jenis"], Role> = { SISWA: "SISWA", WALI: "WALI", PENGAJAR_KELAS: "PENGAJAR" };

export function addLink(t: Tables, input: LinkInput, ctx: OperationContext, actor: Actor): OperationOutcome {
  const target = targetUser(t, input.user_id);
  if (!canManageAccount(actor, target.user.peran)) throw forbidden();
  if (LINK_ROLE[input.jenis] !== target.user.peran) throw new AppError("Jenis tautan tidak sesuai dengan peran akun.");
  const links = rows(t, "Tautan_Akun").map(toLink).filter((link) => link.aktif);
  if (input.jenis === "PENGAJAR_KELAS") {
    if (!input.kelas_id || !find(t, "Kelas", "kelas_id", input.kelas_id)) throw notFound("Kelas");
    if (links.some((l) => l.user_id === input.user_id && l.kelas_id === input.kelas_id)) throw new AppError("Kelas ini sudah ditautkan.");
  } else {
    const student = input.siswa_id ? find(t, "Siswa", "siswa_id", input.siswa_id) : null;
    if (!student) throw notFound("Siswa");
    if (links.some((l) => l.user_id === input.user_id && l.siswa_id === input.siswa_id)) throw new AppError("Siswa ini sudah ditautkan.");
    if (input.jenis === "SISWA") {
      if (links.some((l) => l.jenis === "SISWA" && l.user_id === input.user_id)) throw new AppError("Akun siswa hanya bisa ditautkan ke satu data siswa.");
      if (links.some((l) => l.jenis === "SISWA" && l.siswa_id === input.siswa_id)) throw new AppError("Data siswa ini sudah punya akun siswa lain.");
    }
  }
  const row = {
    tautan_id: ctx.newId("TAU"),
    user_id: input.user_id,
    jenis: input.jenis,
    siswa_id: input.jenis === "PENGAJAR_KELAS" ? "" : input.siswa_id,
    kelas_id: input.jenis === "PENGAJAR_KELAS" ? input.kelas_id : "",
    aktif: true,
    ...created(ctx),
  };
  rows(t, "Tautan_Akun").push(row);
  return { entityType: "Tautan_Akun", entityId: row.tautan_id, message: "Tautan ditambahkan.", after: row };
}

export function removeLink(t: Tables, tautanId: string, ctx: OperationContext, actor: Actor): OperationOutcome {
  const found = find(t, "Tautan_Akun", "tautan_id", tautanId);
  if (!found) throw notFound("Tautan");
  const target = targetUser(t, str(found.row.user_id));
  if (!canManageAccount(actor, target.user.peran)) throw forbidden();
  const row = { ...found.row, aktif: false, ...updated(ctx) };
  replace(t, "Tautan_Akun", found.index, row);
  return { entityType: "Tautan_Akun", entityId: tautanId, message: "Tautan dilepas.", before: found.row, after: row };
}
