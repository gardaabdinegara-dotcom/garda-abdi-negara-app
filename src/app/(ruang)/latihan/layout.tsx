import "./latihan-tes.css";
import "./latihan-progres.css";
import "./latihan-target.css";

// Hanya memuat gaya menu, hasil, progres, target, dan rekap latihan; setiap halaman memeriksa hak aksesnya sendiri.
export default function LatihanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
