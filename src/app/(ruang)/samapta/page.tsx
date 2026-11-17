import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { Icon } from "@/components/icon";
import { HowCalculated, ResultHero, RincianList, StationTiles } from "@/components/samapta";
import { CreateTestSheet } from "@/components/samapta-client";
import { SamIcon } from "@/components/samapta-icon";
import { Empty } from "@/components/ui";
import { canManageSamapta, POS } from "@/lib/core/samapta";
import type { Actor } from "@/lib/core/types";
import { loadMySamapta, loadSamaptaOverview, type TestSummary } from "@/lib/server/samapta";
import { getActor, requireActor } from "@/lib/server/session";
import { dayDate, defaultPos, fmt, jam, mediumDate, monthShort, overallProgress, POS_TILE, roman, shortDate, shortTestName } from "./samapta-ui";

type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const actor = await getActor();
  return { title: actor?.user.peran === "SISWA" ? "Hasil Samapta" : "Tes Samapta" };
}

export default async function SamaptaPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor();
  const params = await searchParams;
  if (canManageSamapta(actor)) return <StaffOverview actor={actor} openCreate={params.baru === "1"} />;
  if (actor.user.peran !== "SISWA") notFound();
  return <StudentView actor={actor} tes={typeof params.tes === "string" ? params.tes : undefined} />;
}

// ---------------------------------------------------------------- Owner / staf

async function StaffOverview({ actor, openCreate }: { actor: Actor; openCreate: boolean }) {
  const data = await loadSamaptaOverview(actor);
  const running = data.tests.find((s) => s.test.status === "BERJALAN");
  const others = data.tests.filter((s) => s !== running);
  const latest = data.tests[0];
  const blankDefault = latest ? Math.min(40, Math.max(1, latest.peserta)) : 10;
  const create = (
    <CreateTestSheet
      operationId={randomUUID()}
      defaultName={`Tes Samapta ${roman(data.tests.length + 1)}`}
      today={data.today}
      tempat={data.settings.tempat}
      startOpen={openCreate}
      className="btn btn-secondary sam-hb"
    />
  );

  return (
    <div className="page sam-page">
      <header className="sam-top">
        <div>
          <h1>Tes Samapta</h1>
          <p>Isi nilai per pos dari HP, lalu lihat hasil dan cetak blangko.</p>
        </div>
        <div className="sam-top-act">{create}</div>
      </header>

      <div className="sam-home">
        <div className="sam-home-main">
          {running ? (
            <RunningTest summary={running} />
          ) : (
            <section className="card sam-card">
              <Empty title={data.tests.length ? "Tidak ada tes yang berjalan" : "Belum ada tes"}>
                Buat tes baru untuk mulai mengisi nilai di lapangan. Semua siswa aktif otomatis jadi peserta.
              </Empty>
            </section>
          )}
        </div>

        <div className="sam-home-side">
          {running ? (
            <Link className="sam-lnk" href={`/samapta/${running.test.tes_id}`}>
              <span className="sam-lnk-ic is-g">
                <SamIcon name="table" />
              </span>
              <span className="sam-lnk-main">
                <b>{running.lengkap ? "Hasil sementara" : "Hasil & peringkat"}</b>
                <span>
                  {running.lengkap
                    ? `Rata-rata ${fmt(running.rata)} · ${running.lengkap} dari ${running.peserta} siswa`
                    : "Muncul setelah ada siswa yang lengkap"}
                </span>
              </span>
              <SamIcon name="right" />
            </Link>
          ) : null}
          {others.map((s) => (
            <Link key={s.test.tes_id} className="sam-lnk" href={`/samapta/${s.test.tes_id}`}>
              <span className="sam-lnk-ic">
                <SamIcon name={s.test.status === "SELESAI" ? "lock" : s.test.status === "DIBATALKAN" ? "close" : "field"} />
              </span>
              <span className="sam-lnk-main">
                <b>{s.test.nama}</b>
                <span>
                  {shortDate(s.test.tanggal)} · {s.test.status === "SELESAI" ? "selesai" : s.test.status === "DIBATALKAN" ? "dibatalkan" : "berjalan"}
                  {s.rata !== null ? ` · rata-rata ${fmt(s.rata)}` : ""}
                </span>
              </span>
              <SamIcon name="right" />
            </Link>
          ))}
          <form method="get" action="/cetak/samapta/kosong" className="sam-blank">
            <span className="sam-lnk-ic">
              <Icon name="print" />
            </span>
            <span className="sam-lnk-main">
              <b>Cetak blangko kosong</b>
              <span>Untuk diisi tangan di lapangan</span>
            </span>
            <label className="sr-only" htmlFor="jumlah-blangko">
              Jumlah lembar
            </label>
            <select id="jumlah-blangko" name="jumlah" defaultValue={String(blankDefault)}>
              {Array.from(new Set([1, 5, 10, 15, 20, 25, 30, 35, 40, blankDefault]))
                .sort((a, b) => a - b)
                .map((n) => (
                  <option key={n} value={n}>
                    {n} lbr
                  </option>
                ))}
            </select>
            <button type="submit" className="btn btn-secondary btn-sm">
              Cetak
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function RunningTest({ summary }: { summary: TestSummary }) {
  const { test, peserta, progress } = summary;
  const p = overallProgress(progress, peserta);
  const next = defaultPos(progress, peserta);
  const left = peserta - (progress[next] ?? 0);
  const allDone = p.filled >= p.total;
  const lengkapPos = POS.filter((pos) => (progress[pos] ?? 0) >= peserta).length;
  return (
    <>
      <section className="sam-hero" aria-label={`${test.nama}, berjalan`}>
        <div className="sam-hero-top">
          <span className="sam-hpill">Berjalan</span>
          <span>
            {dayDate(test.tanggal)} · {jam(test.jam_mulai)}
          </span>
        </div>
        <h2>{test.nama}</h2>
        <p className="sam-hero-sub">
          {test.tempat || "Tempat belum diisi"} · {peserta} peserta
        </p>
        <div className="sam-hero-prog">
          <b>
            {p.filled} dari {p.total} isian
          </b>
          <span>{fmt(Math.floor(p.persen), 0)}%</span>
        </div>
        <meter className="sam-hero-bar" min={0} max={Math.max(p.total, 1)} value={p.filled} aria-label={`Kemajuan isian ${test.nama}`} />
        {allDone ? (
          <Link className="sam-hero-btn" href={`/samapta/${test.tes_id}`}>
            Semua terisi: lihat hasil
            <Icon name="arrow" />
          </Link>
        ) : (
          <Link className="sam-hero-btn" href={`/samapta/${test.tes_id}/pos/${next}`}>
            Lanjut isi: {POS_TILE[next]} <span>· {left} belum</span>
            <Icon name="arrow" />
          </Link>
        )}
      </section>
      <div className="sam-sec-t">
        <h2>Pilih pos</h2>
        <span>
          {lengkapPos} dari {POS.length} pos lengkap
        </span>
      </div>
      <StationTiles tesId={test.tes_id} progress={progress} peserta={peserta} />
    </>
  );
}

// ---------------------------------------------------------------- Siswa

async function StudentView({ actor, tes }: { actor: Actor; tes?: string }) {
  const data = await loadMySamapta(actor);
  if (!data || data.history.length === 0) {
    return (
      <div className="page sam-page">
        <header className="sam-top">
          <div>
            <h1>Hasil Samapta</h1>
            <p>Hasil tes kesamaptaan jasmani kamu.</p>
          </div>
        </header>
        <section className="card sam-card">
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
  const prevName = prev ? shortTestName(prev.test.nama) : "";

  return (
    <div className="page sam-page">
      <header className="sam-top">
        <div>
          <h1>Hasil Samapta</h1>
          <p>Hasil tes kamu, dibanding tes sebelumnya.</p>
        </div>
      </header>
      {history.length > 1 ? (
        <nav className="sam-tests" aria-label="Pilih tes">
          {[...history].reverse().map((h, i) => (
            <Link key={h.test.tes_id} href={`/samapta?tes=${h.test.tes_id}`} aria-current={h.test.tes_id === test.tes_id ? "page" : undefined}>
              {shortTestName(h.test.nama)} · {shortDate(h.test.tanggal)}
              {i === 0 ? " (terbaru)" : ""}
            </Link>
          ))}
        </nav>
      ) : null}
      {test.status === "BERJALAN" ? <p className="sam-note">Tes ini masih berjalan. Nilai bisa berubah sampai pelatih menandai tes selesai.</p> : null}

      <div className="sam-sv">
        <div className="sam-sv-main">
          <ResultHero
            entry={entry}
            label={`${test.nama} · ${mediumDate(test.tanggal)}`}
            peserta={peserta}
            prev={prev ? { entry: prev.entry, name: prevName, month: monthShort(prev.test.tanggal) } : null}
          />
          <div className="sam-sec-t">
            <h2>Rincian nilai</h2>
            <span>{prev ? `dibanding ${prevName}` : test.tempat || ""}</span>
          </div>
          <section className="card sam-card sam-card-tight">
            <RincianList entry={entry} prev={prev?.entry ?? null} prevName={prevName} />
          </section>
          <a className="btn sam-btn-lg sam-only-phone" href={`/cetak/samapta/${test.tes_id}?siswa=${student.siswa_id}`}>
            <Icon name="print" />
            Cetak blangko saya
          </a>
        </div>
        <div className="sam-sv-side">
          <a className="btn sam-btn-lg sam-only-wide" href={`/cetak/samapta/${test.tes_id}?siswa=${student.siswa_id}`}>
            <Icon name="print" />
            Cetak blangko saya
          </a>
          <details className="card sam-card sam-more">
            <summary>
              <b>Cara nilai dihitung</b>
              <SamIcon name="down" />
            </summary>
            <HowCalculated entry={entry} settings={settings} />
          </details>
        </div>
      </div>
    </div>
  );
}
