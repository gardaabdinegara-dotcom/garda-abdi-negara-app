import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { canManageAccount } from "@/lib/core/permissions";
import { formatDate, todayISO } from "@/lib/format";
import { loadAccounts, loadSettings } from "@/lib/server/queries";
import { requireActor } from "@/lib/server/session";
import { CetakBar } from "../cetak-bar";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Cetak kartu login" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const PER_LEMBAR = 8;
const LEMBAGA = "Bimbel Garda Abdi Negara";

/** Alamat aplikasi dari permintaan ini (domain Vercel di produksi, 127.0.0.1:3020 saat uji lokal). */
async function alamatAplikasi(): Promise<{ origin: string; host: string }> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "127.0.0.1:3020").split(",")[0]!.trim();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = (h.get("x-forwarded-proto") ?? (local ? "http" : "https")).split(",")[0]!.trim();
  return { origin: `${proto}://${host}`, host };
}

/**
 * Kartu login siswa siap cetak: 8 kartu per lembar A4 (2 × 4) dengan garis gunting.
 * Isi kartu: nama, username, alamat aplikasi, QR ke halaman masuk, dan 3 langkah. PIN/password tidak pernah dicetak.
 */
export default async function KartuLoginPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor({ roles: ["OWNER", "ADMIN"] });
  if (!canManageAccount(actor, "SISWA")) notFound();
  const raw = (await searchParams).siapa;
  const siapa = (Array.isArray(raw) ? raw[0] : raw) === "semua" ? "semua" : "belum";
  const [accounts, settings, alamat] = await Promise.all([loadAccounts(actor), loadSettings(), alamatAplikasi()]);
  const siswa = accounts
    .filter((a) => a.peran === "SISWA" && a.aktif && (siapa === "semua" || !a.punya_kredensial))
    .map((a) => ({ id: a.user_id, nama: a.nama, username: a.username }))
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  const loginUrl = `${alamat.origin}/masuk`;
  const svg = await QRCode.toString(loginUrl, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
  const qr = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  const lembar = Array.from({ length: Math.ceil(siswa.length / PER_LEMBAR) }, (_, i) => siswa.slice(i * PER_LEMBAR, (i + 1) * PER_LEMBAR));
  const tanggal = formatDate(todayISO(settings.zona_waktu));
  const label = siapa === "semua" ? "Semua siswa aktif" : "Siswa yang belum membuat PIN";

  return (
    <main className="cetak">
      <CetakBar
        back={{ href: "/pengaturan/akun", label: "Akun pengguna" }}
        title="Kartu login siswa"
        sub={`${label}: ${siswa.length} kartu · ${lembar.length} lembar A4 · 8 kartu per lembar`}
      >
        <nav className="kartu-pilih" aria-label="Siapa yang dicetak">
          <Link href="/cetak/kartu-login?siapa=belum" className="tab" aria-current={siapa === "belum" ? "page" : undefined}>
            Belum membuat PIN
          </Link>
          <Link href="/cetak/kartu-login?siapa=semua" className="tab" aria-current={siapa === "semua" ? "page" : undefined}>
            Semua siswa
          </Link>
        </nav>
      </CetakBar>
      <p className="kartu-pesan">
        Berikan kartu langsung ke siswanya dan minta ia membuat PIN di tempat: sebelum PIN dibuat, siapa pun yang tahu username bisa membuatnya lebih dulu.
      </p>
      {siswa.length === 0 ? (
        <div className="kartu-kosong">
          <b>{siapa === "belum" ? "Semua siswa sudah membuat PIN" : "Belum ada akun siswa aktif"}</b>
          <span>
            {siapa === "belum" ? (
              <>
                Pilih <Link href="/cetak/kartu-login?siapa=semua">Semua siswa</Link> untuk mencetak ulang kartu.
              </>
            ) : (
              "Tambah atau impor siswa dari menu Siswa; akunnya dibuat otomatis."
            )}
          </span>
        </div>
      ) : (
        <div className="cetak-sheets">
          {lembar.map((isi, i) => (
            <div className="kartu-frame" key={i}>
              <section className="kartu-a4" aria-label={`Lembar ${i + 1} dari ${lembar.length}`}>
                <header className="kartu-a4-h">
                  <span>Kartu login siswa · {LEMBAGA}</span>
                  <span>
                    Lembar {i + 1} dari {lembar.length} · {tanggal}
                  </span>
                </header>
                <div className="kartu-grid">
                  {isi.map((s) => (
                    <article className="kartu" key={s.id}>
                      <div className="kartu-h">
                        <img src="/brand/garda-icon-192-v1.png" alt="" width={40} height={40} />
                        <div>
                          <b>{LEMBAGA}</b>
                          <span>Kartu masuk aplikasi Ruang Garda</span>
                        </div>
                      </div>
                      <div className="kartu-m">
                        <dl className="kartu-id">
                          <dt>Nama</dt>
                          <dd className="kartu-nama">{s.nama}</dd>
                          <dt>Username</dt>
                          <dd className="kartu-user">{s.username}</dd>
                          <dt>Alamat aplikasi</dt>
                          <dd className="kartu-url">{alamat.host}</dd>
                        </dl>
                        <figure className="kartu-qr">
                          <img src={qr} alt={`QR menuju ${loginUrl}`} width={96} height={96} />
                          <figcaption>Pindai untuk membuka</figcaption>
                        </figure>
                      </div>
                      <ol className="kartu-langkah">
                        <li>Buka alamat di atas atau pindai QR.</li>
                        <li>
                          Ketik username <b>{s.username}</b>.
                        </li>
                        <li>Kosongkan PIN, tekan Masuk, lalu buat PIN 6 angka.</li>
                      </ol>
                    </article>
                  ))}
                  {Array.from({ length: PER_LEMBAR - isi.length }, (_, k) => (
                    <div className="kartu kartu-sisa" key={`sisa-${k}`} aria-hidden="true" />
                  ))}
                </div>
                <footer className="kartu-a4-f">Gunting di sepanjang garis putus-putus.</footer>
              </section>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
