import { canManageSamapta } from "@/lib/core/samapta";
import { csvHasilTes, namaBerkasHasil } from "@/lib/core/samapta-hasil";
import { loadSamaptaTest } from "@/lib/server/samapta";
import { getActor } from "@/lib/server/session";

/**
 * Unduh hasil satu Tes Samapta sebagai CSV yang langsung terbuka di Excel (UTF-8 + BOM, pemisah titik koma,
 * baris "sep=;"). Tanpa pustaka xlsx: Excel dan Google Sheets membaca berkas ini sebagai tabel. Khusus staf.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor || actor.user.wajib_ganti_password || !canManageSamapta(actor)) return new Response("Tidak diizinkan.", { status: 403 });
  const { id } = await params;
  const data = await loadSamaptaTest(actor, decodeURIComponent(id));
  const nama = namaBerkasHasil(data.test.nama);
  return new Response(csvHasilTes(data.entries), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nama.ascii}"; filename*=UTF-8''${encodeURIComponent(nama.utf8)}`,
      "Cache-Control": "no-store",
    },
  });
}
