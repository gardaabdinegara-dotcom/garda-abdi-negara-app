"use client";

import { Icon } from "@/components/icon";

/** Membuka jendela cetak browser (bisa juga disimpan sebagai PDF). */
export function TombolCetak() {
  return (
    <button type="button" className="btn" onClick={() => window.print()}>
      <Icon name="print" />
      Cetak / simpan PDF
    </button>
  );
}
