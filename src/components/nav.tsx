"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MenuItem } from "@/lib/core/permissions";
import { Icon } from "./icon";

/** Menu yang paling cocok dengan alamat sekarang (awalan terpanjang). */
function activeHref(pathname: string, items: readonly MenuItem[]): string | null {
  let best: string | null = null;
  for (const item of items) {
    const match = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (match && (!best || item.href.length > best.length)) best = item.href;
  }
  return best;
}

/** Menu samping di desktop (dan ikon saja di tablet). */
export function SideNav({ items }: { items: MenuItem[] }) {
  const pathname = usePathname();
  const current = activeHref(pathname, items);
  return (
    <nav className="sidenav" aria-label="Menu utama">
      {items.map((item) => (
        <Link key={item.key} href={item.href} className="sidelink" title={item.label} aria-current={item.href === current ? "page" : undefined}>
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Navigasi bawah di ponsel: paling banyak 5 tombol, sisanya masuk "Lainnya". */
export function BottomNav({ items }: { items: MenuItem[] }) {
  const pathname = usePathname();
  const more: MenuItem = { key: "lainnya", label: "Lainnya", href: "/menu", icon: "more" };
  const shown = items.length > 5 ? [...items.slice(0, 4), more] : items;
  const hidden = items.length > 5 ? items.slice(4) : [];
  let current = activeHref(pathname, shown);
  if (pathname === "/menu" || activeHref(pathname, hidden)) current = "/menu";
  return (
    <nav className="bottomnav" aria-label="Menu utama ponsel">
      {shown.map((item) => (
        <Link key={item.key} href={item.href} aria-current={item.href === current ? "page" : undefined}>
          <Icon name={item.icon} />
          <span>{item.short ?? item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
