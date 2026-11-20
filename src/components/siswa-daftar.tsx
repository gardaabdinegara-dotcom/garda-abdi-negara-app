"use client";

// Daftar siswa ringkas: satu baris per siswa, pencarian menyaring sambil mengetik, chip status/jalur.
// Tanpa JavaScript tetap berjalan: form GET (?q=) dan chip berupa tautan (?status= / ?jalur=); hasil awal
// sudah disaring saat dirender di server.
import Link from "next/link";
import { useMemo, useState } from "react";
import { alamatSaring, cocokCari, cocokSaring, isSaringJalur, SARING_SISWA, SARING_SISWA_LABEL, type SaringSiswa, type SiswaCari } from "@/lib/core/saring-daftar";
import { formatPhone, initials } from "@/lib/format";
import { Icon } from "./icon";
import { WaTombol } from "./wa";
import "./daftar-ringkas.css";

export interface SiswaRingkas extends SiswaCari {
  siswa_id: string;
  /** Nomor siap wa.me (62…), null bila kosong. */
  wa: string | null;
}

export function SiswaDaftar({ students, initialQ, initialSaring, kontak = true }: { students: SiswaRingkas[]; initialQ: string; initialSaring: SaringSiswa; kontak?: boolean }) {
  const [q, setQ] = useState(initialQ);
  const [saring, setSaring] = useState<SaringSiswa>(initialSaring);

  const cocok = useMemo(() => students.filter((s) => cocokCari(s, q)), [students, q]);
  const shown = useMemo(() => cocok.filter((s) => cocokSaring(s, saring)), [cocok, saring]);
  const counts = useMemo(() => Object.fromEntries(SARING_SISWA.map((k) => [k, cocok.filter((s) => cocokSaring(s, k)).length])) as Record<SaringSiswa, number>, [cocok]);
  // Chip jalur hanya untuk jalur yang memang dipakai.
  const chips = SARING_SISWA.filter((k) => !isSaringJalur(k) || saring === k || students.some((s) => s.jalur === k));

  // Alamat ikut diperbarui (tanpa memuat ulang) agar muat ulang dan tombol kembali mempertahankan saringan.
  function sync(nextQ: string, nextSaring: SaringSiswa) {
    try {
      window.history.replaceState(window.history.state, "", alamatSaring(nextSaring, nextQ));
    } catch {
      /* abaikan: saringan tetap jalan */
    }
  }

  return (
    <>
      <form method="get" action="/siswa" role="search" className="dr-cari" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="cari-siswa" className="sr-only">
          Cari siswa
        </label>
        <Icon name="search" />
        <input
          id="cari-siswa"
          name="q"
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            sync(e.target.value, saring);
          }}
          placeholder="Cari nama, kode GAN, atau nomor WA"
          autoComplete="off"
          enterKeyHint="search"
        />
        {isSaringJalur(saring) ? <input type="hidden" name="jalur" value={saring} /> : saring !== "semua" ? <input type="hidden" name="status" value={saring} /> : null}
      </form>
      <div className="dr-chips" role="group" aria-label="Saring siswa">
        {chips.map((k) => (
          <a
            key={k}
            href={alamatSaring(k, q)}
            className={`dr-chip${saring === k ? " is-on" : ""}`}
            aria-pressed={saring === k}
            onClick={(e) => {
              e.preventDefault();
              setSaring(k);
              sync(q, k);
            }}
          >
            {SARING_SISWA_LABEL[k]} <em>{counts[k]}</em>
          </a>
        ))}
      </div>
      <div className="dr-legend" aria-live="polite">
        <span>
          {shown.length} siswa{shown.length !== students.length ? ` dari ${students.length}` : ""} · urut nama
        </span>
        <span aria-hidden="true">
          <i className="dr-dot" />
          Aktif
          <i className="dr-dot is-off" />
          Nonaktif
        </span>
      </div>
      {shown.length === 0 ? (
        <div className="dr-empty">
          <b>{students.length === 0 ? "Belum ada siswa" : "Tidak ada yang cocok"}</b>
          {students.length === 0 ? "Mulai dengan menambahkan siswa pertama." : "Ubah kata kunci atau pilih chip lain."}
        </div>
      ) : (
        <ul className="dr-list">
          {shown.map((s) => (
            <li key={s.siswa_id} className={`dr-row${s.aktif ? "" : " is-mati"}`}>
              <Link href={`/siswa/${encodeURIComponent(s.siswa_id)}`} className="dr-main">
                <span className="dr-av" aria-hidden="true">
                  {initials(s.nama)}
                </span>
                <span className="dr-nm">
                  <b>
                    <span className="dr-nama">{s.nama}</span>
                    <i className={`dr-dot${s.aktif ? "" : " is-off"}`} role="img" aria-label={s.aktif ? "Aktif" : "Nonaktif"} />
                  </b>
                  <small>
                    <code>{s.kode}</code>
                    {s.jalur ? ` · ${s.jalur}` : ""}
                    {s.aktif ? "" : " · nonaktif"}
                  </small>
                </span>
                {kontak ? <span className="dr-extra dr-telp">{s.noWa ? formatPhone(s.noWa) : "WA belum diisi"}</span> : null}
              </Link>
              {kontak ? (
                <span className="dr-side">
                  <WaTombol nomor={s.wa} pesan="" label="WA" judul={`Buka WhatsApp ${s.nama}`} />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
