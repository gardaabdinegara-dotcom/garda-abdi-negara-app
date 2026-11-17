import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { hapusTesSamapta, simpanTesSamapta, tambahPesertaSamapta, ubahStatusTesSamapta } from "@/app/actions/samapta";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { Icon } from "@/components/icon";
import { Delta, KlasStack, PosBars } from "@/components/samapta";
import { PrintMenu, RankTable, type RankCell, type RankRowData } from "@/components/samapta-client";
import { SamIcon } from "@/components/samapta-icon";
import { Badge, Empty } from "@/components/ui";
import { canManageSamapta, POS_INFO, TEST_STATUS_LABEL, type Klasifikasi } from "@/lib/core/samapta";
import { initials } from "@/lib/format";
import { loadSamaptaTest, type SamaptaEntry } from "@/lib/server/samapta";
import { requireActor } from "@/lib/server/session";
import {
  defaultPos,
  diff,
  emptyKlas,
  fmt,
  isPos,
  jam,
  jkLabel,
  longDate,
  lowestMateri,
  materiOf,
  missingPos,
  overallProgress,
  renangText,
  shortDate,
  shortTestName,
} from "../samapta-ui";

export const metadata: Metadata = { title: "Hasil Tes Samapta" };

type Search = Promise<Record<string, string | string[] | undefined>>;
type Data = Awaited<ReturnType<typeof loadSamaptaTest>>;

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

export default async function SamaptaTestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Search }) {
  const actor = await requireActor();
  if (!canManageSamapta(actor)) notFound();
  const { id } = await params;
  const sp = await searchParams;
  const data = await loadSamaptaTest(actor, decodeURIComponent(id));
  const tab = one(sp.tab);
  // Tautan lama "Isi per pos" diarahkan ke mode lapangan.
  if (tab === "pos") {
    const requested = one(sp.pos);
    redirect(`/samapta/${data.test.tes_id}/pos/${isPos(requested) ? requested : defaultPos(data.summary.progress, data.summary.peserta)}`);
  }
  if (tab === "data") return <DataPage data={data} />;
  return <ResultsPage data={data} />;
}

function countKlas(entries: readonly SamaptaEntry[]): Record<Klasifikasi, number> {
  const out = emptyKlas();
  for (const e of entries) if (e.score.klas) out[e.score.klas]++;
  return out;
}

function meanAkhir(entries: readonly SamaptaEntry[]): number | null {
  const xs = entries.map((e) => e.score.akhir).filter((v): v is number => v !== null);
  return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;
}

const CELL_LABEL: Record<string, string> = { lari: "Lari 12 mnt", situp: "Sit up", pushup: "Push up", shuttle: "Shuttle run" };

function rankRows(data: Data): RankRowData[] {
  const { test, entries, previous } = data;
  const prevById = new Map((previous?.entries ?? []).map((e) => [e.student.siswa_id, e]));
  const ranked = entries.filter((e) => e.rank !== null).sort((a, b) => a.rank! - b.rank!);
  const unranked = entries.filter((e) => e.rank === null);
  return [...ranked, ...unranked].map((e) => {
    const pe = prevById.get(e.student.siswa_id);
    const cur = materiOf(e.result, e.score.pullLabel);
    const old = pe ? materiOf(pe.result, e.score.pullLabel) : null;
    const cells: RankCell[] = cur.map((m, i) => ({
      label: CELL_LABEL[m.key] ?? m.short,
      value: m.hasil === "-" ? "Belum diisi" : `${m.hasil.replace(" detik", " dtk")} · ${fmt(m.nilai)}`,
      delta: diff(old?.[i]?.nilai, m.nilai),
    }));
    const renang = renangText(e.result);
    cells.push({ label: "Renang 50 m", value: renang ? renang.replace("Gaya ", "").replace(/^./, (c) => c.toUpperCase()) : "Belum diisi", delta: null });
    cells.push({
      label: "Tensi I · II · III",
      value: e.result.tensi.some((t) => t) ? e.result.tensi.map((t) => t || "-").join(" · ") : "Belum diisi",
      delta: null,
      note: e.score.imt !== null ? `IMT ${fmt(e.score.imt, 1)} ${e.score.imtKlas}` : undefined,
      wide: true,
    });
    const missing = missingPos(e.result);
    return {
      id: e.student.siswa_id,
      rank: e.rank,
      nama: e.student.nama,
      jk: jkLabel(e.student.jenis_kelamin),
      a: fmt(e.score.garjasA),
      b: fmt(e.score.garjasB),
      akhir: fmt(e.score.akhir),
      klas: e.score.klas,
      delta: diff(pe?.score.akhir, e.score.akhir),
      missing: missing.map((p) => POS_INFO[p].short).join(", "),
      cells,
      detailHref: `/samapta/${test.tes_id}/siswa/${e.student.siswa_id}`,
      printHref: `/cetak/samapta/${test.tes_id}?siswa=${e.student.siswa_id}`,
      firstName: e.student.nama.trim().split(/\s+/)[0] ?? "",
    };
  });
}

function TestHeader({ data, actions }: { data: Data; actions?: React.ReactNode }) {
  const { test, summary } = data;
  return (
    <header className="sam-dhead">
      <div className="sam-dhead-main">
        <Link className="sam-crumb" href="/samapta">
          <SamIcon name="left" />
          Tes Samapta
        </Link>
        <div className="sam-dtitle">
          <h1>{test.nama}</h1>
          <span className={`sam-spill is-${test.status.toLowerCase()}`}>{TEST_STATUS_LABEL[test.status]}</span>
        </div>
        <p className="sam-dmeta">
          {longDate(test.tanggal)} · {jam(test.jam_mulai)} · {test.tempat || "Tempat belum diisi"} · {summary.peserta} peserta
        </p>
      </div>
      {actions ? <div className="sam-dact">{actions}</div> : null}
    </header>
  );
}

// ---------------------------------------------------------------- Hasil

function ResultsPage({ data }: { data: Data }) {
  const { test, entries, summary, settings, previous, tests } = data;
  const base = `/samapta/${test.tes_id}`;
  const prevName = previous ? shortTestName(previous.test.nama) : null;
  const prevKlas = previous ? countKlas(previous.entries) : null;
  const dRata = diff(previous ? meanAkhir(previous.entries) : null, summary.rata);
  const p = overallProgress(summary.progress, summary.peserta);
  const incomplete = entries.filter((e) => missingPos(e.result).length > 0);
  const perlu = summary.klas.Cukup + summary.klas.Kurang;
  const bina = entries
    .filter((e) => e.score.klas === "Cukup" || e.score.klas === "Kurang")
    .sort((a, b) => a.score.akhir! - b.score.akhir!);
  const fieldHref = `${base}/pos/${defaultPos(summary.progress, summary.peserta)}?dari=hasil`;
  const students = [...entries].map((e, i) => ({ id: e.student.siswa_id, nama: e.student.nama, no: i + 1 }));

  return (
    <div className="page sam-page sam-res-page">
      <TestHeader
        data={data}
        actions={
          <>
            <Link className="btn btn-secondary" href={fieldHref}>
              <SamIcon name="field" />
              Mode lapangan
            </Link>
            <PrintMenu tesId={test.tes_id} students={students} defaultBlank={Math.min(40, Math.max(1, summary.peserta))} />
          </>
        }
      />

      <nav className="sam-tests" aria-label="Pilih tes">
        {tests.map((t) => (
          <Link key={t.tes_id} href={`/samapta/${t.tes_id}`} aria-current={t.tes_id === test.tes_id ? "page" : undefined}>
            {t.status === "SELESAI" ? <SamIcon name="lock" /> : null}
            {t.nama} · {t.status === "BERJALAN" ? "berjalan" : t.status === "DIBATALKAN" ? "dibatalkan" : shortDate(t.tanggal)}
          </Link>
        ))}
        <Link className="sam-tests-new" href="/samapta?baru=1">
          <Icon name="plus" />
          Tes baru
        </Link>
      </nav>

      <div className="sam-kpis">
        <div className="sam-kpi">
          <span>Rata-rata hasil akhir</span>
          <b>{fmt(summary.rata)}</b>
          {dRata !== null ? <Delta value={dRata} suffix={`dari ${prevName}`} /> : <em>{summary.lengkap} siswa lengkap</em>}
        </div>
        <div className="sam-kpi">
          <span>Baik Sekali</span>
          <b>
            {summary.klas["Baik Sekali"]}
            <small>siswa</small>
          </b>
          <em>{prevKlas ? `${prevName}: ${prevKlas["Baik Sekali"]} siswa` : `Akhir ≥ ${fmt(settings.baik_sekali)}`}</em>
        </div>
        <div className="sam-kpi">
          <span>Perlu pembinaan</span>
          <b>
            {perlu}
            <small>siswa</small>
          </b>
          <em>
            Cukup {summary.klas.Cukup} · Kurang {summary.klas.Kurang}
          </em>
        </div>
        <div className="sam-kpi">
          <span>Hasil akhir lengkap</span>
          <b>
            {summary.lengkap}
            <small>/ {summary.peserta}</small>
          </b>
          <em>{p.filled < p.total ? `${p.total - p.filled} isian belum, ${incomplete.length} siswa` : "Semua isian lengkap"}</em>
        </div>
      </div>

      <div className="sam-agrid">
        <RankTable rows={rankRows(data)} prevName={prevName} />
        <div className="sam-aside">
          <section className="card sam-card">
            <div>
              <h2>Sebaran klasifikasi</h2>
              <p className="sam-sub">{summary.lengkap ? `${summary.lengkap} siswa punya hasil akhir` : "Belum ada siswa yang lengkap"}</p>
            </div>
            <KlasStack klas={summary.klas} prev={prevKlas} prevName={prevName ?? undefined} />
          </section>

          <section className="card sam-card">
            <div>
              <h2>Perlu pembinaan</h2>
              <p className="sam-sub">Akhir di bawah {fmt(settings.baik)} · materi terendah</p>
            </div>
            {bina.length ? (
              <ul className="sam-bina">
                {bina.map((e) => {
                  const low = lowestMateri(e.result, e.score.pullLabel);
                  return (
                    <li key={e.student.siswa_id}>
                      <Link href={`${base}/siswa/${e.student.siswa_id}`}>
                        <span className="sam-av is-sm">{initials(e.student.nama)}</span>
                        <span className="sam-bina-main">
                          <b>{e.student.nama}</b>
                          <span>
                            <em className={e.score.klas === "Kurang" ? "is-k4" : "is-k3"}>{e.score.klas}</em>
                            {low ? ` · ${low.short} ${fmt(low.nilai)}` : ""}
                          </span>
                        </span>
                        <b className="sam-bina-n">{fmt(e.score.akhir)}</b>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted small">{summary.lengkap ? "Tidak ada siswa di Cukup atau Kurang." : "Muncul setelah ada hasil akhir."}</p>
            )}
          </section>

          <section className="card sam-card">
            <div className="sam-card-head">
              <h2>Kemajuan pos</h2>
              <span className="sam-sub">
                {p.filled}/{p.total}
              </span>
            </div>
            <PosBars tesId={test.tes_id} progress={summary.progress} peserta={summary.peserta} query="?dari=hasil" />
          </section>

          <StatusCard data={data} incomplete={incomplete.length} />
        </div>
      </div>
    </div>
  );
}

function StatusCard({ data, incomplete }: { data: Data; incomplete: number }) {
  const { test } = data;
  const selesai = test.status === "SELESAI";
  const batal = test.status === "DIBATALKAN";
  const title = selesai ? "Tes sudah selesai" : batal ? "Tes dibatalkan" : "Selesaikan tes";
  const sub = selesai
    ? "Isian dikunci. Buka lagi bila perlu koreksi."
    : batal
      ? "Tidak dihitung di beranda dan riwayat siswa. Pulihkan bila perlu."
      : "Isian dikunci. Bisa dibuka lagi kapan saja.";
  const confirm = selesai
    ? "Buka lagi tes ini? Isian bisa diubah sampai ditandai selesai lagi."
    : batal
      ? "Pulihkan tes ini? Tes kembali berjalan dan bisa diisi."
      : `Tandai tes selesai? Isian dikunci sampai dibuka lagi.${incomplete ? ` Masih ada ${incomplete} siswa yang belum lengkap.` : ""}`;
  return (
    <section className="card sam-card sam-fin" key={test.status}>
      <div>
        <h2>{title}</h2>
        <p className="sam-sub">{sub}</p>
      </div>
      <div className="sam-fin-row">
        <ActionForm action={ubahStatusTesSamapta} operationId={randomUUID()} confirm={confirm} className="sam-fin-form">
          <input type="hidden" name="tes_id" value={test.tes_id} />
          <input type="hidden" name="status" value={selesai || batal ? "BERJALAN" : "SELESAI"} />
          <SubmitButton variant="secondary" size="sm" pendingLabel="Memproses…">
            <SamIcon name={selesai || batal ? "unlock" : "lock"} />
            {selesai ? "Buka lagi" : batal ? "Pulihkan tes" : "Tandai selesai"}
          </SubmitButton>
        </ActionForm>
        <ActionForm action={hapusTesSamapta} operationId={randomUUID()} confirm={`Hapus ${test.nama}? Tes dan isiannya hilang dari aplikasi, beranda, dan riwayat siswa.`} className="sam-fin-form">
          <input type="hidden" name="tes_id" value={test.tes_id} />
          <button type="submit" className="sam-linkr">
            <SamIcon name="trash" />
            Hapus tes
          </button>
        </ActionForm>
      </div>
      <Link className="sam-fin-link" href={`/samapta/${test.tes_id}?tab=data`}>
        Ubah data tes & peserta
        <SamIcon name="right" />
      </Link>
    </section>
  );
}

// ---------------------------------------------------------------- Data tes

function DataPage({ data }: { data: Data }) {
  const { test, entries, nonParticipants } = data;
  return (
    <div className="page sam-page">
      <header className="sam-dhead">
        <div className="sam-dhead-main">
          <Link className="sam-crumb" href={`/samapta/${test.tes_id}`}>
            <SamIcon name="left" />
            Hasil {test.nama}
          </Link>
          <div className="sam-dtitle">
            <h1>Data tes</h1>
          </div>
          <p className="sam-dmeta">Nama, tanggal, jam, dan tempat tampil di blangko.</p>
        </div>
      </header>
      <div className="sam-data">
        <section className="card sam-card">
          <h2>{test.nama}</h2>
          <ActionForm action={simpanTesSamapta} operationId={randomUUID()} className="stack">
            <input type="hidden" name="tes_id" value={test.tes_id} />
            <Field label="Nama tes" name="nama" defaultValue={test.nama} maxLength={80} />
            <div className="sam-2col">
              <Field label="Tanggal" name="tanggal" type="date" defaultValue={test.tanggal} required />
              <Field label="Jam mulai" name="jam_mulai" type="time" defaultValue={test.jam_mulai} required />
            </div>
            <Field label="Tempat" name="tempat" defaultValue={test.tempat} maxLength={80} />
            <Field label="Catatan" name="catatan" type="textarea" defaultValue={test.catatan} placeholder="Opsional" />
            <div className="form-actions">
              <SubmitButton>Simpan perubahan</SubmitButton>
            </div>
          </ActionForm>
        </section>
        <section className="card sam-card">
          <div className="sam-card-head">
            <div>
              <h2>Peserta</h2>
              <p className="sam-sub">Daftar dibekukan saat tes dibuat. Siswa baru bisa ditambahkan di sini.</p>
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
            <ul className="sam-plist">
              {entries.map((e, i) => (
                <li key={e.student.siswa_id}>
                  <Link href={`/samapta/${test.tes_id}/siswa/${e.student.siswa_id}`}>
                    <span className="sam-no">{i + 1}</span>
                    <span className="sam-plist-main">
                      <b>{e.student.nama}</b>
                      <span>
                        {e.student.kode_siswa} · {jkLabel(e.student.jenis_kelamin)}
                        {e.usia !== null ? ` · ${e.usia} tahun` : ""}
                      </span>
                    </span>
                    <SamIcon name="right" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
