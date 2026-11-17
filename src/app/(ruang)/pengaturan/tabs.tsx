import { Tabs } from "@/components/ui";

const ITEMS = [
  { key: "akun", href: "/pengaturan/akun", label: "Akun" },
  { key: "kelas-program", href: "/pengaturan/kelas-program", label: "Program & kelas" },
  { key: "lembaga", href: "/pengaturan/lembaga", label: "Lembaga" },
  { key: "pratinjau", href: "/pengaturan/pratinjau", label: "Mode pratinjau" },
];

export function SettingsTabs({ current, owner = false }: { current: "akun" | "kelas-program" | "lembaga" | "sistem" | "pratinjau"; owner?: boolean }) {
  const items = owner ? [...ITEMS, { key: "sistem", href: "/pengaturan/sistem", label: "Sistem" }] : ITEMS;
  return <Tabs items={items} current={current} label="Bagian pengaturan" />;
}
