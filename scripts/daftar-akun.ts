// Menampilkan daftar akun (username, peran, status) tanpa hash password.
//   npx tsx scripts/daftar-akun.ts
import { loadEnvForScripts } from "../src/lib/config";
import { createDeps } from "../src/lib/deps";

loadEnvForScripts();
const t = await createDeps().store.read("inti", ["Pengguna", "Siswa"]);
const users = (t.Pengguna ?? []).map((r) => ({
  username: String(r.username),
  peran: String(r.peran),
  aktif: String(r.aktif),
  wajib_ganti_password: String(r.wajib_ganti_password),
}));
console.log(`${users.length} akun:`);
for (const u of users) console.log(`- ${u.username} (${u.peran}) aktif=${u.aktif} wajib_ganti_password=${u.wajib_ganti_password}`);
console.log(`Siswa tercatat: ${(t.Siswa ?? []).length}`);
