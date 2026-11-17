// Mengatur password AWAL akun owner (bawaan "admin") yang wajib diganti saat pertama masuk (aktivasi).
//   npm run password-awal -- --username admin
// Setelah masuk dengan password awal, aplikasi langsung meminta password baru
// (bebas, asal berbeda dari password awal). Semua sesi lama akun itu berakhir.
import { loadEnvForScripts } from "../src/lib/config";
import { createDeps } from "../src/lib/deps";
import { DEFAULT_OWNER_PASSWORD, setInitialOwnerPassword } from "../src/lib/setup";

loadEnvForScripts();
const index = process.argv.indexOf("--username");
const username = index >= 0 ? (process.argv[index + 1] ?? "") : "admin";

try {
  await setInitialOwnerPassword(createDeps(), username, DEFAULT_OWNER_PASSWORD);
  console.log(`\n✓ Akun ${username.trim().toLowerCase()} siap diaktifkan: masuk dengan password awal "${DEFAULT_OWNER_PASSWORD}".`);
  console.log("  Saat masuk, aplikasi langsung meminta password baru. Lakukan segera setelah aplikasi online.");
} catch (error) {
  console.error(`Gagal mengatur password awal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
