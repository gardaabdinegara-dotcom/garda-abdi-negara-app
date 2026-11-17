import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { simpanPosSamapta } from "@/app/actions/samapta";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { Icon } from "@/components/icon";
import { BodyFacts, BreakdownTable, CompareBars, PrintLink, ResultCards, SamaptaStatusBadge } from "@/components/samapta";
import { Notice, PageHead } from "@/components/ui";
import { canManageSamapta, POS_INFO } from "@/lib/core/samapta";
import { formatDate } from "@/lib/format";
import { loadSamaptaResult } from "@/lib/server/samapta";
import { requireActor } from "@/lib/server/session";
import { compareGroups, jkLabel, missingPos, progressSentence, shortDate, shortTestName } from "../../../samapta-ui";

export const metadata: Metadata = { title: "Hasil samapta siswa" };

export default async function SamaptaStudentPage({ params }: { params: Promise<{ id: string; siswaId: string }> }) {
  const actor = await requireActor();
  if (!canManageSamapta(actor)) notFound();
  const { id, siswaId } = await params;
  const data = await loadSamaptaResult(actor, decodeURIComponent(id), decodeURIComponent(siswaId));
  const { test, entry, peserta, previous } = data;
  const s = entry.student;
  const locked = test.status !== "BERJALAN";
  const missing = missingPos(entry.result);
  const identity = [s.kode_siswa, s.jalur_target || null, jkLabel(s.jenis_kelamin), entry.usia !== null ? `${entry.usia} tahun` : null, s.asal_sekolah || null].filter(Boolean).join(" · ");
  const ttl = [s.tempat_lahir, s.tanggal_lahir ? formatDate(s.tanggal_lahir, "long") : ""].filter(Boolean).join(", ");

  return (
    <div className="page">
      <PageHead
        back={{ href: `/samapta/${test.tes_id}?tab=hasil`, label: `Hasil ${test.nama}` }}
        eyebrow={`${test.nama} · ${formatDate(test.tanggal, "long")}`}
        title={s.nama}
        description={identity}
        actions={
          <>
            {!locked && missing[0] ? (
              <Link className="btn btn-secondary" href={`/samapta/${test.tes_id}?tab=pos&pos=${missing[0]}`}>
                <Icon name="run" />
                Isi {POS_INFO[missing[0]].short}
              </Link>
            ) : null}
            <PrintLink variant="primary" href={`/cetak/samapta/${test.tes_id}?siswa=${s.siswa_id}`}>
              Cetak blangko
            </PrintLink>
          </>
        }
      />
      <ResultCards entry={entry} rank={{ rank: entry.rank, total: peserta }} />
      <div className="grid-main">
        <div className="stack sam-col">
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Rincian materi</h2>
                <p>
                  {missing.length ? `Belum diisi: ${missing.map((p) => POS_INFO[p].short).join(", ")}.` : "Semua pos sudah terisi."}
                </p>
              </div>
            </div>
            <BreakdownTable entry={entry} />
          </section>
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Tes sebelumnya dibanding tes ini</h2>
                <p>{previous ? `${previous.test.nama} (${formatDate(previous.test.tanggal)}) dan ${test.nama}.` : "Belum ada tes sebelumnya untuk siswa ini."}</p>
              </div>
            </div>
            {previous ? (
              <>
                <CompareBars
                  title="Nilai per materi"
                  groups={compareGroups(previous.entry, entry)}
                  labelA={`${shortTestName(previous.test.nama)} · ${shortDate(previous.test.tanggal)}`}
                  labelB={`${shortTestName(test.nama)} · ${shortDate(test.tanggal)}`}
                />
                <p className="sam-sentence">{progressSentence(previous.entry, entry)}</p>
              </>
            ) : (
              <p className="muted">Grafik perkembangan muncul setelah siswa mengikuti dua tes.</p>
            )}
          </section>
        </div>
        <div className="stack sam-col">
          <section className="card">
            <div className="card-head">
              <h2>Data siswa</h2>
              <SamaptaStatusBadge status={test.status} />
            </div>
            <dl className="facts">
              <dt>Kode / jalur</dt>
              <dd>
                {s.kode_siswa} / {s.jalur_target || "-"}
              </dd>
              <dt>Jenis kelamin</dt>
              <dd>{s.jenis_kelamin === "P" ? "Perempuan (Chinning)" : s.jenis_kelamin === "L" ? "Laki-laki (Pull Up)" : "-"}</dd>
              <dt>Tempat, tanggal lahir</dt>
              <dd>{ttl || "-"}</dd>
              <dt>Usia saat tes</dt>
              <dd>{entry.usia !== null ? `${entry.usia} tahun` : "-"}</dd>
              <dt>Asal sekolah</dt>
              <dd>{s.asal_sekolah || "-"}</dd>
            </dl>
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Badan & tensi</h2>
            </div>
            <BodyFacts entry={entry} />
          </section>
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Keterangan</h2>
                <p>Catatan untuk hasil tes ini, mis. izin saat renang.</p>
              </div>
            </div>
            <ActionForm action={simpanPosSamapta} operationId={randomUUID()} className="stack">
              <input type="hidden" name="tes_id" value={test.tes_id} />
              <input type="hidden" name="siswa_id" value={s.siswa_id} />
              <input type="hidden" name="pos" value="keterangan" />
              <Field label="Keterangan" name="keterangan" type="textarea" defaultValue={entry.result.keterangan} hint="Maksimal 200 karakter." disabled={locked} />
              {locked ? (
                <Notice tone="warning">Tes sudah ditandai selesai. Buka lagi tes ini untuk mengubah keterangan.</Notice>
              ) : (
                <div className="form-actions">
                  <SubmitButton>Simpan keterangan</SubmitButton>
                </div>
              )}
            </ActionForm>
          </section>
        </div>
      </div>
    </div>
  );
}
