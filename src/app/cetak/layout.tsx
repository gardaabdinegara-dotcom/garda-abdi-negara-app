import "./cetak.css";

// Halaman cetak berdiri sendiri, di luar kerangka aplikasi. Setiap halaman memeriksa hak aksesnya sendiri.
export default function CetakLayout({ children }: { children: React.ReactNode }) {
  return children;
}
