import { redirect } from "next/navigation";
import { createQrToken } from "@/lib/auth/qr";
import { sesiQrSiswaUji } from "@/lib/demo/siswa-uji";
import { getUjiSiswa } from "@/lib/server/session";

export async function GET() {
  const test = await getUjiSiswa();
  if (test?.status !== "aktif") redirect("/beranda");
  const now = Date.now();
  const { token } = createQrToken(sesiQrSiswaUji(now), now, test.id);
  redirect(`/qr-presensi?t=${encodeURIComponent(token)}`);
}
