import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FITUR } from "@/lib/core/fitur";
import { PrintButton } from "@/components/akademik-client";
import { rp } from "@/components/keuangan";
import { terbilang } from "@/lib/keuangan/ringkasan";
import { Wordmark } from "@/components/shell";
import { Notice, PageHead } from "@/components/ui";
import { text } from "@/lib/keuangan/domain";
import { formatDate } from "@/lib/format";
import { monthLabel } from "@/components/report-document";
import { loadReceipt } from "@/lib/server/keuangan";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Kuitansi" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  // Tagihan siswa disembunyikan (lib/core/fitur.ts): keuangan dicatat manual lewat Transaksi.
  if (!FITUR.tagihan) notFound();
  const { id } = await params;
  const r = await loadReceipt(actor, decodeURIComponent(id));
  const nomor = `KW-${text(r.tx, "tanggal_transaksi").replace(/-/g, "")}-${text(r.tx, "transaksi_id").slice(-6).toUpperCase()}`;

  return (
    <div className="page">
      <PageHead
        back={{ href: actor.user.peran === "WALI" || actor.user.peran === "SISWA" ? "/keuangan/tagihan" : `/keuangan/tagihan/${text(r.invoice, "tagihan_id")}`, label: "Tagihan" }}
        title="Kuitansi pembayaran"
        actions={<PrintButton label="Cetak / simpan PDF" />}
      />
      {r.reversed ? <Notice tone="danger">Pembayaran ini sudah dikoreksi (dibatalkan dengan pembalik). Kuitansi tidak berlaku.</Notice> : null}
      <article className="report-doc receipt">
        <header className="report-head">
          <Wordmark />
          <div className="receipt-title">
            <h2>Kuitansi</h2>
            <span className="mono">{nomor}</span>
          </div>
        </header>
        <dl className="facts">
          <dt>Diterima dari</dt>
          <dd>
            {r.student.nama}
            <span className="cell-sub">Siswa {r.business}</span>
          </dd>
          <dt>Untuk pembayaran</dt>
          <dd>
            {r.student.program} · {text(r.invoice, "periode_layanan") ? monthLabel(text(r.invoice, "periode_layanan")) : "paket"}
            <span className="cell-sub mono">{text(r.invoice, "nomor_tagihan")}</span>
          </dd>
          <dt>Tanggal</dt>
          <dd>{formatDate(text(r.tx, "tanggal_transaksi"), "long")}</dd>
          <dt>Metode</dt>
          <dd>
            {text(r.tx, "metode_pembayaran") || "-"}
            {text(r.tx, "referensi_eksternal") ? ` · ${text(r.tx, "referensi_eksternal")}` : ""}
          </dd>
        </dl>
        <div className="receipt-amount">
          <span>Jumlah</span>
          <b>{rp(r.nominal)}</b>
          <em>Terbilang: {terbilang(r.nominal)}</em>
        </div>
        <p className="muted">Sisa tagihan setelah pembayaran ini: {rp(r.remaining)}.</p>
        <footer className="report-foot">
          <div className="report-sign">
            <div>
              <span>Penerima: {r.officer}</span>
            </div>
            <div>
              <span>{r.business}</span>
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}
