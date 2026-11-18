import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { ajukanPresensiQr } from "@/app/actions/akademik";
import { AttendanceBadge } from "@/components/akademik";
import { ActionForm, SubmitButton } from "@/components/form";
import { Wordmark } from "@/components/shell";
import { Notice } from "@/components/ui";
import { readQrToken } from "@/lib/auth/qr";
import { sessionTypeLabel } from "@/lib/core/akademik";
import { formatDate } from "@/lib/format";
import { loadQrSession } from "@/lib/server/akademik";
import { getActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Presensi QR" };

type Search = Promise<Record<string, string | string[] | undefined>>;

/** Halaman tujuan QR sesi. Dibuka dari kamera ponsel siswa; login dulu bila belum. */
export default async function QrPage({ searchParams }: { searchParams: Search }) {
  const token = (await searchParams).t;
  const value = typeof token === "string" ? token : "";
  const actor = await getActor();
  if (!actor) redirect(`/masuk?lanjut=${encodeURIComponent(`/qr-presensi?t=${value}`)}`);
  if (actor.user.wajib_ganti_password) redirect("/ganti-password");

  const sesiId = readQrToken(value);
  const data = sesiId && actor.user.peran === "SISWA" ? await loadQrSession(actor, sesiId) : null;
  const record = data?.record && data.record.status !== "KOSONG" ? data.record : null;

  return (
    <div className="standalone">
      <Wordmark />
      <section className="card">
        <div className="card-head">
          <div>
            <span className="eyebrow">Presensi QR</span>
            <h2>{data ? data.session.nama : "Presensi sesi"}</h2>
            {data ? (
              <p>
                {formatDate(data.session.tanggal, "long")} · {data.session.jam_mulai}–{data.session.jam_selesai} · {data.kelas} · {sessionTypeLabel(data.session.jenis)}
              </p>
            ) : null}
          </div>
        </div>
        {actor.user.peran !== "SISWA" ? (
          <Notice tone="warning">QR ini untuk akun siswa. Pengajar mencatat presensi dari halaman sesi.</Notice>
        ) : !sesiId ? (
          <Notice tone="danger">QR sudah kedaluwarsa atau tidak sah. Pindai ulang QR yang sedang ditampilkan pengajar.</Notice>
        ) : !data ? (
          <Notice tone="danger">Sesi tidak ditemukan.</Notice>
        ) : record ? (
          <div className="stack">
            <AttendanceBadge status={record.status} late={record.terlambat} />
            <p className="muted">{record.status === "MENUNGGU" ? "Pengajuan Anda sudah terkirim dan menunggu pengesahan pengajar." : "Presensi Anda untuk sesi ini sudah tercatat."}</p>
          </div>
        ) : !data.participant ? (
          <Notice tone="warning">Anda tidak terdaftar di kelas sesi ini.</Notice>
        ) : data.session.status !== "AKTIF" || data.session.tanggal !== data.clock.today ? (
          <Notice tone="warning">Sesi ini belum dibuka atau sudah ditutup.</Notice>
        ) : (
          <ActionForm action={ajukanPresensiQr} operationId={randomUUID()} className="stack">
            <input type="hidden" name="qr" value={value} />
            <p className="muted">Jam sekarang {data.clock.now}. Keterlambatan dihitung dari jam mulai ditambah {data.clock.settings.toleransi} menit.</p>
            <SubmitButton block pendingLabel="Mengirim…">
              Ajukan hadir
            </SubmitButton>
          </ActionForm>
        )}
      </section>
      <Link href="/beranda" className="btn btn-ghost">
        Ke beranda
      </Link>
    </div>
  );
}
