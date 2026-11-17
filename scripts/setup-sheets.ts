// Menyiapkan tab dan header spreadsheet Ruang Garda.
//   npm run setup:sheets            → pratinjau, tidak menulis apa pun
//   npm run setup:sheets -- --apply → menambahkan tab yang belum ada (tab lama tidak dihapus)
import { dataMode, loadEnvForScripts } from "../src/lib/config";
import { createDeps } from "../src/lib/deps";
import { setupSheets } from "../src/lib/setup";

loadEnvForScripts();
const apply = process.argv.includes("--apply");

try {
  const deps = createDeps();
  console.log(`Mode data: ${dataMode() === "lokal" ? "lokal (.data/lokal.json)" : "Google Sheets"}`);
  const reports = await setupSheets(deps, apply);
  for (const report of reports) {
    const name = report.sheet === "inti" ? "Inti & Akademik" : "Keuangan";
    if (report.missing.length === 0 && report.extended.length === 0) console.log(`✓ ${name}: semua tab sudah lengkap dan header sesuai.`);
    if (report.missing.length) {
      if (apply) console.log(`✓ ${name}: ${report.added.length} tab ditambahkan (${report.added.join(", ")}).`);
      else console.log(`• ${name}: ${report.missing.length} tab akan ditambahkan: ${report.missing.join(", ")}`);
    }
    if (report.extended.length) {
      if (apply) console.log(`✓ ${name}: kolom baru ditambahkan di ujung kanan tab ${report.extended.join(", ")} (data lama tidak diubah).`);
      else console.log(`• ${name}: tab ${report.extended.join(", ")} akan mendapat kolom baru di ujung kanan.`);
    }
  }
  if (!apply && reports.some((r) => r.missing.length || r.extended.length)) console.log('\nJalankan "npm run setup:sheets -- --apply" untuk menerapkannya.');
} catch (error) {
  console.error(`Setup berhenti: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
