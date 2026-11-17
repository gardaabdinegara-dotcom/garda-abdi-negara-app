import Link from "next/link";
import { Wordmark } from "@/components/shell";

export default function CetakNotFound() {
  return (
    <div className="standalone">
      <Wordmark />
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Blangko tidak ditemukan</h2>
            <p>Alamatnya salah, tesnya sudah tidak ada, atau akun Anda tidak berhak mencetaknya.</p>
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
