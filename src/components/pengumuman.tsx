// Tampilan pengumuman: kartu "Info dari pelatih" di beranda siswa dan kartu daftar di halaman owner.
import { randomUUID } from "node:crypto";
import { hapusPengumumanAction } from "@/app/actions/pengumuman";
import { teksWaPengumuman } from "@/lib/core/pengumuman-teks";
import type { PengumumanView } from "@/lib/server/pengumuman";
import { ActionForm, SubmitButton } from "./form";
import { TulisPengumuman } from "./pengumuman-tulis";
import { WaKabari } from "./wa";
import "./pengumuman.css";

const ZONA = "Asia/Jakarta";

/** "2026-11-19T02:00:00Z" → "Kamis, 19 Nov" (atau dengan tahun). */
export function tanggalTerbit(iso: string, tahun = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", { timeZone: ZONA, weekday: "long", day: "numeric", month: "short", ...(tahun ? { year: "numeric" } : {}) }).format(d);
}

/** "2026-11-29" → "29 Nov". */
export function tanggalPendek(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  return new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
}

function IsiInfo({ p }: { p: PengumumanView }) {
  return (
    <>
      <h3 className="png-judul">{p.judul}</h3>
      <p className="png-isi">{p.isi}</p>
      <span className="png-oleh">
        {p.penulis} · {tanggalTerbit(p.created_at, true)}
      </span>
    </>
  );
}

/** Kartu "Info dari pelatih" di bawah sapaan beranda siswa: satu info tampil, sisanya dibuka lewat "N info lain". */
export function InfoPelatihCard({ items }: { items: PengumumanView[] }) {
  if (items.length === 0) return null;
  const [first, ...rest] = items;
  return (
    <section className="card png-info" aria-labelledby="info-pelatih">
      <div className="png-atas">
        <span className="png-ey" id="info-pelatih">
          Info dari pelatih
        </span>
        {first!.disematkan ? <span className="badge badge-warning">Disematkan</span> : null}
      </div>
      <IsiInfo p={first!} />
      {rest.length ? (
        <details className="png-lain">
          <summary>
            <b>{rest.length} info lain</b>
            <span>{rest.map((p) => p.judul).join(" · ")}</span>
          </summary>
          <ul>
            {rest.map((p) => (
              <li key={p.pengumuman_id}>
                {p.disematkan ? <span className="badge badge-warning">Disematkan</span> : null}
                <IsiInfo p={p} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

/** Kartu satu pengumuman di halaman owner, dengan Ubah, kirim WA, dan Hapus. */
export function PengumumanKartu({ p, today, lewat = false }: { p: PengumumanView; today: string; lewat?: boolean }) {
  return (
    <article className={`card png-kartu${p.disematkan && !lewat ? " is-sematan" : ""}`}>
      <div className="png-atas">
        <span className="row">
          {p.disematkan && !lewat ? <span className="badge badge-warning">Disematkan</span> : null}
          <span className="png-tgl">{tanggalTerbit(p.created_at)}</span>
        </span>
      </div>
      <h3 className="png-judul">{p.judul}</h3>
      <p className="png-isi">{p.isi}</p>
      <div className="png-meta">
        <span className={`badge${lewat ? "" : " badge-info"}`}>
          {lewat ? "Berakhir" : "Tampil sampai"} {tanggalPendek(p.tampil_sampai)}
        </span>
      </div>
      <div className="png-aksi">
        <TulisPengumuman tombol="kecil" today={today} awal={{ pengumuman_id: p.pengumuman_id, judul: p.judul, isi: p.isi, tampil_sampai: p.tampil_sampai, disematkan: p.disematkan }} />
        <WaKabari nomor={null} tanpaNomorBoleh pesan={teksWaPengumuman(p)} label="Kirim ke WA" judul="Kirim ke grup WhatsApp" untuk="Pilih grup atau chat di WhatsApp" />
        <ActionForm action={hapusPengumumanAction} operationId={randomUUID()} confirm={`Hapus "${p.judul}" dari beranda siswa?`} className="png-hapus">
          <input type="hidden" name="pengumuman_id" value={p.pengumuman_id} />
          <SubmitButton variant="ghost" size="sm" pendingLabel="Menghapus…">
            Hapus
          </SubmitButton>
        </ActionForm>
      </div>
    </article>
  );
}
