import { reportCSV } from "@/lib/keuangan/reporting";
import { download, financeRouteActor, forbidden } from "@/lib/server/finance-route";
import { loadFinance, reportModel, reportRequest } from "@/lib/server/keuangan";

/** CSV laporan: setiap tabel diawali judul dan baris kolom. Sel diamankan dari rumus. */
export async function GET(request: Request) {
  const actor = await financeRouteActor();
  if (!actor) return forbidden();
  const data = await loadFinance(actor);
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const model = reportModel(data, reportRequest(data, actor, params));
  const rows: (string | number | null)[][] = [[model.title], [model.business], [model.period], [model.status], []];
  for (const table of model.tables) {
    rows.push([table.title], table.columns.map((c) => c.label), ...table.rows.map((r) => r.cells), []);
  }
  return download(reportCSV(rows), "text/csv; charset=utf-8", model.filename.replace(/\.pdf$/, "") + ".csv");
}
