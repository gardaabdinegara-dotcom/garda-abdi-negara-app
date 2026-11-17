// Membuat akun OWNER pertama. Password sementara hanya ditampilkan sekali di layar ini
// dan wajib diganti saat pertama masuk; tidak ada file teks berisi password.
//   npm run buat-owner -- --username pemilik --nama "Nama Pemilik"
import { ZodError } from "zod";
import { usernameSchema } from "../src/lib/core/validation";
import { loadEnvForScripts } from "../src/lib/config";
import { createDeps } from "../src/lib/deps";
import { createFirstOwner } from "../src/lib/setup";

loadEnvForScripts();

function arg(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? "") : "";
}

try {
  const username = usernameSchema.parse(arg("username"));
  const nama = arg("nama").trim();
  if (nama.length < 2) throw new Error('Isi nama dengan --nama "Nama Pemilik".');
  const result = await createFirstOwner(createDeps(), { username, nama });
  console.log("\nAkun OWNER dibuat.");
  console.log(`  Username          : ${username}`);
  console.log(`  Password sementara: ${result.password}`);
  console.log("\nCatat password ini sekarang. Password wajib diganti saat pertama masuk dan tidak disimpan di mana pun.");
} catch (error) {
  const message =
    error instanceof ZodError ? (error.issues[0]?.message ?? "Username tidak valid.") : error instanceof Error ? error.message : String(error);
  console.error(`Gagal membuat OWNER: ${message}`);
  process.exitCode = 1;
}
