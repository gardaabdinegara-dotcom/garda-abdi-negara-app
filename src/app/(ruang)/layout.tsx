import { Shell } from "@/components/shell";
import { isPreview } from "@/lib/server/data";
import { requireActor } from "@/lib/server/session";

// Tata letak ini hanya kerangka; setiap halaman tetap memeriksa hak aksesnya sendiri.
export default async function RuangLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  return (
    <Shell actor={actor} preview={await isPreview()}>
      {children}
    </Shell>
  );
}
