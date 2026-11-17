import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Field, SubmitButton } from "@/components/form";
import { FinanceForm, KeuanganHead, KIND_LABEL, LainnyaDaftar, MonthSwitch, rp } from "@/components/keuangan";
import { Dompet, type DompetAkun, type DompetKategori } from "@/components/keuangan-dompet";
import { accountIcon, KgIcon } from "@/components/keuangan-ikon";
import { Notice } from "@/components/ui";
import { FITUR } from "@/lib/core/fitur";
import { canSeeChildBills } from "@/lib/core/permissions";
import { endOfMonth, finance, text, type Row } from "@/lib/keuangan/domain";
import { bulanLabel, kelompokHari, riwayatDompet, shiftMonth, shortAccount, tanggalPendek, validMonth } from "@/lib/keuangan/dompet";
import { loadFinance } from "@/lib/server/keuangan";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Keuangan" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const active = (r: Row) => r.aktif === true || r.aktif === "true" || r.aktif === "TRUE";
const kindOptions = (kinds: string[]) => kinds.map((k) => ({ value: k, label: KIND_LABEL[k] ?? k }));

/** Keuangan sebagai dompet: saldo di atas, tombol Uang masuk / Uang keluar / Pindah, lalu riwayat per tanggal. */
export default async function FinancePage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor();
  if (canSeeChildBills(actor)) redirect("/keuangan/tagihan");
  const data = await loadFinance(actor);
  const params = await searchParams;
  const month = validMonth(params.bulan) ?? data.month;
  const akun = typeof params.akun === "string" && data.state.Akun.some((a) => a.akun_id === params.akun) ? params.akun : "";
  const corrections = params.koreksi === "1";
  const ready = data.state.Akun.length > 0;
  const current = month === data.month;
  const end = endOfMonth(month);
  const asOf = current ? data.today : end;

  const href = (next: { bulan?: string; akun?: string; koreksi?: boolean }) => {
    const q = new URLSearchParams();
    const b = next.bulan ?? month;
    if (b !== data.month) q.set("bulan", b);
    const a = next.akun ?? akun;
    if (a) q.set("akun", a);
    if (next.koreksi ?? corrections) q.set("koreksi", "1");
    const s = q.toString();
    return s ? `/keuangan?${s}` : "/keuangan";
  };
  const hasLater = data.state.Transaksi.some((t) => text(t, "tanggal_transaksi") > end);
  const switcher = <MonthSwitch month={month} prevHref={href({ bulan: shiftMonth(month, -1) })} nextHref={month < data.month || hasLater ? href({ bulan: shiftMonth(month, 1) }) : undefined} />;

  if (!ready) {
    return (
      <div className="page kg-page">
        <KeuanganHead current="transaksi" />
        <section className="card kg-start">
          <span className="kg-start-ic">
            <KgIcon name="wallet" size="l" />
          </span>
          <div>
            <h2>Mulai pembukuan</h2>
            <p className="muted">Langkah ini membuat akun Kas tunai dan Rekening bank, serta kategori uang masuk dan uang keluar yang sudah siap masuk laporan. Saldo awal bisa diubah nanti di Lainnya.</p>
          </div>
          {data.owner ? (
            <FinanceForm aksi="finance.bootstrap" className="kg-start-form">
              <Field label="Tanggal saldo awal" name="tanggal_saldo_awal" type="date" defaultValue={`${data.month}-01`} hint="Biasanya tanggal 1 bulan mulai pembukuan." />
              <div className="form-actions">
                <SubmitButton>Siapkan akun & kategori</SubmitButton>
              </div>
            </FinanceForm>
          ) : (
            <Notice>Pemilik perlu menyiapkan akun kas dan bank terlebih dahulu.</Notice>
          )}
        </section>
      </div>
    );
  }

  const sum = finance(data.state, `${month}-01`, asOf);
  const shown = sum.accounts.filter((a) => active(a) || (a.balance ?? 0) !== 0);
  const total = shown.reduce((s, a) => s + (a.balance ?? 0), 0);
  const diff = sum.incoming - sum.outgoing;
  const rows = riwayatDompet(data.state, { month, akun, corrections, owner: data.owner, labels: KIND_LABEL });
  const days = kelompokHari(rows, data.today);
  const anyCorrections = data.state.Transaksi.some((t) => t.jenis === "PEMBALIK");
  const monthName = bulanLabel(month);

  const accounts: DompetAkun[] = data.state.Akun.filter(active).map((a) => ({
    id: text(a, "akun_id"),
    name: text(a, "nama_akun"),
    short: shortAccount(text(a, "nama_akun"), text(a, "jenis_akun")),
    jenis: text(a, "jenis_akun"),
  }));
  const categories: DompetKategori[] = data.state.Kategori.filter(active).map((k) => ({
    id: text(k, "kategori_id"),
    name: text(k, "nama_kategori"),
    kinds: text(k, "jenis_yang_diizinkan").split(","),
  }));

  const hero = (
    <section className="kg-hero" aria-label="Saldo">
      <span className="kg-ey">Total saldo · {current ? tanggalPendek(asOf) : `per ${tanggalPendek(asOf)}`}</span>
      <div className="kg-total">{rp(total)}</div>
      <div className={`kg-split${shown.length > 2 ? " many" : ""}`}>
        {shown.map((a) => (
          <div key={text(a, "akun_id")}>
            <span>
              <KgIcon name={accountIcon(text(a, "jenis_akun"))} size="s" />
              {text(a, "nama_akun")}
            </span>
            <b>{a.available ? rp(a.balance) : "Belum dibuka"}</b>
          </div>
        ))}
      </div>
      <div className="kg-month">
        <span>
          Masuk {current ? "bulan ini" : monthName} <b>+{rp(sum.incoming)}</b>
        </span>
        <span>
          Keluar <b>−{rp(sum.outgoing)}</b>
        </span>
        <span>
          Selisih{" "}
          <b>
            {diff >= 0 ? "+" : "−"}
            {rp(Math.abs(diff))}
          </b>
        </span>
      </div>
    </section>
  );

  const filters =
    accounts.length > 1 || (data.owner && anyCorrections) ? (
      <div className="kg-filters">
        {accounts.length > 1 ? (
          <nav className="kg-fchips" aria-label="Saring akun">
            <Link href={href({ akun: "" })} aria-current={!akun ? "true" : undefined}>
              Semua
            </Link>
            {accounts.map((a) => (
              <Link key={a.id} href={href({ akun: a.id })} aria-current={akun === a.id ? "true" : undefined}>
                {a.short}
              </Link>
            ))}
          </nav>
        ) : null}
        {data.owner && anyCorrections ? (
          <Link className="kg-flink" href={href({ koreksi: !corrections })}>
            {corrections ? "Sembunyikan yang dihapus" : "Lihat yang dihapus"}
          </Link>
        ) : null}
      </div>
    ) : null;

  const side = (
    <section className="card kg-side-card" aria-labelledby="kg-lainnya">
      <div className="kg-side-head">
        <h2 id="kg-lainnya">Lainnya</h2>
        <span>jarang dipakai</span>
      </div>
      <LainnyaDaftar data={data} />
    </section>
  );

  return (
    <div className="page kg-page">
      <KeuanganHead current="transaksi" aside={switcher} />
      {data.closed.includes(month) ? <Notice tone="warning">{monthName} sudah ditutup. Catatan di bulan ini tidak bisa diubah atau dihapus.</Notice> : null}
      {!data.recorder ? <Notice>Akses Anda hanya untuk melihat.</Notice> : null}
      <Dompet
        hero={hero}
        side={side}
        filters={filters}
        days={days}
        emptyTitle={akun ? "Belum ada catatan di akun ini" : "Belum ada catatan di bulan ini"}
        emptyText={data.recorder ? "Tekan Uang masuk atau Uang keluar untuk mencatat." : "Catatan uang masuk dan keluar akan tampil di sini."}
        accounts={accounts}
        categories={categories}
        students={data.recorder ? data.students : []}
        programs={FITUR.tagihan ? data.state.Program.map((p) => ({ value: text(p, "program_id"), label: text(p, "nama_program") })) : []}
        kinds={{ in: kindOptions(["PENERIMAAN_LAIN", "MODAL_MASUK", "PINJAMAN_MASUK"]), out: kindOptions(["BIAYA", "PRIVE", "POKOK_PINJAMAN_KELUAR"]) }}
        today={data.today}
        owner={data.owner}
        recorder={data.recorder}
      />
    </div>
  );
}
