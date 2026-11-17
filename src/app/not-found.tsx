import Link from "next/link";
import { Wordmark } from "@/components/shell";

export default function NotFound() {
  return (
    <div className="standalone">
      <Wordmark />
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Halaman tidak ditemukan</h2>
            <p>Alamatnya salah, datanya sudah tidak ada, atau akun Anda tidak berhak membukanya.</p>
          </div>
        </div>
        <div className="form-actions">
          <Link href="/beranda" className="btn">
            Ke beranda
          </Link>
        </div>
      </section>
    </div>
  );
}
