import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { PdfFonts } from "./report-pdf";

let cached: PdfFonts | undefined;

/** Font Terrace Report (DM Sans, OFL) dan logo untuk PDF laporan, dibaca sekali dari disk. */
export function serverReportFonts(): PdfFonts {
  if (cached) return cached;
  const dir = path.join(process.cwd(), "src", "lib", "keuangan", "assets");
  const read = (name: string) => new Uint8Array(fs.readFileSync(path.join(dir, name)));
  cached = { regular: read("terrace-report-regular.ttf"), bold: read("terrace-report-bold.ttf"), logo: read("garda-report-logo-v1.png") };
  return cached;
}
