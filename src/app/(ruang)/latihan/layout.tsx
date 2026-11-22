import "./latihan-tes.css";
import "./latihan-progres.css";
import "./latihan-target.css";
import "./latihan-klasemen.css";

// Hanya memuat gaya menu, hasil, progres, target, klasemen, dan rekap latihan; setiap halaman memeriksa hak aksesnya sendiri.
export default function LatihanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
