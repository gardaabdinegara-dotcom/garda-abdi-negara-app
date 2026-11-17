"use client";
// Saringan "Semua / Perlu perhatian" di rekap latihan owner. Daftar siswa tetap dirender server;
// komponen ini hanya mengganti atribut data-tampil, dan CSS menyembunyikan baris yang tidak bertanda.
import { useState } from "react";

export function RekapFilter({ total, perlu, children }: { total: number; perlu: number; children: React.ReactNode }) {
  const [tampil, setTampil] = useState<"semua" | "perlu">("semua");
  return (
    <section className="card lp-card lp-rekap" data-tampil={tampil} aria-labelledby="lp-rekap-judul">
      <div className="lp-card-head">
        <div>
          <h2 id="lp-rekap-judul">{tampil === "perlu" ? "Perlu perhatian" : "Semua siswa"}</h2>
          <p>Ketuk nama untuk melihat progres siswa.</p>
        </div>
        <div className="lp-seg" role="group" aria-label="Tampilkan siswa">
          <button type="button" aria-pressed={tampil === "semua"} onClick={() => setTampil("semua")}>
            Semua <span>{total}</span>
          </button>
          <button type="button" aria-pressed={tampil === "perlu"} onClick={() => setTampil("perlu")}>
            Perlu perhatian <span>{perlu}</span>
          </button>
        </div>
      </div>
      {children}
    </section>
  );
}
