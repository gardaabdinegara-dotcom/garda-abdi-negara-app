"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icon";

interface InstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    gardaInstallPrompt?: InstallPromptEvent;
    gardaAppInstalled?: boolean;
  }
}

function installInstructions(): string[] {
  const { userAgent, maxTouchPoints } = navigator;
  const appleMobile = /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
  if (appleMobile) {
    return [
      "Buka Ruang Garda di Safari, lalu ketuk Bagikan di bar Safari atau di menu halaman.",
      "Pilih Tambah ke Layar Utama.",
      "Aktifkan Buka sebagai App Web jika tersedia, lalu ketuk Tambah.",
    ];
  }
  if (/Android/i.test(userAgent)) {
    return [
      "Buka Ruang Garda di Chrome dan ketuk menu ⋮.",
      "Pilih Instal dan buat pintasan atau Tambahkan ke layar utama, lalu ketuk Instal.",
    ];
  }
  if (/Macintosh/i.test(userAgent) && /Version\/.*Safari/i.test(userAgent)) {
    return ["Di Safari, klik Bagikan, lalu pilih Tambahkan ke Dock.", "Klik Tambah."];
  }
  return [
    "Buka Ruang Garda di Chrome atau Edge.",
    "Klik ikon pasang di bilah alamat, atau buka menu browser dan pilih opsi untuk memasang situs sebagai aplikasi.",
  ];
}

export function AppInstallButton() {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const promptPending = useRef(false);
  const [installed, setInstalled] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const sync = () => {
      const appOpen = (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const isInstalled = standalone.matches || appOpen || window.gardaAppInstalled === true;
      setInstalled(isInstalled);
      if (isInstalled) dialog.current?.close();
    };
    sync();
    standalone.addEventListener("change", sync);
    window.addEventListener("appinstalled", sync);
    return () => {
      standalone.removeEventListener("change", sync);
      window.removeEventListener("appinstalled", sync);
    };
  }, []);

  async function install() {
    if (promptPending.current) return;
    const prompt = window.gardaInstallPrompt;
    if (prompt) {
      window.gardaInstallPrompt = undefined;
      promptPending.current = true;
      try {
        const choice = await prompt.prompt();
        if (choice.outcome === "accepted") {
          window.gardaAppInstalled = true;
          setInstalled(true);
        }
        return;
      } catch {
        // Jika browser tidak membuka dialog pemasangan, tampilkan langkah lewat menunya.
      } finally {
        promptPending.current = false;
      }
    }
    setSteps(installInstructions());
    dialog.current?.showModal();
  }

  if (installed) return null;
  return (
    <>
      <button type="button" className="icon-button app-install-button" onClick={install} aria-label="Pasang Aplikasi" title="Pasang Aplikasi">
        <Icon name="download" />
        <span className="app-install-label">Pasang Aplikasi</span>
      </button>
      <dialog ref={dialog} className="app-install-dialog" aria-labelledby={titleId}>
        <div className="stack">
          <h2 id={titleId} className="app-install-title">Pasang Ruang Garda</h2>
          <ol>
            {steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
          <form method="dialog" className="form-actions">
            <button className="btn" type="submit">Tutup</button>
          </form>
        </div>
      </dialog>
    </>
  );
}
