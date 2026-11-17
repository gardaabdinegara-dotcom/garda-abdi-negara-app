import { dataMode } from "@/lib/config";
import { serverReportFonts } from "@/lib/keuangan/pdf-assets";
import { buildAnnualReport } from "@/lib/keuangan/report-book";
import { renderAnnualReportPdf } from "@/lib/keuangan/report-book-pdf";
import { ledgerActor } from "@/lib/keuangan/sumber";
import { download, financeRouteActor, forbidden } from "@/lib/server/finance-route";
import { loadFinance } from "@/lib/server/keuangan";

/** Buku laporan tahunan (PDF): laba rugi, neraca, aset, pajak, buku kas, dan pemeriksaan satu tahun kalender. */
export async function GET(request: Request) {
  const actor = await financeRouteActor();
  if (!actor) return forbidden();
  const year = new URL(request.url).searchParams.get("tahun") ?? "";
  if (!/^\d{4}$/.test(year)) return new Response("Parameter tahun harus YYYY.", { status: 400 });
  const data = await loadFinance(actor);
  const model = buildAnnualReport(data.state, { year, role: ledgerActor(actor).role, simulation: dataMode() === "lokal", dataAsOf: new Date().toISOString() });
  const bytes = renderAnnualReportPdf(model, serverReportFonts());
  return download(new Blob([bytes as BlobPart], { type: "application/pdf" }), "application/pdf", model.filename);
}
