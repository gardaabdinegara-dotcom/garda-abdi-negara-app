"use client";

// Mengirim hasil latihan ke server dan menyimpannya sementara di HP bila gagal terkirim.
// Hasil ditulis ke localStorage sebelum dikirim dan dihapus setelah tersimpan, jadi hasil tidak hilang walau
// sinyal putus atau layar tertutup di tengah pengiriman. Kirim ulang memakai operation_id yang sama.
import { startTransition, useEffect, useState } from "react";
import { simpanLatihan } from "@/app/actions/latihan";
import { initialActionState } from "@/lib/action-state";
import { DURASI_LABEL, hitungHasil, JENIS_INFO } from "@/lib/core/latihan";
import { bacaTertunda, hapusTertunda, isiForm, KUNCI_TERTUNDA, seriDariKiriman, tambahTertunda, type KirimanLatihan } from "@/lib/core/latihan-soal";
import { Icon } from "./icon";
import { waktuLatihan } from "./latihan-hasil";
import { useUjiSiswaId } from "./uji-siswa-context";

const KUNCI_UJI = `${KUNCI_TERTUNDA}.uji-siswa`;

function baca(testId?: string): KirimanLatihan[] {
  try {
    const storage = testId ? window.sessionStorage : window.localStorage;
    return bacaTertunda(storage.getItem(testId ? KUNCI_UJI : KUNCI_TERTUNDA)).filter((k) => k.uji_siswa === testId);
  } catch {
    return [];
  }
}

function tulis(list: KirimanLatihan[], testId?: string): boolean {
  try {
    const storage = testId ? window.sessionStorage : window.localStorage;
    const key = testId ? KUNCI_UJI : KUNCI_TERTUNDA;
    if (list.length) storage.setItem(key, JSON.stringify(list));
    else storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Menyimpan kiriman di HP. False bila penyimpanan HP tidak tersedia (mis. mode privat). */
export const simpanTertunda = (k: KirimanLatihan) => tulis(tambahTertunda(baca(k.uji_siswa), k), k.uji_siswa);
const buangTertunda = (k: KirimanLatihan) => tulis(hapusTertunda(baca(k.uji_siswa), k.operation_id), k.uji_siswa);
const daftarTertunda = (pemilik: string, testId?: string) => baca(testId).filter((k) => k.pemilik === pemilik);

/** Pengalihan dari Server Action (redirect ke halaman hasil) berarti hasil sudah tersimpan. */
function alamatPengalihan(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("digest" in error)) return null;
  const digest = String((error as { digest: unknown }).digest);
  if (!digest.startsWith("NEXT_REDIRECT")) return null;
  return digest.split(";")[2] || "/latihan";
}

export type HasilKirim = { ok: true; alamat: string } | { ok: false; message: string };

/**
 * Mengirim satu hasil. Berhasil: server mengalihkan ke halaman hasil (router Next sudah berpindah sendiri),
 * kiriman dihapus dari HP. Gagal: kiriman tetap di HP agar bisa dikirim ulang.
 */
export async function kirimLatihan(k: KirimanLatihan): Promise<HasilKirim> {
  const data = new FormData();
  for (const [key, value] of isiForm(k)) data.set(key, value);
  try {
    const result = await simpanLatihan(initialActionState, data);
    if (result.ok) {
      buangTertunda(k);
      return { ok: true, alamat: "/latihan" };
    }
    return { ok: false, message: result.message || "Hasil belum tersimpan. Coba lagi." };
  } catch (error) {
    const alamat = alamatPengalihan(error);
    if (alamat) {
      buangTertunda(k);
      return { ok: true, alamat };
    }
    return { ok: false, message: "Koneksi terputus. Periksa internet lalu coba lagi." };
  }
}

/** Kartu di menu Latihan: hasil yang belum terkirim dari HP ini, dengan tombol kirim dan buang. */
export function KirimTertunda({ pemilik }: { pemilik: string }) {
  const testId = useUjiSiswaId();
  const [list, setList] = useState<KirimanLatihan[]>([]);
  const [kirim, setKirim] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string>("");

  useEffect(() => {
    setList(daftarTertunda(pemilik, testId));
  }, [pemilik, testId]);

  if (list.length === 0) return null;

  const kirimSatu = (k: KirimanLatihan) => {
    setKirim(k.operation_id);
    setPesan("");
    startTransition(async () => {
      const r = await kirimLatihan(k);
      if (!r.ok) {
        setPesan(r.message);
        setKirim(null);
      }
    });
  };

  const buang = (k: KirimanLatihan) => {
    if (!window.confirm(`Buang hasil ${JENIS_INFO[k.jenis].nama} ini? Hasil yang dibuang tidak bisa dikirim lagi.`)) return;
    buangTertunda(k);
    setList(daftarTertunda(pemilik, testId));
  };

  return (
    <section className="card lt-card lt-tunda" aria-labelledby="lt-tunda-h">
      <div className="lt-tunda-head">
        <span className="lt-tunda-ic" aria-hidden="true">
          <Icon name="clock" />
        </span>
        <div>
          <h2 id="lt-tunda-h">{list.length === 1 ? "1 hasil belum terkirim" : `${list.length} hasil belum terkirim`}</h2>
          <p className="lt-sub">{testId ? "Tersimpan di tab ini. Kirim untuk menambahkan hasil ke progres uji." : "Tersimpan di HP ini. Kirim agar masuk ke progres dan terlihat pelatih."}</p>
        </div>
      </div>
      <ul className="lt-tunda-list">
        {list.map((k) => {
          const skor = hitungHasil(k.jenis, seriDariKiriman(k), k.detik).skor;
          const sibuk = kirim === k.operation_id;
          return (
            <li key={k.operation_id}>
              <div className="lt-tunda-main">
                <b>
                  {JENIS_INFO[k.jenis].nama} · skor {skor}
                </b>
                <span>
                  {DURASI_LABEL[k.durasi]} · {waktuLatihan(k.dibuat || k.mulai)}
                </span>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => kirimSatu(k)} disabled={kirim !== null} aria-busy={sibuk || undefined}>
                {sibuk ? "Mengirim…" : "Kirim"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => buang(k)} disabled={kirim !== null}>
                Buang
              </button>
            </li>
          );
        })}
      </ul>
      {pesan ? (
        <p className="notice notice-danger" role="alert">
          {pesan}
        </p>
      ) : null}
    </section>
  );
}
