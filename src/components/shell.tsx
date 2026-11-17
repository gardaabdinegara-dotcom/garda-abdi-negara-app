import Link from "next/link";
import { keluar } from "@/app/actions/auth";
import { dataMode } from "@/lib/config";
import { canManageStudents, menuFor } from "@/lib/core/permissions";
import { ROLE_LABEL, type Actor } from "@/lib/core/types";
import { formatToday, initials } from "@/lib/format";
import { Icon } from "./icon";
import { BottomNav, SideNav } from "./nav";
import { ThemeToggle } from "./theme-toggle";

export function Wordmark() {
  return (
    <span className="wordmark">
      <img src="/brand/garda-logo-192-v1.webp" alt="" width={42} height={42} />
      <span className="wordmark-text">
        <b>
          Ruang <i>Garda</i>
        </b>
        <small>GARDA ABDI NEGARA</small>
      </span>
    </span>
  );
}

/**
 * Kerangka halaman setelah masuk.
 * Desktop: menu samping + bar atas berisi pencarian. Tablet: menu ikon. Ponsel: bar atas ringkas + menu bawah.
 */
export function Shell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const items = menuFor(actor);
  const name = actor.user.nama;
  const short = initials(name);
  return (
    <div className="app-shell">
      {dataMode() === "lokal" ? <div className="mode-banner">Mode lokal: data contoh di komputer ini, belum Google Sheets.</div> : null}
      <aside className="sidebar" aria-label="Navigasi">
        <Link href="/beranda" className="sidebar-brand" aria-label="Ruang Garda, ke beranda">
          <img src="/brand/garda-logo-192-v1.webp" alt="" width={40} height={40} />
          <span>
            <b>Ruang Garda</b>
            <small>Garda Abdi Negara</small>
          </span>
        </Link>
        <span className="sidebar-label">MENU</span>
        <SideNav items={items} />
        <div className="sidebar-foot">
          <Link href="/akun-saya" className="sidebar-user" title={`Akun saya: ${name}`}>
            <span className="avatar">{short}</span>
            <span>
              <b>{name}</b>
              <small>{ROLE_LABEL[actor.user.peran]}</small>
            </span>
          </Link>
          <form action={keluar}>
            <button type="submit" className="icon-button" aria-label="Keluar" title="Keluar">
              <Icon name="logout" />
            </button>
          </form>
        </div>
      </aside>
      <div className="app-main">
        <header className="appbar">
          <Link href="/beranda" className="appbar-brand" aria-label="Ruang Garda, ke beranda">
            <img src="/brand/garda-logo-192-v1.webp" alt="" width={34} height={34} />
            Ruang Garda
          </Link>
          {canManageStudents(actor) ? (
            <form action="/siswa" className="appbar-search" role="search">
              <Icon name="search" />
              <input type="search" name="q" placeholder="Cari siswa: nama, kode GAN, atau nomor WA" aria-label="Cari siswa" />
            </form>
          ) : null}
          <div className="appbar-tools">
            <span className="appbar-date">{formatToday()}</span>
            <ThemeToggle />
            <Link href="/akun-saya" className="appbar-avatar" aria-label={`Akun saya: ${name}`}>
              {short}
            </Link>
          </div>
        </header>
        <main className="main" id="konten">
          {children}
        </main>
      </div>
      <BottomNav items={items} />
    </div>
  );
}
