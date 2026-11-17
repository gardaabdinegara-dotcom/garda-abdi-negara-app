import type { Metadata } from "next";
import Link from "next/link";
import { LiveRefresh, QrCountdown, QrToast, RefreshButton } from "@/components/presensi-client";
import { fmtTime, longDay, timeRange } from "@/components/presensi-format";
import { PrIcon } from "@/components/presensi-icons";
import { QR_MINUTES } from "@/lib/auth/qr";
import { loadQrScreen } from "@/lib/server/akademik";
import { presensiQr } from "@/lib/server/qr-presensi";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "QR presensi" };

const METHOD: Record<string, string> = { QR: "Pindai QR", MANDIRI: "Ajukan hadir" };

/** QR layar penuh untuk kelas: besar, hitung mundur 10 menit, angka hadir langsung, dan pengajuan terbaru. */
export default async function QrScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor({ roles: ["OWNER", "ADMIN", "PENGAJAR"] });
  const { id } = await params;
  const data = await loadQrScreen(actor, decodeURIComponent(id));
  const { session, roster, clock } = data;
  const back = `/akademik?sesi=${encodeURIComponent(session.sesi_id)}`;
  const live = session.status === "AKTIF" && session.canManage && session.tanggal === clock.today;
  const qr = live ? await presensiQr(session.sesi_id) : null;

  const hadir = roster.filter((r) => r.record?.status === "HADIR").length;
  const pending = roster.filter((r) => r.record?.status === "MENUNGGU").sort((a, b) => (b.record?.waktu ?? "").localeCompare(a.record?.waktu ?? ""));
  const belum = roster.filter((r) => !r.record || r.record.status === "KOSONG").length;
  const latest = pending[0];

  return (
    <section className="pr pr-qrfull" aria-label="Layar QR presensi">
      {live ? <LiveRefresh seconds={8} /> : null}
      <div className="pr-qtop">
        <Link href={back} className="pr-qbtn" aria-label="Tutup layar QR" title="Tutup">
          <PrIcon name="x" />
        </Link>
        <div className="pr-qtitle">
          <b>{session.nama}</b>
          <span className="n">
            {longDay(session.tanggal)} · {timeRange(session.jam_mulai, session.jam_selesai)}
          </span>
        </div>
        <RefreshButton />
      </div>
      <div className="pr-qmid">
        {qr ? (
          <>
            <p className="pr-qkick">
              Buka Ruang Garda di HP, ketuk <b>Pindai QR</b>
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.image} alt="Kode QR presensi. Pindai dengan kamera HP." width={300} height={300} className="pr-qr big" />
            <QrCountdown rotatesAt={qr.rotatesAt} serverNow={Date.now()} minutes={QR_MINUTES} />
          </>
        ) : (
          <div className="pr-qoff">
            <PrIcon name="lock" size="lg" />
            <b>{session.status === "SELESAI" ? "Sesi sudah ditutup" : session.status === "AKAN_DATANG" ? "Sesi belum dibuka" : !session.canManage ? "Sesi milik pengajar lain" : "QR tidak tersedia"}</b>
            <span>QR hanya tampil saat sesi berlangsung.</span>
            <Link className="pr-hb" href={back}>
              Kembali ke Presensi
            </Link>
          </div>
        )}
      </div>
      <div className="pr-cnt pr-qcnt" aria-live="polite">
        <div>
          <b className="n">{hadir}</b>
          <span>
            <i className="d h" />
            Hadir
          </span>
        </div>
        <div>
          <b className="n">{pending.length}</b>
          <span>
            <i className="d w" />
            Menunggu
          </span>
        </div>
        <div>
          <b className="n">{belum}</b>
          <span>
            <i className="d" />
            Belum
          </span>
        </div>
      </div>
      {latest && live ? (
        <QrToast
          key={`${latest.siswa_id}:${latest.record?.waktu}`}
          sesiId={session.sesi_id}
          id={latest.siswa_id}
          nama={latest.nama}
          sub={`${latest.record?.status_diajukan === "IZIN" ? "Minta izin" : latest.record?.status_diajukan === "SAKIT" ? "Minta sakit" : (METHOD[latest.record?.metode ?? ""] ?? "Ajukan hadir")} · ${fmtTime(latest.record?.waktu ?? "")}${pending.length > 1 ? ` · ${pending.length - 1} lainnya menunggu` : ""}`}
        />
      ) : (
        <div className="pr-qfoot pr-xs">Siswa yang memindai muncul di sini untuk disahkan.</div>
      )}
    </section>
  );
}
