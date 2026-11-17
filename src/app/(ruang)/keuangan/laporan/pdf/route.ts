import { serverReportFonts } from "@/lib/keuangan/pdf-assets";
import { renderReportPdf } from "@/lib/keuangan/report-pdf";
import { download, financeRouteActor, forbidden } from "@/lib/server/finance-route";
import { loadFinance, reportModel, reportRequest } from "@/lib/server/keuangan";

/** PDF satu laporan (teks vektor, font tertanam), sama dengan tampilan layar. */
export async function GET(request: Request) {
  const actor = await financeRouteActor();
  if (!actor) return forbidden();
  const data = await loadFinance(actor);
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const model = reportModel(data, reportRequest(data, actor, params));
  const bytes = renderReportPdf(model, serverReportFonts());
  return download(new Blob([bytes as BlobPart], { type: "application/pdf" }), "application/pdf", model.filename);
}
