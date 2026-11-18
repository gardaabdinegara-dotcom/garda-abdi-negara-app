import { Tabs } from "@/components/ui";

const ITEMS = [
  { key: "akun", href: "/pengaturan/akun", label: "Akun" },
  { key: "kelas-program", href: "/pengaturan/kelas-program", label: "Program & kelas" },
  { key: "bidang-presensi", href: "/pengaturan/bidang-presensi", label: "Bidang presensi" },
  { key: "lembaga", href: "/pengaturan/lembaga", label: "Lembaga" },
  { key: "pratinjau", href: "/pengaturan/pratinjau", label: "Mode pratinjau" },
] as const;

export function SettingsTabs({
  current,
  owner = false,
}: {
  current: (typeof ITEMS)[number]["key"] | "sistem";
  owner?: boolean;
}) {
  const items = [...ITEMS, ...(owner ? [{ key: "sistem", href: "/pengaturan/sistem", label: "Sistem" }] : [])];
  return <Tabs items={items} current={current} label="Bagian pengaturan" />;
}
