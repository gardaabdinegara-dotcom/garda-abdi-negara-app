import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { simpanTesSamapta } from "@/app/actions/samapta";
import { ListCard } from "@/components/dashboard";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { Icon } from "@/components/icon";
import { BodyFacts, BreakdownTable, CompareBars, HowCalculated, KlasBadge, PosChips, PrintLink, ResultCards, SamaptaStatusBadge } from "@/components/samapta";
import { Empty, Notice, PageHead } from "@/components/ui";
import { canManageSamapta, KLASIFIKASI, type SamaptaSettings } from "@/lib/core/samapta";
import type { Actor } from "@/lib/core/types";
import { formatDate } from "@/lib/format";
import { loadMySamapta, loadSamaptaOverview, type StudentHistoryItem, type TestSummary } from "@/lib/server/samapta";
import { getActor, requireActor } from "@/lib/server/session";
import { compareGroups, fmt, jam, KLAS_TONE, longDate, overallProgress, progressSentence, roman, shortDate, shortTestName } from "./samapta-ui";

type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const actor = await getActor();
  return { title: actor?.user.peran === "SISWA" ? "Hasil Samapta" : "Tes Samapta" };
}

export default async function SamaptaPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor();
  if (canManageSamapta(actor)) return <StaffOverview actor={actor} />;
  if (actor.user.peran !== "SISWA") notFound();
  const params = await searchParams;
  return <StudentView actor={actor} tes={typeof params.tes === "string" ? params.tes : undefined} />;
}

// ---------------------------------------------------------------- Owner / staf

async function StaffOverview({ actor }: { actor: Actor }) {
  const data = await loadSamaptaOverview(actor);
  const latest = data.tests[0];
  const blankDefault = latest ? Math.min(40, Math.max(1, latest.peserta)) : 1;
  return (
    <div className="page">
      <PageHead
        eyebrow="Kesamaptaan jasmani"
        title="Tes Samapta"
        description="Garjas A (lari 12 menit), Garjas B (pull up/chinning, sit up, push up, shuttle run), renang, tensi, serta tinggi dan berat badan. Diisi per pos dari HP di lapangan, lalu dicetak di blangko A4."
        actions={
          <>
            <BlankPrintForm defaultCount={blankDefault} />
            <a className="btn" href="#buat-sesi">
              <Icon name="plus" />
              Buat sesi tes
            </a>
          </>
        }
      />
      <div className="grid-main">
        <div className="stack sam-col">
          {data.tests.length === 0 ? (
            <section className="card">
              <Empty title="Belum ada sesi tes">
                Mulai dari form Buat sesi tes: isi tanggal, jam, dan tempat. Semua siswa aktif langsung jadi peserta, lalu tiap pos bisa diisi dari HP.
              </Empty>
            </section>
          ) : (
            data.tests.map((summary, i) => <TestCard key={summary.test.tes_id} summary={summary} latest={i === 0} />)
          )}
        </div>
        <div className="stack sam-col">
          <CreateTestCard count={data.tests.length} today={data.today} settings={data.settings} />
          <ListCard
            title="Alur satu sesi tes"
            sub="Dari membuat sesi sampai blangko tercetak."
            empty=""
            items={[
              { key: "1", icon: "calendar", tone: "green", title: "1. Buat sesi tes", sub: "Tanggal, jam, dan tempat. Peserta otomatis semua siswa aktif." },
              { key: "2", icon: "run", tone: "gold", title: "2. Isi per pos dari HP", sub: "Pilih pos, lalu isi siswa satu per satu. Tiap baris tersimpan sendiri." },
              { key: "3", icon: "chart", tone: "blue", title: "3. Dihitung otomatis", sub: "Rata-rata B, hasil akhir (A + B) ÷ 2, klasifikasi, dan IMT." },
              { key: "4", icon: "print", tone: "violet", title: "4. Cetak blangko A4", sub: "Satu siswa, semua peserta sekaligus, atau blangko kosong." },
            ]}
          />
          <Notice>Nilai tiap materi diisi manual dulu. Setelah tabel nilai resmi tersedia, nilai terisi otomatis dari hasil tes.</Notice>
        </div>
      </div>
    </div>
  );
}

function BlankPrintForm({ defaultCount }: { defaultCount: number }) {
  const counts = Array.from(new Set([1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 35, 40, defaultCount])).sort((a, b) => a - b);
  return (
    <form method="get" action="/cetak/samapta/kosong" className="sam-blank" aria-label="Cetak blangko kosong">
      <label className="sr-only" htmlFor="jumlah-blangko">
        Jumlah lembar blangko kosong
      </label>
      <select id="jumlah-blangko" name="jumlah" defaultValue={String(defaultCount)}>
        {counts.map((n) => (
          <option key={n} value={n}>
            {n} lembar
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-secondary">
        <Icon name="print" />
        Cetak blangko kosong
      </button>
    </form>
  );
}

function TestCard({ summary, latest }: { summary: TestSummary; latest: boolean }) {
  const { test, peserta, progress, lengkap, rata, klas } = summary;
  const p = overallProgress(progress, peserta);
  const selesai = test.status === "SELESAI";
  const href = `/samapta/${test.tes_id}`;
  const belumRenang = peserta - progress.renang;
  return (
    <section className={`card sam-test${latest ? " is-latest" : ""}`}>
      <div className="sam-test-top">
        <div className="sam-test-title">
          <div className="row sam-gap6">
            <SamaptaStatusBadge status={test.status} />
            <b>{test.nama}</b>
          </div>
          <h2>
            <Link href={href} className="cell-title">
              {longDate(test.tanggal)} · {jam(test.jam_mulai)}
            </Link>
          </h2>
          <p className="muted small">
            {test.tempat || "Tempat belum diisi"} · {peserta} peserta
            {test.catatan ? ` · ${test.catatan}` : ""}
          </p>
        </div>
        <div className="row sam-test-act">
          <Link className={selesai ? "btn" : "btn btn-secondary"} href={`${href}?tab=hasil`}>
            <Icon name="chart" />
            Hasil & cetak
          </Link>
          <Link className={selesai ? "btn btn-secondary" : "btn"} href={`${href}?tab=pos`}>
            <Icon name="run" />
            Isi per pos
          </Link>
        </div>
      </div>
      <div className="sam-prog">
        <meter className="capacity" min={0} max={Math.max(p.total, 1)} value={p.filled} aria-label={`Kemajuan isian ${test.nama}`} />
        <span className="small muted">
          {fmt(p.persen, 0)}% terisi · {p.filled} dari {p.total} isian
          {p.filled < p.total && belumRenang > 0 ? ` · ${belumRenang} siswa belum renang` : ""}
        </span>
      </div>
      <PosChips tesId={test.tes_id} progress={progress} peserta={peserta} label={`Kemajuan pos ${test.nama}`} />
      {lengkap ? (
        <div className="sam-klas-row" aria-label={`Ringkasan hasil ${test.nama}`}>
          <span className="sam-chip is-static">
            <span>Rata-rata akhir</span>
            <b>{fmt(rata)}</b>
          </span>
          {KLASIFIKASI.map((k) => (
            <span key={k} className={`sam-chip is-static is-${KLAS_TONE[k]}`}>
              <span>{k}</span>
              <b>{klas[k]}</b>
            </span>
          ))}
        </div>
      ) : (
        <p className="muted small">Rata-rata dan klasifikasi muncul setelah ada siswa yang lengkap Garjas A dan B.</p>
      )}
    </section>
  );
}

function CreateTestCard({ count, today, settings }: { count: number; today: string; settings: SamaptaSettings }) {
  return (
    <section className="card sam-anchor" id="buat-sesi">
      <div className="card-head">
        <div>
          <h2>Buat sesi tes</h2>
          <p>Satu sesi untuk satu hari tes.</p>
        </div>
      </div>
      <ActionForm action={simpanTesSamapta} operationId={randomUUID()} className="stack">
        <div className="form-grid two">
          <Field label="Nama sesi" name="nama" defaultValue={`Tes Samapta ${roman(count + 1)}`} maxLength={80} className="span-all" />
          <Field label="Tanggal" name="tanggal" type="date" defaultValue={today} required />
          <Field label="Jam mulai" name="jam_mulai" type="time" defaultValue="07:00" required />
          <Field label="Tempat" name="tempat" defaultValue={settings.tempat} maxLength={80} hint="Bawaan dari Pengaturan, bisa diubah." className="span-all" />
          <Field label="Catatan" name="catatan" type="textarea" placeholder="Opsional" className="span-all" />
        </div>
        <p className="muted small">Semua siswa aktif otomatis jadi peserta.</p>
        <div className="form-actions">
          <SubmitButton pendingLabel="Membuat…">
            <Icon name="plus" />
            Buat sesi tes
          </SubmitButton>
        </div>
      </ActionForm>
    </section>
  );
}

// ---------------------------------------------------------------- Siswa

async function StudentView({ actor, tes }: { actor: Actor; tes?: string }) {
  const data = await loadMySamapta(actor);
  if (!data || data.history.length === 0) {
    return (
      <div className="page">
        <PageHead eyebrow="Kesamaptaan jasmani" title="Hasil Samapta" description="Hasil tes kesamaptaan jasmani kamu: Garjas A, Garjas B, renang, tensi, serta tinggi dan berat badan." />
        <section className="card">
          {data ? (
            <Empty title="Belum ada hasil tes">Hasil muncul di sini setelah kamu mengikuti tes samapta pertama.</Empty>
          ) : (
            <Empty title="Akun belum tertaut">Minta admin menautkan akun ini ke data siswa kamu.</Empty>
          )}
        </section>
      </div>
    );
  }
  const { history, settings, student } = data;
  const found = history.findIndex((h) => h.test.tes_id === tes);
  const index = found >= 0 ? found : history.length - 1;
  const item = history[index]!;
  const prev = index > 0 ? history[index - 1]! : null;
  const { test, entry, peserta } = item;
  const label = (h: StudentHistoryItem) => `${shortTestName(h.test.nama)} · ${shortDate(h.test.tanggal)}`;

  return (
    <div className="page">
      <PageHead
        eyebrow={`${test.nama} · ${formatDate(test.tanggal, "long")}`}
        title="Hasil Samapta"
        description="Hasil tes kesamaptaan jasmani kamu, dibanding tes sebelumnya. Blangko bisa dicetak untuk arsip."
        actions={
          <PrintLink variant="primary" href={`/cetak/samapta/${test.tes_id}?siswa=${student.siswa_id}`}>
            Cetak blangko saya
          </PrintLink>
        }
      />
      {history.length > 1 ? (
        <nav className="sam-seg" aria-label="Pilih tes">
          {[...history].reverse().map((h, i) => (
            <Link key={h.test.tes_id} href={`/samapta?tes=${h.test.tes_id}`} aria-current={h.test.tes_id === test.tes_id ? "page" : undefined}>
              {label(h)}
              {i === 0 ? " (terbaru)" : ""}
            </Link>
          ))}
        </nav>
      ) : null}
      {test.status === "BERJALAN" ? <Notice>Tes ini masih berjalan. Nilai bisa berubah sampai pelatih menandai tes selesai.</Notice> : null}
      <ResultCards entry={entry} rank={{ rank: entry.rank, total: peserta }} />
      <div className="grid-main">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Rincian nilai</h2>
              <p>
                {test.nama} · {test.tempat || "-"}
              </p>
            </div>
          </div>
          <BreakdownTable entry={entry} />
        </section>
        <div className="stack sam-col">
          <section className="card">
            <div className="card-head">
              <h2>Badan & tensi</h2>
            </div>
            <BodyFacts entry={entry} />
          </section>
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Riwayat tes</h2>
                <p>Ketuk untuk melihat hasil tes itu.</p>
              </div>
            </div>
            <div className="item-list">
              {[...history].reverse().map((h) => (
                <div className="item" key={h.test.tes_id}>
                  <div className="item-main">
                    <Link className="cell-title" href={`/samapta?tes=${h.test.tes_id}`} aria-current={h.test.tes_id === test.tes_id ? "page" : undefined}>
                      {h.test.nama}
                    </Link>
                    <span className="cell-sub">
                      {formatDate(h.test.tanggal)} · Hasil akhir {fmt(h.entry.score.akhir)}
                      {h.test.tes_id === test.tes_id ? " · sedang dilihat" : ""}
                    </span>
                  </div>
                  <KlasBadge klas={h.entry.score.klas} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Perkembangan</h2>
              <p>{prev ? `Nilai tiap materi, ${shortTestName(prev.test.nama)} dibanding ${shortTestName(test.nama)}.` : "Perbandingan dengan tes sebelumnya."}</p>
            </div>
          </div>
          {prev ? (
            <>
              <CompareBars title="Nilai per materi" groups={compareGroups(prev.entry, entry)} labelA={label(prev)} labelB={label(item)} />
              <p className="sam-sentence">{progressSentence(prev.entry, entry)}</p>
            </>
          ) : (
            <p className="muted">Grafik perkembangan muncul setelah kamu mengikuti dua tes.</p>
          )}
        </section>
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Cara nilai dihitung</h2>
              <p>
                {entry.score.akhir !== null
                  ? `Hasil akhir kamu ${fmt(entry.score.akhir)}, masuk ${entry.score.klas}.`
                  : "Hasil akhir muncul setelah semua materi Garjas A dan B terisi."}
              </p>
            </div>
          </div>
          <HowCalculated entry={entry} settings={settings} />
        </section>
      </div>
    </div>
  );
}
