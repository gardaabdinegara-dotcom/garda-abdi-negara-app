"use client";

// Profil siswa: tombol "Ubah data" membuka formulir yang sama di lembar (bawah di ponsel, panel samping di desktop).
// Beberapa tombol di halaman bisa membuka lembar yang sama lewat peristiwa "rg:ubah-siswa".
import { useCallback, useEffect, useState } from "react";
import { ubahSiswa } from "@/app/actions/siswa";
import type { ActionState } from "@/lib/action-state";
import { ActionForm, SubmitButton } from "./form";
import { Icon, type IconName } from "./icon";
import { Lembar } from "./lembar";
import "./siswa-profil.css";

const BUKA = "rg:ubah-siswa";

export function UbahDataTombol({ label = "Ubah data", variant = "primary", icon }: { label?: string; variant?: "primary" | "secondary" | "ghost"; icon?: IconName }) {
  const kelas = ["btn", variant === "primary" ? "" : `btn-${variant}`, variant === "ghost" ? "btn-sm" : ""].filter(Boolean).join(" ");
  return (
    <button type="button" className={kelas} aria-haspopup="dialog" onClick={() => window.dispatchEvent(new Event(BUKA))}>
      {icon ? <Icon name={icon} /> : null}
      {label}
    </button>
  );
}

/**
 * Lembar "Ubah data siswa". Isian (StudentFields) dikirim dari server sebagai children.
 * `versi` berubah bila data siswa di server berubah; formulir lalu dibuat ulang agar isian memakai nilai terbaru
 * (isian tanpa kendali tidak ikut berubah saat defaultValue berganti).
 */
export function UbahDataLembar({ siswaId, judul, operationId, versi, children }: { siswaId: string; judul: string; operationId: string; versi: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  // Setelah tersimpan, formulir dibuat ulang (isian baru dari server, ID operasi baru).
  const [round, setRound] = useState(0);
  const [opId, setOpId] = useState(operationId);

  useEffect(() => {
    const show = () => {
      setSaved(false);
      setOpen(true);
    };
    window.addEventListener(BUKA, show);
    return () => window.removeEventListener(BUKA, show);
  }, []);

  const action = useCallback(async (prev: ActionState, data: FormData) => {
    const result = await ubahSiswa(prev, data);
    if (result.ok) {
      setOpen(false);
      setSaved(true);
      setOpId(crypto.randomUUID());
      setRound((n) => n + 1);
    }
    return result;
  }, []);

  return (
    <>
      {saved ? (
        <p className="notice notice-success" role="status">
          Data siswa tersimpan.
        </p>
      ) : null}
      <Lembar open={open} onClose={() => setOpen(false)} title="Ubah data siswa" sub={judul}>
        <ActionForm key={`${versi}:${round}`} action={action} operationId={opId} className="stack sp-form">
          <input type="hidden" name="siswa_id" value={siswaId} />
          {children}
          <div className="lembar-foot">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              Batal
            </button>
            <SubmitButton>Simpan perubahan</SubmitButton>
          </div>
        </ActionForm>
      </Lembar>
    </>
  );
}
