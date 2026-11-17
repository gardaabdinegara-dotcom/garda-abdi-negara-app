import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Notice, PageHead } from "@/components/ui";
import { loadSystemStatus } from "@/lib/server/sistem";
import { requireActor } from "@/lib/server/session";
import { SettingsTabs } from "../tabs";

export const metadata: Metadata = { title: "Status sistem" };

export default async function SystemPage() {
  await requireActor({ roles: ["OWNER"] });
  const status = await loadSystemStatus();
  const allOk = status.envOk && status.sheets.every((s) => s.ok);

  return (
    <div className="page">
      <PageHead
        eyebrow="Pengaturan"
        title="Status sistem"
        description="Periksa konfigurasi dan kedua spreadsheet sebelum dan sesudah deploy. Nilai rahasia tidak pernah ditampilkan."
        actions={
          !allOk ? <Badge tone="warning">Perlu diperiksa</Badge> : status.mode === "lokal" ? <Badge tone="info">Mode lokal</Badge> : <Badge tone="success">Siap dipakai</Badge>
        }
      />
      <SettingsTabs current="sistem" owner />
      {status.mode === "lokal" ? <Notice tone="warning">Aplikasi berjalan dengan data lokal (.data/lokal.json). Untuk data nyata, isi konfigurasi Google Sheets lalu jalankan ulang.</Notice> : null}
      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Konfigurasi</h2>
          </div>
          <div className="item-list">
            {status.env.map((item) => (
              <div className="item" key={item.key}>
                <div className="item-main">
                  <b>{item.label}</b>
                  <span className="cell-sub">{item.detail}</span>
                </div>
                {item.ok ? <Badge tone="success">OK</Badge> : item.required ? <Badge tone="danger">Wajib</Badge> : <Badge>Belum</Badge>}
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Spreadsheet</h2>
          </div>
          <div className="item-list">
            {status.sheets.map((sheet) => (
              <div className="item" key={sheet.sheet}>
                <div className="item-main">
                  <b>{sheet.label}</b>
                  <span className="cell-sub">
                    {sheet.error
                      ? sheet.error
                      : sheet.missing.length
                        ? `Tab belum ada: ${sheet.missing.join(", ")}. Jalankan npm run setup:sheets -- --apply.`
                        : "Semua tab dan header sesuai."}
                    {sheet.extra.length ? ` Tab lain dibiarkan: ${sheet.extra.join(", ")}.` : ""}
                  </span>
                </div>
                {sheet.ok ? <Badge tone="success">OK</Badge> : <Badge tone="danger">Periksa</Badge>}
              </div>
            ))}
          </div>
          <p className="muted">Diperiksa {new Date(status.checkedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}. Muat ulang halaman untuk memeriksa lagi.</p>
        </section>
      </div>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Langkah berikutnya</h2>
            <p>Urutan lengkap ada di README proyek, bagian “Dari Fase 0 sampai aplikasi jalan” dan “Deploy ke Vercel”.</p>
          </div>
        </div>
        <ul className="plain-list">
          <li>Konfigurasi di komputer sendiri: npm run cek:env (atau --produksi untuk syarat Vercel).</li>
          <li>Tab dan header: npm run setup:sheets lalu npm run setup:sheets -- --apply.</li>
          <li>
            Cara memakai aplikasi per peran: <Link href="/panduan">Panduan singkat</Link>.
          </li>
        </ul>
      </section>
    </div>
  );
}
