"use client";

import { Icon } from "./icon";

const KEY = "garda.appearance.v1";

/** Tombol ganti tampilan terang/gelap. Pilihan disimpan di perangkat ini saja. */
export function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.colorMode === "dark" ? "light" : "dark";
    root.dataset.colorMode = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Penyimpanan bisa diblokir; tampilan tetap berganti untuk halaman ini.
    }
  }

  return (
    <button type="button" className="appearance-toggle" onClick={toggle} aria-label="Ganti tampilan terang atau gelap">
      <span className="when-light">
        <Icon name="moon" />
        {withLabel ? <span>Mode gelap</span> : <span className="mode-label">Gelap</span>}
      </span>
      <span className="when-dark">
        <Icon name="sun" />
        {withLabel ? <span>Mode terang</span> : <span className="mode-label">Terang</span>}
      </span>
    </button>
  );
}
