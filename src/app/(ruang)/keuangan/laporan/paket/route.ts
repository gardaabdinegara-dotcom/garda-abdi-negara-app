import { serverReportFonts } from "@/lib/keuangan/pdf-assets";
import type { PdfReportKind } from "@/lib/keuangan/report-document";
import { appendReportPages, createReportPdf } from "@/lib/keuangan/report-pdf";
import { download, financeRouteActor, forbidden } from "@/lib/server/finance-route";
import { loadFinance, reportModel, reportRequest } from "@/lib/server/keuangan";

const KINDS: PdfReportKind[] = ["cash", "profit", "balance"];

/** Satu PDF berisi tiga laporan utama (buku kas, laba rugi, neraca) untuk periode yang sama, semua akun. */
export async function GET(request: Request) {
  const actor = await financeRouteActor();
  if (!actor) return forbidden();
  const data = await loadFinance(actor);
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const base = reportRequest(data, actor, { dari: params.dari ?? "", sampai: params.sampai ?? "" });
  const generatedAt = new Date().toISOString();
  const models = KINDS.map((kind) => reportModel(data, { ...base, kind, accountId: "", generatedAt }));
  const fonts = serverReportFonts();
  const doc = createReportPdf(fonts, models[0]!.landscape);
  doc.setProperties({ title: `Laporan keuangan | ${models[0]!.business}`, subject: `${models[0]!.period} | ${models[0]!.status}`, author: models[0]!.business, creator: "Garda Keuangan" });
  models.forEach((model, i) => {
    if (i > 0) doc.addPage("a4", model.landscape ? "landscape" : "portrait");
    appendReportPages(doc, model, true, fonts.logo);
  });
  const bytes = new Uint8Array(doc.output("arraybuffer"));
  return download(new Blob([bytes as BlobPart], { type: "application/pdf" }), "application/pdf", `garda-3-laporan-${base.from}_${base.to}.pdf`);
}
