"use client";

// Tombol WhatsApp bersama. WaTombol langsung membuka wa.me; WaKabari menampilkan pratinjau pesan dulu
// (Buka WhatsApp / Salin pesan). Pesan baru terkirim setelah owner menekan kirim di WhatsApp.
import { useId, useRef, useState } from "react";
import { tautanWa } from "@/lib/core/wa";
import { Icon } from "./icon";
import "./wa.css";
import { bukaDialog } from "@/lib/dialog";

type Ukuran = "sm" | "md";

/** Tautan langsung ke chat WhatsApp dengan pesan terisi. Tanpa nomor: tombol redup "Nomor WA kosong". */
export function WaTombol({ nomor, pesan, label = "WA", ukuran = "sm", judul }: { nomor: string | null; pesan: string; label?: string; ukuran?: Ukuran; judul?: string }) {
  if (!nomor) {
    return (
      <span className={`wa-btn wa-${ukuran} is-kosong`} title="Nomor WA belum diisi di data siswa" aria-disabled="true">
        <Icon name="wa" />
        <span>{ukuran === "sm" ? label : "Nomor WA kosong"}</span>
      </span>
    );
  }
  return (
    <a className={`wa-btn wa-${ukuran}`} href={tautanWa(nomor, pesan)} target="_blank" rel="noopener noreferrer" title={judul ?? "Buka WhatsApp dengan pesan terisi"}>
      <Icon name="wa" />
      <span>{label}</span>
    </a>
  );
}

/**
 * Tombol yang membuka lembar pratinjau pesan sebelum WhatsApp dibuka.
 * `untuk` = keterangan penerima, mis. "Wali OKTAVIA SARI · 0813-2210-4471". Nomor null = tanpa nomor (pilih chat/grup di WhatsApp).
 */
export function WaKabari({
  nomor,
  pesan,
  label = "WA",
  judul = "Kabari lewat WhatsApp",
  untuk,
  ukuran = "sm",
  tanpaNomorBoleh = false,
}: {
  nomor: string | null;
  pesan: string;
  label?: string;
  judul?: string;
  untuk?: string;
  ukuran?: Ukuran;
  /** true = boleh dibuka tanpa nomor (mis. dibagikan ke grup). */
  tanpaNomorBoleh?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [disalin, setDisalin] = useState(false);

  if (!nomor && !tanpaNomorBoleh) return <WaTombol nomor={null} pesan={pesan} label={label} ukuran={ukuran} />;

  async function salin() {
    try {
      await navigator.clipboard.writeText(pesan);
      setDisalin(true);
      setTimeout(() => setDisalin(false), 2000);
    } catch {
      setDisalin(false);
    }
  }

  return (
    <>
      <button type="button" className={`wa-btn wa-${ukuran}`} onClick={() => bukaDialog(dialog.current)} aria-haspopup="dialog">
        <Icon name="wa" />
        <span>{label}</span>
      </button>
      <dialog
        ref={dialog}
        className="wa-sheet"
        aria-labelledby={titleId}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <div className="wa-sheet-in">
          <div className="wa-sheet-head">
            <div>
              <h2 id={titleId}>{judul}</h2>
              {untuk ? <p>{untuk}</p> : null}
            </div>
            <button type="button" className="wa-x" aria-label="Tutup" onClick={() => dialog.current?.close()}>
              <Icon name="x" />
            </button>
          </div>
          <div className="wa-bubble">{pesan}</div>
          <a className="wa-open" href={tautanWa(nomor, pesan)} target="_blank" rel="noopener noreferrer" onClick={() => dialog.current?.close()}>
            <Icon name="wa" />
            Buka WhatsApp
          </a>
          <button type="button" className="wa-copy" onClick={salin}>
            <Icon name="copy" />
            {disalin ? "Pesan disalin" : "Salin pesan"}
          </button>
          <p className="wa-foot">Belum ada yang terkirim sampai Anda menekan kirim di WhatsApp. Teks pesan bisa diubah di Pengaturan → Pesan WA.</p>
        </div>
      </dialog>
    </>
  );
}
