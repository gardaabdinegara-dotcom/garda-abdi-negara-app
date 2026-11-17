"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="standalone">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Terjadi gangguan</h2>
            <p>Halaman ini gagal dimuat. Biasanya karena koneksi ke Google Sheets sedang lambat; coba lagi sebentar lagi.</p>
          </div>
        </div>
        {error.digest ? <p className="muted mono">Kode: {error.digest}</p> : null}
        <div className="form-actions">
          <button type="button" className="btn" onClick={reset}>
            Coba lagi
          </button>
          <Link href="/beranda" className="btn btn-secondary">
            Ke beranda
          </Link>
        </div>
      </section>
    </div>
  );
}
