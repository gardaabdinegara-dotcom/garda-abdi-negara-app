import "server-only";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { rotatingQrToken } from "../auth/qr";

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "127.0.0.1:3020";
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  return `${h.get("x-forwarded-proto") ?? (local ? "http" : "https")}://${host}`;
}

export interface PresensiQr {
  /** Gambar SVG sebagai data URI (img-src CSP mengizinkan data:). */
  image: string;
  /** Waktu QR berganti (ms sejak epoch). */
  rotatesAt: number;
}

/** QR presensi sesi untuk jendela 10 menit yang sedang berjalan. Selalu gelap di atas putih agar mudah dipindai. */
export async function presensiQr(sesiId: string): Promise<PresensiQr> {
  const { token, rotatesAt } = rotatingQrToken(sesiId);
  const url = `${await origin()}/qr-presensi?t=${encodeURIComponent(token)}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1c2014", light: "#ffffff" } });
  return { image: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, rotatesAt };
}
