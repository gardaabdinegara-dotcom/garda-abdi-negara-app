// Impor siswa dari berkas teks (satu nama per baris, nomor urut boleh ikut).
//   npx tsx scripts/impor-siswa.ts <berkas.txt> --jalur TNI --kelamin L            → pratinjau saja
//   npx tsx scripts/impor-siswa.ts <berkas.txt> --jalur TNI --kelamin L --terapkan → simpan ke spreadsheet
// Nama yang sudah ada dilewati, jadi aman dijalankan ulang.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { loadEnvForScripts } from "../src/lib/config";
import { importStudents, parseNameList, type ImportResult } from "../src/lib/core/impor";
import { TARGETS, toUser, type Actor, type Target } from "../src/lib/core/types";
import { runOperation } from "../src/lib/data/coordinator";
import { createDeps } from "../src/lib/deps";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const jalur = opt("jalur") as Target | undefined;
// Nomor urut siswa perempuan pada daftar, dipisah koma (mis. --perempuan 24). Sisanya laki-laki.
const perempuan = (opt("perempuan") ?? "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);
if (!file || !jalur || !(TARGETS as readonly string[]).includes(jalur)) {
  console.error("Pakai: npx tsx scripts/impor-siswa.ts <berkas.txt> --jalur TNI|Polri|Kedinasan [--perempuan 3,7] [--terapkan]");
  process.exit(1);
}

loadEnvForScripts();
const names = parseNameList(fs.readFileSync(file, "utf8"));
console.log(`${names.length} nama terbaca:`);
names.forEach((n, i) => console.log(`${String(i + 1).padStart(2)}. ${n}  (${perempuan.includes(i + 1) ? "P" : "L"}, ${jalur})`));

if (!args.includes("--terapkan")) {
  console.log("\nPratinjau saja. Tambahkan --terapkan untuk menyimpan.");
  process.exit(0);
}

const deps = createDeps();
const users = (await deps.store.read("inti", ["Pengguna"], { fresh: true })).Pengguna ?? [];
const ownerRow = users.find((r) => String(r.peran) === "OWNER" && String(r.aktif) !== "false");
if (!ownerRow) throw new Error("Belum ada akun OWNER aktif. Jalankan npm run buat-owner dulu.");
const actor: Actor = { user: toUser(ownerRow), links: [] };

const result = await runOperation<ImportResult>(deps, {
  sheet: "inti",
  operationId: randomUUID(),
  actorId: actor.user.user_id,
  action: "imporSiswa",
  fingerprint: { names, jalur, perempuan },
  tables: ["Pengaturan", "Siswa", "Pengguna", "Tautan_Akun"],
  apply: (t, ctx) => importStudents(t, names, { jalur_target: jalur, perempuan }, ctx, actor),
});
const data = result.outcome.data!;
console.log(`\n${result.outcome.message}`);
for (const s of data.added) console.log(`  ${s.kode_siswa}  (username ${s.kode_siswa.toLowerCase()})  ${s.nama}`);
if (data.skipped.length) console.log(`Dilewati: ${data.skipped.join(", ")}`);
