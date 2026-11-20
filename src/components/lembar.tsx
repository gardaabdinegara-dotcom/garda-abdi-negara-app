"use client";

// Lembar bersama: dari bawah di ponsel, panel samping di desktop. Memakai <dialog> agar fokus dan tombol Esc
// ditangani browser. Gaya di lembar.css (tanpa style inline karena CSP).
import { useEffect, useId, useRef } from "react";
import { Icon } from "./icon";
import "./lembar.css";
import { bukaDialog } from "@/lib/dialog";

export function Lembar({
  open,
  onClose,
  title,
  sub,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const downOnBackdrop = useRef(false);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) bukaDialog(dialog);
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="lembar"
      aria-labelledby={titleId}
      // Peristiwa close dari dialog lain di dalamnya (mis. pratinjau WhatsApp) ikut merambat di React; abaikan.
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="lembar-in">
        <div className="lembar-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {sub ? <p>{sub}</p> : null}
          </div>
          <button type="button" className="lembar-x" aria-label="Tutup" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
