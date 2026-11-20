"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon, type IconName } from "./icon";
import { bukaDialog } from "@/lib/dialog";

interface InstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    gardaInstallPrompt?: InstallPromptEvent;
    gardaAppInstalled?: boolean;
  }
}

interface Step {
  icon: IconName;
  text: string;
}

function installInstructions(): Step[] {
  const { userAgent, maxTouchPoints } = navigator;
  const appleMobile = /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
  if (appleMobile) {
    return [
      { icon: "share", text: "Buka Ruang Garda di Safari, lalu ketuk Bagikan (kotak dengan panah ke atas) di bar Safari." },
      { icon: "plus", text: "Gulir lalu pilih Tambah ke Layar Utama." },
      { icon: "phone", text: "Ketuk Tambah. Ikon Ruang Garda muncul di layar utama dan terbuka seperti aplikasi." },
    ];
  }
  if (/Android/i.test(userAgent)) {
    return [
      { icon: "more", text: "Buka Ruang Garda di Chrome dan ketuk menu ⋮ di kanan atas." },
      { icon: "download", text: "Pilih Instal aplikasi atau Tambahkan ke layar utama, lalu ketuk Instal." },
    ];
  }
  if (/Macintosh/i.test(userAgent) && /Version\/.*Safari/i.test(userAgent)) {
    return [
      { icon: "share", text: "Di Safari, klik Bagikan, lalu pilih Tambahkan ke Dock." },
      { icon: "plus", text: "Klik Tambah." },
    ];
  }
  return [
    { icon: "download", text: "Buka Ruang Garda di Chrome atau Edge, lalu klik ikon pasang di ujung kanan bilah alamat." },
    { icon: "more", text: "Bila ikonnya tidak ada: buka menu browser, pilih Simpan dan bagikan atau Aplikasi, lalu Pasang." },
  ];
}

export function AppInstallButton() {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const promptPending = useRef(false);
  const [installed, setInstalled] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);

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
    bukaDialog(dialog.current);
  }

  if (installed) return null;
  return (
    <>
      <button type="button" className="icon-button app-install-button" onClick={install} aria-label="Pasang Aplikasi" title="Pasang Aplikasi">
        <Icon name="phone" />
        <span className="app-install-label">Pasang Aplikasi</span>
        <span className="app-install-short">Pasang</span>
      </button>
      <dialog ref={dialog} className="app-install-dialog" aria-labelledby={titleId}>
        <div className="stack">
          <h2 id={titleId} className="app-install-title">Pasang Ruang Garda</h2>
          <p className="muted">Setelah dipasang, Ruang Garda terbuka dari layar utama seperti aplikasi, tanpa mengetik alamat.</p>
          <ol className="app-install-steps">
            {steps.map((step, i) => (
              <li key={step.text}>
                <span className="app-install-num">{i + 1}</span>
                <span className="app-install-ico">
                  <Icon name={step.icon} />
                </span>
                <span>{step.text}</span>
              </li>
            ))}
          </ol>
          <form method="dialog" className="form-actions">
            <button className="btn" type="submit">Tutup</button>
          </form>
        </div>
      </dialog>
    </>
  );
}
