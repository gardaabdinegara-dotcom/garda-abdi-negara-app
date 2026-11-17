// Akun siswa dengan PIN: username = kode siswa (mis. gan-0001), PIN dibuat sendiri saat masuk pertama.
// Lupa PIN → Owner menekan "Reset PIN", lalu siswa membuat PIN baru saat masuk berikutnya.
import type { OperationContext, OperationOutcome } from "../data/coordinator";
import { str } from "../data/rows";
import { AppError, type Tables } from "../data/types";
import { canManageAccount } from "./permissions";
import { created, find, forbidden, notFound, replace, rows, updated } from "./table-ops";
import { toLink, toUser, type Actor, type User } from "./types";

export const PIN_LENGTH = 6;

/** Aturan PIN: tepat 6 angka, bukan angka yang sama semua, bukan urutan naik/turun. */
export function pinProblem(pin: string): string | null {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) return `PIN harus ${PIN_LENGTH} angka.`;
  if (/^(\d)\1+$/.test(pin)) return "PIN tidak boleh angka yang sama semua.";
  const digits = [...pin].map(Number);
  const step = digits[1]! - digits[0]!;
  if ((step === 1 || step === -1) && digits.every((d, i) => i === 0 || d - digits[i - 1]! === step)) return "PIN tidak boleh angka berurutan.";
  return null;
}

/** Akun siswa yang belum punya PIN (boleh membuat PIN saat masuk pertama). */
export const needsPin = (user: Pick<User, "peran" | "password_hash" | "aktif">) => user.aktif && user.peran === "SISWA" && !user.password_hash;

export const studentUsername = (kodeSiswa: string) => kodeSiswa.trim().toLowerCase();

/**
 * Membuat akun SISWA untuk data siswa: username = kode siswa, belum ber-PIN, langsung ditautkan.
 * Dilewati (tanpa galat) bila siswa itu sudah punya akun siswa aktif.
 */
export function createStudentAccount(t: Tables, siswaId: string, ctx: OperationContext, actor: Actor): OperationOutcome<{ username: string; created: boolean }> {
  if (!canManageAccount(actor, "SISWA")) throw forbidden("Anda tidak dapat membuat akun siswa.");
  const student = find(t, "Siswa", "siswa_id", siswaId);
  if (!student) throw notFound("Siswa");
  const username = studentUsername(str(student.row.kode_siswa));
  const linked = rows(t, "Tautan_Akun")
    .map(toLink)
    .find((link) => link.aktif && link.jenis === "SISWA" && link.siswa_id === siswaId);
  if (linked) return { entityType: "Pengguna", entityId: linked.user_id, message: "Siswa ini sudah punya akun.", data: { username, created: false } };
  if (rows(t, "Pengguna").some((row) => str(row.username).toLowerCase() === username)) {
    throw new AppError(`Username ${username} sudah dipakai akun lain.`, "DUPLICATE", 409);
  }
  const user = {
    user_id: ctx.newId("USR"),
    username,
    nama: str(student.row.nama),
    peran: "SISWA",
    password_hash: "",
    wajib_ganti_password: false,
    versi_otorisasi: 1,
    akses_keuangan: "TIDAK",
    aktif: true,
    terakhir_masuk: "",
    ...created(ctx),
  };
  rows(t, "Pengguna").push(user);
  rows(t, "Tautan_Akun").push({ tautan_id: ctx.newId("TAU"), user_id: user.user_id, jenis: "SISWA", siswa_id: siswaId, kelas_id: "", aktif: true, ...created(ctx) });
  return { entityType: "Pengguna", entityId: user.user_id, message: `Akun siswa ${username} dibuat.`, after: user, data: { username, created: true } };
}

/** PIN pertama dibuat oleh siswa sendiri; hanya boleh bila akun memang belum ber-PIN. */
export function setFirstPin(t: Tables, username: string, pinHash: string, ctx: OperationContext): OperationOutcome<{ user_id: string; versi: number }> {
  const index = rows(t, "Pengguna").findIndex((row) => str(row.username).toLowerCase() === username.trim().toLowerCase());
  const row = rows(t, "Pengguna")[index];
  if (!row || !needsPin(toUser(row))) throw new AppError("PIN akun ini sudah dibuat. Masuk dengan PIN, atau minta admin mereset PIN.", "PIN_EXISTS", 409);
  const versi = toUser(row).versi_otorisasi + 1;
  const next = { ...row, password_hash: pinHash, wajib_ganti_password: false, versi_otorisasi: versi, ...updated(ctx) };
  replace(t, "Pengguna", index, next);
  return { entityType: "Pengguna", entityId: str(row.user_id), message: "PIN dibuat.", before: row, after: next, data: { user_id: str(row.user_id), versi } };
}

/** Owner mereset PIN siswa: PIN lama dihapus, semua sesi siswa itu berakhir. */
export function resetPin(t: Tables, userId: string, ctx: OperationContext, actor: Actor): OperationOutcome {
  const found = find(t, "Pengguna", "user_id", userId);
  if (!found) throw notFound("Akun");
  const user = toUser(found.row);
  if (user.peran !== "SISWA") throw new AppError("Reset PIN hanya untuk akun siswa.");
  if (!canManageAccount(actor, "SISWA")) throw forbidden();
  const next = { ...found.row, password_hash: "", wajib_ganti_password: false, versi_otorisasi: user.versi_otorisasi + 1, ...updated(ctx) };
  replace(t, "Pengguna", found.index, next);
  return { entityType: "Pengguna", entityId: userId, message: `PIN ${user.username} direset. Siswa membuat PIN baru saat masuk berikutnya.`, before: found.row, after: next };
}
