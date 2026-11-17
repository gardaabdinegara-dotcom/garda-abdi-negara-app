// Memeriksa .env.local tanpa menampilkan nilai rahasia.
//   npm run cek:env                 → pemeriksaan untuk komputer sendiri
//   npm run cek:env -- --produksi   → syarat produksi (Vercel): Sheets, secret, dan Redis wajib
import { loadEnvForScripts } from "../src/lib/config";
import { checkEnvironment, envReady } from "../src/lib/env-check";

loadEnvForScripts();
const production = process.argv.includes("--produksi");
const items = checkEnvironment(process.env, production);
console.log(`Pemeriksaan konfigurasi${production ? " produksi" : ""}:\n`);
for (const item of items) {
  const mark = item.ok ? "✓" : item.required ? "✗" : "•";
  console.log(`${mark} ${item.label.padEnd(30)} ${item.detail}`);
}
const ready = envReady(items);
console.log(ready ? "\nKonfigurasi siap. Lanjutkan dengan: npm run setup:sheets" : "\nAda isian wajib yang belum siap (✗). Perbaiki .env.local lalu jalankan lagi.");
process.exitCode = ready ? 0 : 1;
