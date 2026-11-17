import Link from "next/link";
import { Icon } from "@/components/icon";
import { TombolCetak } from "./tombol-cetak";

/** Bilah atas halaman cetak. Hanya tampil di layar; tidak ikut tercetak. */
export function CetakBar({ back, title, sub, children }: { back: { href: string; label: string }; title: string; sub: string; children?: React.ReactNode }) {
  return (
    <header className="cetak-bar">
      <div className="cetak-bar-in">
        <Link href={back.href} className="btn btn-ghost btn-sm cetak-back">
          <Icon name="back" />
          {back.label}
        </Link>
        <div className="cetak-bar-text">
          <h1>{title}</h1>
          <p>{sub}</p>
        </div>
        <div className="cetak-bar-actions">
          {children}
          <TombolCetak />
        </div>
        <p className="cetak-hint">
          <Icon name="print" />
          <span>Di jendela cetak pilih kertas A4, skala 100%, margin tidak ada/default.</span>
        </p>
      </div>
    </header>
  );
}
