import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { simpanTesSamapta, tambahPesertaSamapta, ubahStatusTesSamapta } from "@/app/actions/samapta";
import { Kpi } from "@/components/dashboard";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { Icon } from "@/components/icon";
import { CompareBars, KlasBadge, KlasDonut, PosChips, PrintLink, SamaptaStatusBadge } from "@/components/samapta";
import { PosEntry, type PosRowData } from "@/components/samapta-client";
import { Badge, Empty, Notice, PageHead, Tabs } from "@/components/ui";
import { canManageSamapta, POS, POS_INFO, posFilled, type Klasifikasi, type Pos } from "@/lib/core/samapta";
import { loadSamaptaTest, type SamaptaEntry } from "@/lib/server/samapta";
import { requireActor } from "@/lib/server/session";
import {
  averageGroups,
  defaultPos,
  emptyKlas,
  fmt,
  isPos,
  jam,
  jkLabel,
  KLAS_TONE,
  longDate,
  missingPos,
  posInputValues,
  shortDate,
  shortName,
  shortTestName,
} from "../samapta-ui";

export const metadata: Metadata = { title: "Sesi Tes Samapta" };

type Search = Promise<Record<string, string | string[] | undefined>>;
type Data = Awaited<ReturnType<typeof loadSamaptaTest>>;
type Tab = "pos" | "hasil" | "data";

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

export default async function SamaptaTestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Search }) {
  const actor = await requireActor();
  if (!canManageSamapta(actor)) notFound();
  const { id } = await params;
  const sp = await searchParams;
  const data = await loadSamaptaTest(actor, decodeURIComponent(id));
  const { test, summary } = data;
  const requested = one(sp.tab);
  const tab: Tab = requested === "pos" || requested === "hasil" || requested === "data" ? requested : test.status === "SELESAI" ? "hasil" : "pos";
  const base = `/samapta/${test.tes_id}`;
  const incomplete = data.entries.filter((e) => missingPos(e.result).length > 0).length;

  return (
    <div className="page">
      <PageHead
        back={{ href: "/samapta", label: "Tes Samapta" }}
        eyebrow={`${longDate(test.tanggal)} · ${jam(test.jam_mulai)}`}
        title={test.nama}
        description={
          <span className="sam-head-meta">
            <SamaptaStatusBadge status={test.status} />
            {test.tempat || "Tempat belum diisi"} · {summary.peserta} peserta
          </span>
        }
        actions={
          <>
            {summary.peserta > 0 ? <PrintLink href={`/cetak/samapta/${test.tes_id}?siswa=semua`}>Cetak semua blangko ({summary.peserta})</PrintLink> : null}
            {test.status === "DIBATALKAN" ? (
              <ActionForm action={ubahStatusTesSamapta} operationId={randomUUID()} confirm="Pulihkan tes ini? Tes kembali berjalan dan bisa diisi." className="sam-status-form">
                <input type="hidden" name="tes_id" value={test.tes_id} />
                <input type="hidden" name="status" value="BERJALAN" />
                <SubmitButton variant="secondary" pendingLabel="Memproses…">
                  Pulihkan tes
                </SubmitButton>
              </ActionForm>
            ) : (
              <StatusToggle key={test.status} tesId={test.tes_id} selesai={test.status === "SELESAI"} incomplete={incomplete} />
            )}
          </>
        }
      />
      <Tabs
        label="Bagian tes"
        current={tab}
        items={[
          { key: "pos", href: `${base}?tab=pos`, label: "Isi per pos" },
          { key: "hasil", href: `${base}?tab=hasil`, label: "Hasil" },
          { key: "data", href: `${base}?tab=data`, label: "Data tes" },
        ]}
      />
      {tab === "pos" ? <PosTab data={data} pos={one(sp.pos)} belum={one(sp.belum) === "1"} /> : tab === "hasil" ? <HasilTab data={data} /> : <DataTab data={data} />}
    </div>
  );
}

function StatusToggle({ tesId, selesai, incomplete }: { tesId: string; selesai: boolean; incomplete: number }) {
  const confirm = selesai
    ? "Buka lagi tes ini? Isian bisa diubah sampai ditandai selesai lagi."
    : `Tandai tes selesai? Isian dikunci sampai dibuka lagi.${incomplete ? ` Masih ada ${incomplete} siswa yang belum lengkap.` : ""}`;
  return (
    <ActionForm action={ubahStatusTesSamapta} operationId={randomUUID()} confirm={confirm} className="sam-status-form">
      <input type="hidden" name="tes_id" value={tesId} />
      <input type="hidden" name="status" value={selesai ? "BERJALAN" : "SELESAI"} />
      <SubmitButton variant={selesai ? "secondary" : "primary"} pendingLabel="Memproses…">
        <Icon name={selesai ? "clipboard" : "check"} />
        {selesai ? "Buka lagi" : "Tandai selesai"}
      </SubmitButton>
    </ActionForm>
  );
}

// ---------------------------------------------------------------- Isi per pos

const EXTRA_TIP: Partial<Record<Pos, string>> = {
  tensi: " Boleh ketik 120.80, otomatis jadi 120/80.",
  renang: " Boleh ketik 1.05 untuk 1 menit 5 detik.",
  lari: " Nilai lari menjadi Garjas A.",
};

function PosTab({ data, pos: requested, belum }: { data: Data; pos?: string; belum: boolean }) {
  const { test, entries, summary } = data;
  const pos: Pos = isPos(requested) ? requested : defaultPos(summary.progress, summary.peserta);
  const locked = test.status !== "BERJALAN";
  const info = POS_INFO[pos];
  const filled = summary.progress[pos];
  const left = summary.peserta - filled;
  const next = POS[POS.indexOf(pos) + 1];
  const posHref = (p: Pos, b = belum) => `/samapta/${test.tes_id}?tab=pos&pos=${p}${b ? "&belum=1" : ""}`;
  const rows: PosRowData[] = entries.map((e) => ({
    siswa_id: e.student.siswa_id,
    nama: e.student.nama,
    kode: e.student.kode_siswa,
    jk: e.student.jenis_kelamin,
    done: posFilled(e.result, pos),
    values: posInputValues(e.result, pos),
    opId: randomUUID(),
  }));

  return (
    <>
      <section className="card sam-pos-head">
        <div className="card-head">
          <div>
            <h2>{info.label}</h2>
            <p>
              {test.nama} · {shortDate(test.tanggal)} · {test.tempat || "-"}
            </p>
          </div>
          {belum ? (
            <Link className="btn btn-secondary btn-sm" href={posHref(pos, false)}>
              Tampilkan semua
            </Link>
          ) : left > 0 ? (
            <Link className="btn btn-secondary btn-sm" href={posHref(pos, true)}>
              Hanya yang belum ({left})
            </Link>
          ) : (
            <Badge tone="success">Semua terisi</Badge>
          )}
        </div>
        <PosChips tesId={test.tes_id} progress={summary.progress} peserta={summary.peserta} current={pos} belum={belum} />
        <div className="sam-tip">
          <Icon name="clipboard" />
          <div>
            <p>
              {info.tip}
              {EXTRA_TIP[pos] ?? ""}
            </p>
            <p className="sam-tip-2">Tekan Enter di kolom terakhir untuk menyimpan dan pindah ke siswa berikutnya. Baris juga tersimpan saat Anda pindah ke baris lain.</p>
          </div>
        </div>
      </section>
      {locked ? <Notice tone="warning">Tes sudah ditandai selesai, jadi isian dikunci. Tekan Buka lagi di atas bila perlu koreksi.</Notice> : null}
      <PosEntry key={`${pos}-${belum ? "belum" : "semua"}`} tesId={test.tes_id} pos={pos} rows={rows} belum={belum} locked={locked} />
      <div className="sam-foot">
        <span className="sam-foot-n">
          <b>{filled}</b> dari {summary.peserta} lengkap
        </span>
        {next ? (
          <Link className="btn" href={posHref(next)}>
            Pos berikutnya: {POS_INFO[next].short}
            <Icon name="arrow" />
          </Link>
        ) : (
          <Link className="btn" href={`/samapta/${test.tes_id}?tab=hasil`}>
            Lihat hasil
            <Icon name="arrow" />
          </Link>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Hasil

function countKlas(entries: readonly SamaptaEntry[]): Record<Klasifikasi, number> {
  const out = emptyKlas();
  for (const e of entries) if (e.score.klas) out[e.score.klas]++;
  return out;
}

function HasilTab({ data }: { data: Data }) {
  const { test, entries, summary, settings, previous } = data;
  const base = `/samapta/${test.tes_id}`;
  const locked = test.status !== "BERJALAN";
  const ranked = entries.filter((e) => e.rank !== null).sort((a, b) => a.rank! - b.rank!);
  const unranked = entries.filter((e) => e.rank === null);
  const incomplete = entries.filter((e) => missingPos(e.result).length > 0);
  const bina = ranked.filter((e) => e.score.klas === "Cukup" || e.score.klas === "Kurang").reverse();
  const firstMissing = POS.find((p) => incomplete.some((e) => !posFilled(e.result, p)));

  let compare: React.ReactNode = <p className="muted">Grafik perbandingan muncul setelah ada tes sebelumnya.</p>;
  if (previous) {
    const groups = averageGroups(previous.entries, entries);
    const akhir = groups[groups.length - 1]!;
    const pk = countKlas(previous.entries);
    const ck = summary.klas;
    const delta = akhir.a !== null && akhir.b !== null ? Math.round((akhir.b - akhir.a) * 100) / 100 : null;
    const perluA = pk.Cukup + pk.Kurang;
    const perluB = ck.Cukup + ck.Kurang;
    compare = (
      <>
        <CompareBars
          title="Rata-rata nilai per materi"
          groups={groups}
          labelA={`${shortTestName(previous.test.nama)} · ${shortDate(previous.test.tanggal)}`}
          labelB={`${shortTestName(test.nama)} · ${shortDate(test.tanggal)}`}
        />
        <p className="sam-sentence">
          Baik Sekali dari {pk["Baik Sekali"]} menjadi {ck["Baik Sekali"]} siswa.
          {perluA || perluB ? ` Perlu pembinaan (Cukup + Kurang) dari ${perluA} menjadi ${perluB} siswa.` : " Tidak ada yang perlu pembinaan di kedua tes."}
          {delta !== null ? ` Rata-rata hasil akhir ${delta > 0 ? `naik ${fmt(delta)} poin` : delta < 0 ? `turun ${fmt(-delta)} poin` : "tetap"}.` : ""}
        </p>
      </>
    );
  }

  return (
    <>
      <div className="kpi-grid">
        <Kpi icon="chart" tone="green" value={fmt(summary.rata)} label={`Rata-rata hasil akhir · ${summary.lengkap} siswa`} />
        <Kpi icon="trophy" tone="gold" value={String(summary.klas["Baik Sekali"])} unit="siswa" label={`Baik Sekali (≥ ${fmt(settings.baik_sekali)})`} />
        <Kpi icon="heart" tone="red" value={String(summary.klas.Cukup + summary.klas.Kurang)} unit="siswa" label="Perlu pembinaan (Cukup + Kurang)" />
        <Kpi
          icon="clipboard"
          tone="blue"
          value={String(incomplete.length)}
          unit="siswa"
          label="Belum lengkap"
          href={incomplete.length && !locked && firstMissing ? `${base}?tab=pos&pos=${firstMissing}&belum=1` : undefined}
        />
      </div>

      {incomplete.length ? (
        <div className="notice notice-warning sam-note-act">
          <span>
            {incomplete.length} siswa belum lengkap:{" "}
            {incomplete.map((e, i) => (
              <span key={e.student.siswa_id}>
                {i ? "; " : ""}
                <b>{shortName(e.student.nama)}</b> ({e.student.kode_siswa}) kurang {missingPos(e.result).map((p) => POS_INFO[p].short).join(", ")}
              </span>
            ))}
            .{" "}
            {incomplete.every((e) => e.rank !== null)
              ? "Yang kurang hanya pos tanpa nilai, jadi hasil akhir dan peringkat tetap terhitung."
              : "Hasil akhir muncul setelah semua materi Garjas A dan B terisi."}
          </span>
          {!locked && firstMissing ? (
            <Link className="btn btn-secondary btn-sm" href={`${base}?tab=pos&pos=${firstMissing}&belum=1`}>
              Isi sekarang
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Sebaran klasifikasi</h2>
              <p>
                {summary.lengkap} dari {summary.peserta} siswa sudah punya hasil akhir. Batas diatur di Pengaturan.
              </p>
            </div>
          </div>
          <KlasDonut klas={summary.klas} settings={settings} />
          {bina.length ? (
            <div className="sam-bina">
              <p className="small">
                <b>Perlu pembinaan ({bina.length})</b>, dari nilai terendah:
              </p>
              <div className="sam-klas-row">
                {bina.map((e) => (
                  <Link key={e.student.siswa_id} className={`sam-chip is-${KLAS_TONE[e.score.klas!]}`} href={`${base}/siswa/${e.student.siswa_id}`} title={`${e.student.nama} (${e.student.kode_siswa})`}>
                    <span>{shortName(e.student.nama)}</span>
                    <b>{fmt(e.score.akhir)}</b>
                  </Link>
                ))}
              </div>
            </div>
          ) : summary.lengkap ? (
            <p className="muted small">Tidak ada siswa di klasifikasi Cukup atau Kurang.</p>
          ) : null}
        </section>
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Rata-rata nilai per materi</h2>
              <p>{previous ? `${shortTestName(previous.test.nama)} dibanding ${shortTestName(test.nama)}, seluruh peserta.` : "Dibanding tes sebelumnya."}</p>
            </div>
          </div>
          {compare}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Peringkat hasil akhir</h2>
            <p>Urut dari nilai tertinggi. Siswa yang belum lengkap di bagian bawah.</p>
          </div>
        </div>
        {entries.length === 0 ? (
          <Empty title="Belum ada peserta" />
        ) : (
          <div className="table-wrap sam-rank-wrap">
            <table className="data sam-rank">
              <thead>
                <tr>
                  <th>Peringkat</th>
                  <th>Kode</th>
                  <th>Nama</th>
                  <th className="num">Garjas A</th>
                  <th className="num">Garjas B</th>
                  <th className="num">(A+B)/2</th>
                  <th>Klasifikasi</th>
                  <th>
                    <span className="sr-only">Tautan</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...ranked, ...unranked].map((e) => (
                  <RankRow key={e.student.siswa_id} entry={e} tesId={test.tes_id} locked={locked} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function RankRow({ entry: e, tesId, locked }: { entry: SamaptaEntry; tesId: string; locked: boolean }) {
  const missing = missingPos(e.result);
  const base = `/samapta/${tesId}`;
  const detail = `${base}/siswa/${e.student.siswa_id}`;
  return (
    <tr className={e.rank === null ? "is-incomplete" : undefined}>
      <td data-label="Peringkat">
        <span className={`sam-rk${e.rank !== null && e.rank <= 3 ? " is-top" : ""}`}>{e.rank ?? "-"}</span>
      </td>
      <td data-label="Kode" className="mono small">
        {e.student.kode_siswa}
      </td>
      <td data-label="Nama">
        <Link className="cell-title" href={detail}>
          {e.student.nama}
        </Link>
        <span className="cell-sub">
          <span className="sam-phone-only">{e.student.kode_siswa} · </span>
          {jkLabel(e.student.jenis_kelamin)}
          {missing.length ? ` · belum ${missing.map((p) => POS_INFO[p].short).join(", ")}` : ""}
        </span>
      </td>
      <td data-label="Garjas A" className="num">
        {fmt(e.score.garjasA)}
      </td>
      <td data-label="Garjas B" className="num">
        {fmt(e.score.garjasB)}
      </td>
      <td data-label="(A+B)/2" className="num">
        <b>{fmt(e.score.akhir)}</b>
      </td>
      <td data-label="Klasifikasi" className="sam-rank-klas">
        <KlasBadge klas={e.score.klas} />
      </td>
      <td className="sam-rank-act">
        <div className="sam-rank-links">
          {e.rank === null && !locked && missing[0] ? (
            <Link className="btn btn-ghost btn-sm" href={`${base}?tab=pos&pos=${missing[0]}`}>
              Isi {POS_INFO[missing[0]].short}
            </Link>
          ) : null}
          <Link className="btn btn-secondary btn-sm" href={detail}>
            Detail
          </Link>
          <a className="btn btn-ghost btn-sm" href={`/cetak/samapta/${tesId}?siswa=${e.student.siswa_id}`}>
            <Icon name="print" />
            Blangko
          </a>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------- Data tes

function DataTab({ data }: { data: Data }) {
  const { test, entries, nonParticipants } = data;
  return (
    <div className="grid-main">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Data tes</h2>
            <p>Nama, tanggal, jam, dan tempat tampil di blangko.</p>
          </div>
        </div>
        <ActionForm action={simpanTesSamapta} operationId={randomUUID()} className="stack">
          <input type="hidden" name="tes_id" value={test.tes_id} />
          <div className="form-grid two">
            <Field label="Nama sesi" name="nama" defaultValue={test.nama} maxLength={80} className="span-all" />
            <Field label="Tanggal" name="tanggal" type="date" defaultValue={test.tanggal} required />
            <Field label="Jam mulai" name="jam_mulai" type="time" defaultValue={test.jam_mulai} required />
            <Field label="Tempat" name="tempat" defaultValue={test.tempat} maxLength={80} className="span-all" />
            <Field label="Catatan" name="catatan" type="textarea" defaultValue={test.catatan} placeholder="Opsional" className="span-all" />
          </div>
          <div className="form-actions">
            <SubmitButton>Simpan perubahan</SubmitButton>
          </div>
        </ActionForm>
      </section>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Peserta</h2>
            <p>Daftar dibekukan saat tes dibuat. Siswa baru bisa ditambahkan di sini.</p>
          </div>
          <Badge>{entries.length} siswa</Badge>
        </div>
        {nonParticipants.length ? (
          <ActionForm action={tambahPesertaSamapta} operationId={randomUUID()} className="stack">
            <input type="hidden" name="tes_id" value={test.tes_id} />
            <Field
              label="Tambah siswa aktif"
              name="siswa_id"
              type="select"
              options={nonParticipants.map((s) => ({ value: s.siswa_id, label: `${s.nama} (${s.kode_siswa})` }))}
            />
            <div className="form-actions">
              <SubmitButton size="sm" pendingLabel="Menambahkan…">
                <Icon name="plus" />
                Tambah peserta
              </SubmitButton>
            </div>
          </ActionForm>
        ) : (
          <p className="muted small">Semua siswa aktif sudah jadi peserta.</p>
        )}
        {entries.length === 0 ? (
          <Empty title="Belum ada peserta" />
        ) : (
          <div className="item-list">
            {entries.map((e) => (
              <div className="item" key={e.student.siswa_id}>
                <div className="item-main">
                  <b>{e.student.nama}</b>
                  <span className="cell-sub">
                    {e.student.kode_siswa} · {jkLabel(e.student.jenis_kelamin)}
                    {e.usia !== null ? ` · ${e.usia} tahun` : ""}
                  </span>
                </div>
                <Link className="btn btn-ghost btn-sm" href={`/samapta/${test.tes_id}/siswa/${e.student.siswa_id}`}>
                  Detail
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
      {test.status !== "DIBATALKAN" ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Batalkan tes</h2>
              <p>Untuk sesi tes yang keliru dibuat. Tes batal tidak dihitung di beranda dan riwayat siswa; isiannya tetap tersimpan dan bisa dipulihkan.</p>
            </div>
          </div>
          <ActionForm action={ubahStatusTesSamapta} operationId={randomUUID()} confirm={`Batalkan ${test.nama}?`} className="stack">
            <input type="hidden" name="tes_id" value={test.tes_id} />
            <input type="hidden" name="status" value="DIBATALKAN" />
            <div className="form-actions">
              <SubmitButton variant="danger" pendingLabel="Membatalkan…">
                Batalkan tes
              </SubmitButton>
            </div>
          </ActionForm>
        </section>
      ) : null}
    </div>
  );
}
