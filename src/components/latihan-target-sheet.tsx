"use client";

// Lembar "Target latihan mingguan" (owner/admin): jenis, durasi, dan berapa kali per minggu untuk semua siswa aktif.
import { useCallback, useId, useRef, useState } from "react";
import { aturTargetLatihan } from "@/app/actions/latihan";
import type { ActionState } from "@/lib/action-state";
import { DURASI_LATIHAN, JENIS_INFO, JENIS_LATIHAN, type DurasiLatihan, type JenisLatihan } from "@/lib/core/latihan";
import { menitTarget, TARGET_KALI_MAX, TARGET_KALI_MIN, type TargetLatihan } from "@/lib/core/latihan-target";
import { ActionForm, SubmitButton } from "./form";
import { Icon } from "./icon";

const DURASI_PILIHAN: Record<DurasiLatihan | "semua", string> = { semua: "Apa saja", singkat: "Singkat", standar: "Standar", asli: "Seperti tes asli" };

export function TargetSheet({ target, siswaAktif, operationId, label }: { target: TargetLatihan | null; siswaAktif: number; operationId: string; label: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [jenis, setJenis] = useState<JenisLatihan | "semua">(target ? (target.jenis ?? "semua") : "kraepelin");
  const [durasi, setDurasi] = useState<DurasiLatihan | "semua">(target ? (target.durasi ?? "semua") : "standar");
  const [kali, setKali] = useState(target?.kali ?? 3);
  const menit = menitTarget({ jenis: jenis === "semua" ? null : jenis, durasi: durasi === "semua" ? null : durasi });

  const action = useCallback(async (prev: ActionState, data: FormData) => {
    const result = await aturTargetLatihan(prev, data);
    if (result.ok) ref.current?.close();
    return result;
  }, []);

  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm lp-tgt-edit" onClick={() => ref.current?.showModal()} aria-haspopup="dialog">
        <Icon name="target" />
        {label}
      </button>
      <dialog
        ref={ref}
        className="lt-sheet"
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="lt-sheet-in">
          <div className="lt-sheet-head">
            <div>
              <h2 id={titleId}>Target latihan mingguan</h2>
              <p>Siswa melihat target ini di menu Latihan. Hitungan mulai ulang setiap Senin.</p>
            </div>
            <button type="button" className="lt-sheet-x" onClick={() => ref.current?.close()} aria-label="Tutup">
              <Icon name="x" />
            </button>
          </div>
          <ActionForm action={action} operationId={operationId} className="lt-sheet-form">
            <fieldset className="lt-fs">
              <legend>Jenis latihan</legend>
              <div className="lt-chips">
                {(["semua", ...JENIS_LATIHAN] as const).map((j) => (
                  <label key={j} className={`lt-chip${jenis === j ? " is-on" : ""}`}>
                    <input type="radio" name="jenis" value={j} checked={jenis === j} onChange={() => setJenis(j)} />
                    {j === "semua" ? "Semua jenis" : JENIS_INFO[j].nama}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="lt-fs">
              <legend>Durasi</legend>
              <div className="lt-segr">
                {(["semua", ...DURASI_LATIHAN] as const).map((d) => (
                  <label key={d} className={durasi === d ? "is-on" : undefined}>
                    <input type="radio" name="durasi" value={d} checked={durasi === d} onChange={() => setDurasi(d)} />
                    {DURASI_PILIHAN[d]}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="lt-fs">
              <legend>Berapa kali per minggu</legend>
              <div className="lt-step-row">
                <div className="lt-step">
                  <button type="button" onClick={() => setKali((k) => Math.max(TARGET_KALI_MIN, k - 1))} disabled={kali <= TARGET_KALI_MIN} aria-label="Kurangi">
                    −
                  </button>
                  <output aria-live="polite">{kali}</output>
                  <button type="button" onClick={() => setKali((k) => Math.min(TARGET_KALI_MAX, k + 1))} disabled={kali >= TARGET_KALI_MAX} aria-label="Tambah">
                    +
                  </button>
                </div>
                <span className="lt-step-hint">{menit ? `kali · ${menit} menit tiap latihan` : "kali, di hari yang berbeda"}</span>
              </div>
              <input type="hidden" name="kali" value={kali} />
            </fieldset>
            <div className="lt-untuk">
              <span>Untuk</span>
              <b>Semua siswa aktif · {siswaAktif}</b>
            </div>
            <p className="lt-sheet-note">Beberapa latihan di hari yang sama dihitung satu kali, agar latihan tersebar sepanjang minggu.</p>
            <SubmitButton block>Simpan target</SubmitButton>
            {target ? (
              <SubmitButton block variant="ghost" name="hapus" value="1" pendingLabel="Menghapus…">
                Hapus target
              </SubmitButton>
            ) : null}
          </ActionForm>
        </div>
      </dialog>
    </>
  );
}
