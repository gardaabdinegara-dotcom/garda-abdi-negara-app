import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Font dan logo PDF dibaca dari disk oleh route laporan; pastikan ikut terbawa saat deploy.
  outputFileTracingIncludes: {
    "/keuangan/laporan/*": ["src/lib/keuangan/assets/**/*"],
  },
  async headers() {
    // Header keamanan tetap untuk semua respons; CSP dengan nonce dipasang di src/proxy.ts.
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ];
    if (process.env.NODE_ENV === "production") {
      security.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
    }
    return [{ source: "/:path*", headers: security }];
  },
};

export default nextConfig;
