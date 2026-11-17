import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import { nonce } from "@/lib/server/session";
import "./globals.css";

// Plus Jakarta Sans: huruf buatan Indonesia, jelas di layar kecil. Diunduh saat build lalu disajikan dari server sendiri.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Ruang Garda", template: "%s · Ruang Garda" },
  description: "Ruang kerja akademik dan keuangan Garda Abdi Negara.",
  applicationName: "Ruang Garda",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/garda-favicon-v1.ico", sizes: "any" },
      { url: "/brand/garda-icon-192-v1.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/brand/garda-apple-touch-v1.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#10120c" },
  ],
};

/** Dijalankan sebelum halaman tampil agar tidak berkedip saat memakai mode gelap. */
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem("garda.appearance.v1");var d=s==="dark"||(s!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.colorMode=d?"dark":"light"}catch(e){document.documentElement.dataset.colorMode="light"}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const scriptNonce = await nonce();
  return (
    <html lang="id" data-color-mode="light" className={jakarta.variable} suppressHydrationWarning>
      <body>
        <Script id="tema-tampilan" strategy="beforeInteractive" nonce={scriptNonce}>
          {THEME_SCRIPT}
        </Script>
        {children}
      </body>
    </html>
  );
}
