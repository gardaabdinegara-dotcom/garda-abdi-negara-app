import type { Metadata } from "next";
import Link from "next/link";
import { keluar } from "@/app/actions/auth";
import { Icon } from "@/components/icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { PageHead } from "@/components/ui";
import { menuFor } from "@/lib/core/permissions";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Menu" };

export default async function MenuPage() {
  const actor = await requireActor();
  const items = menuFor(actor);
  if (!items.some((item) => item.href === "/akun-saya")) items.push({ key: "akun-saya", label: "Akun & PIN", href: "/akun-saya", icon: "user" });
  if (!items.some((item) => item.href === "/panduan")) items.push({ key: "panduan", label: "Panduan", href: "/panduan", icon: "file" });

  return (
    <div className="page">
      <PageHead title="Menu" description="Semua bagian yang bisa Anda buka." />
      <nav className="menu-list" aria-label="Semua menu">
        {items.map((item) => (
          <Link key={item.key} href={item.href}>
            <span className="icon-box">
              <Icon name={item.icon} />
            </span>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="row spread">
        <ThemeToggle withLabel />
        <form action={keluar}>
          <button type="submit" className="btn btn-secondary">
            <Icon name="logout" />
            Keluar
          </button>
        </form>
      </div>
    </div>
  );
}
