import Link from "next/link";
import { aturUlangUjiSiswa, kembaliDariUjiSiswa } from "@/app/actions/uji-siswa";

export function UjiSiswaBanner({ id }: { id: string }) {
  return (
    <aside className="mode-banner mode-banner-preview uji-siswa-banner" aria-label="Mode Uji Siswa">
      <div>
        <strong>Mode Uji Siswa</strong>
        <span> · Aktivitas tersimpan sementara di browser ini.</span>
      </div>
      <div className="uji-siswa-actions">
        <Link href="/uji-siswa/qr" prefetch={false} className="btn btn-secondary btn-sm">Coba presensi QR</Link>
        <form action={aturUlangUjiSiswa.bind(null, id)}>
          <button type="submit" className="btn btn-secondary btn-sm">Atur ulang uji</button>
        </form>
        <form action={kembaliDariUjiSiswa.bind(null, id)}>
          <button type="submit" className="btn btn-sm">Kembali ke akun staf</button>
        </form>
      </div>
    </aside>
  );
}
