"use client";

// Tab Pengaturan: satu baris yang bisa digeser (tidak terlipat di ponsel). Tab aktif digulir agar terlihat,
// dan tepi yang masih menyimpan tab lain diberi efek pudar.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FITUR } from "@/lib/core/fitur";
import "./tabs.css";

const ITEMS = [
  { key: "akun", href: "/pengaturan/akun", label: "Akun" },
  { key: "kelas-program", href: "/pengaturan/kelas-program", label: "Program & kelas" },
  { key: "bidang-presensi", href: "/pengaturan/bidang-presensi", label: "Bidang presensi" },
  { key: "lembaga", href: "/pengaturan/lembaga", label: "Lembaga" },
  { key: "pesan-wa", href: "/pengaturan/pesan-wa", label: "Pesan WA" },
  { key: "pratinjau", href: "/pengaturan/pratinjau", label: "Mode pratinjau" },
] as const;

type Key = (typeof ITEMS)[number]["key"] | "sistem";

export function SettingsTabs({ current, owner = false }: { current: Key; owner?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const [fade, setFade] = useState("");
  // Program & kelas disembunyikan selama kelas tidak dipakai; tetap tampil bila halamannya sedang dibuka.
  const items = [
    ...ITEMS.filter((item) => item.key !== "kelas-program" || FITUR.kelas || current === "kelas-program"),
    ...(owner ? [{ key: "sistem", href: "/pengaturan/sistem", label: "Sistem" } as const] : []),
  ];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (active && el.scrollWidth > el.clientWidth) {
      // Geser seperlunya agar item aktif terlihat utuh (dengan sedikit ruang), tanpa memotong item pertama.
      // Sisakan ruang selebar efek pudar agar item aktif tidak tertutup pudar.
      const padLeft = 40;
      const padRight = 56;
      const left = active.offsetLeft;
      const right = left + active.offsetWidth;
      if (left - padLeft < el.scrollLeft) el.scrollLeft = Math.max(0, left - padLeft);
      else if (right + padRight > el.scrollLeft + el.clientWidth) el.scrollLeft = right + padRight - el.clientWidth;
    }
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setFade([el.scrollLeft > 2 ? "l" : "", el.scrollLeft < max - 2 ? "r" : ""].filter(Boolean).join(" "));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [current]);

  return (
    <nav ref={ref} className="set-tabs" aria-label="Bagian pengaturan" data-fade={fade || undefined}>
      {items.map((item) => (
        <Link key={item.key} href={item.href} className="tab" aria-current={item.key === current ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
