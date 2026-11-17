import { canCorrectFinance } from "@/lib/core/permissions";
import { deps } from "@/lib/deps";
import { FINANCE_TABLES } from "@/lib/keuangan/sumber";
import { download, financeRouteActor, forbidden } from "@/lib/server/finance-route";

/** Cadangan JSON seluruh tab keuangan + data inti yang dirujuk (tanpa akun pengguna/password). Khusus pemilik. */
export async function GET() {
  const actor = await financeRouteActor();
  if (!actor || !canCorrectFinance(actor)) return forbidden();
  const [keuangan, inti] = await Promise.all([
    deps().store.read("keuangan", [...FINANCE_TABLES, "Operasi_Keuangan"], { fresh: true }),
    deps().store.read("inti", ["Siswa", "Program", "Kelas", "Pendaftaran"], { fresh: true }),
  ]);
  const stamp = new Date().toISOString();
  const body = JSON.stringify({ format: "ruang-garda-cadangan-keuangan", versi: 1, dibuat: stamp, keuangan, inti }, null, 2);
  return download(body, "application/json; charset=utf-8", `cadangan-keuangan-${stamp.slice(0, 10)}.json`);
}
