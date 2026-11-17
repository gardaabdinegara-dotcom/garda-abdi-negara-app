import { csvCell } from "@/lib/core/akademik";
import { isAcademicStaff } from "@/lib/core/akademik";
import { isPeriod, loadAttendanceExport } from "@/lib/server/akademik";
import { getActor } from "@/lib/server/session";

const HEADER = ["Tanggal", "Jam", "Sesi", "Kelas", "Kode siswa", "Nama siswa", "Status", "Jam masuk", "Terlambat", "Metode", "Keterangan"];

/** Ekspor presensi satu bulan (CSV) untuk staf. Hanya sesi yang boleh dilihat pengguna ini. */
export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor || actor.user.wajib_ganti_password || !isAcademicStaff(actor)) return new Response("Tidak diizinkan.", { status: 403 });
  const bulan = new URL(request.url).searchParams.get("bulan");
  if (!isPeriod(bulan)) return new Response("Parameter bulan harus YYYY-MM.", { status: 400 });
  const rows = await loadAttendanceExport(actor, bulan);
  const body = "﻿" + [HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="presensi-${bulan}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
