import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { simpanPosSamapta } from "@/app/actions/samapta";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { Icon } from "@/components/icon";
import { ResultHero, RincianList } from "@/components/samapta";
import { SamIcon } from "@/components/samapta-icon";
import { canManageSamapta, POS_INFO, TEST_STATUS_LABEL, type Pos } from "@/lib/core/samapta";
import { formatDate } from "@/lib/format";
import { loadSamaptaResult } from "@/lib/server/samapta";
import { requireActor } from "@/lib/server/session";
import { jkLabel, mediumDate, missingPos, monthShort, progressSentence, shortTestName } from "../../../samapta-ui";

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
  const identity = [s.kode_siswa, jkLabel(s.jenis_kelamin), entry.usia !== null ? `${entry.usia} tahun` : null, s.jalur_target || null, s.asal_sekolah || null].filter(Boolean).join(" · ");
  const ttl = [s.tempat_lahir, s.tanggal_lahir ? formatDate(s.tanggal_lahir, "long") : ""].filter(Boolean).join(", ");
  const prevName = previous ? shortTestName(previous.test.nama) : "";
  const edit = locked ? undefined : (pos: Pos) => `/samapta/${test.tes_id}/pos/${pos}?siswa=${s.siswa_id}&semua=1&dari=s-${s.siswa_id}`;

  return (
    <div className="page sam-page">
      <header className="sam-dhead">
        <div className="sam-dhead-main">
          <Link className="sam-crumb" href={`/samapta/${test.tes_id}`}>
            <SamIcon name="left" />
            Hasil {test.nama}
          </Link>
          <div className="sam-dtitle">
            <h1>{s.nama}</h1>
            <span className={`sam-spill is-${test.status.toLowerCase()}`}>{TEST_STATUS_LABEL[test.status]}</span>
          </div>
          <p className="sam-dmeta">{identity}</p>
        </div>
        <div className="sam-dact">
          {!locked && missing[0] ? (
            <Link className="btn btn-secondary" href={edit!(missing[0])}>
              <SamIcon name="field" />
              Isi {POS_INFO[missing[0]].short}
            </Link>
          ) : null}
          <a className="btn" href={`/cetak/samapta/${test.tes_id}?siswa=${s.siswa_id}`}>
            <Icon name="print" />
            Cetak blangko
          </a>
        </div>
      </header>

      <div className="sam-sv">
        <div className="sam-sv-main">
          <ResultHero
            entry={entry}
            label={`${test.nama} · ${mediumDate(test.tanggal)}`}
            peserta={peserta}
            prev={previous ? { entry: previous.entry, name: prevName, month: monthShort(previous.test.tanggal) } : null}
          />
          <div className="sam-sec-t">
            <h2>Rincian nilai</h2>
            <span>{previous ? `dibanding ${prevName}` : "belum ada tes sebelumnya"}</span>
          </div>
          <section className="card sam-card sam-card-tight">
            <RincianList entry={entry} prev={previous?.entry ?? null} prevName={prevName} edit={edit} />
          </section>
          {previous ? <p className="sam-sentence">{progressSentence(previous.entry, entry)}</p> : null}
          {locked ? (
            <p className="sam-note">
              <SamIcon name="lock" />
              Tes sudah ditandai selesai, jadi isian dikunci. Buka lagi di halaman hasil bila perlu koreksi.
            </p>
          ) : missing.length ? (
            <p className="sam-note">Belum diisi: {missing.map((p) => POS_INFO[p].short).join(", ")}.</p>
          ) : null}
        </div>

        <div className="sam-sv-side">
          <section className="card sam-card">
            <h2>Data siswa</h2>
            <dl className="sam-kv">
              <div>
                <dt>Kode / jalur</dt>
                <dd>
                  {s.kode_siswa} / {s.jalur_target || "-"}
                </dd>
              </div>
              <div>
                <dt>Jenis kelamin</dt>
                <dd>{s.jenis_kelamin === "P" ? "Perempuan (Chinning)" : s.jenis_kelamin === "L" ? "Laki-laki (Pull up)" : "-"}</dd>
              </div>
              <div>
                <dt>Tempat, tanggal lahir</dt>
                <dd>{ttl || "-"}</dd>
              </div>
              <div>
                <dt>Usia saat tes</dt>
                <dd>{entry.usia !== null ? `${entry.usia} tahun` : "-"}</dd>
              </div>
              <div>
                <dt>Asal sekolah</dt>
                <dd>{s.asal_sekolah || "-"}</dd>
              </div>
            </dl>
          </section>
          <section className="card sam-card">
            <div>
              <h2>Keterangan</h2>
              <p className="sam-sub">Catatan untuk hasil tes ini, mis. izin saat renang.</p>
            </div>
            <ActionForm action={simpanPosSamapta} operationId={randomUUID()} className="stack">
              <input type="hidden" name="tes_id" value={test.tes_id} />
              <input type="hidden" name="siswa_id" value={s.siswa_id} />
              <input type="hidden" name="pos" value="keterangan" />
              <Field label="Keterangan" name="keterangan" type="textarea" defaultValue={entry.result.keterangan} hint="Maksimal 200 karakter." disabled={locked} />
              {locked ? null : (
                <div className="form-actions">
                  <SubmitButton size="sm">Simpan keterangan</SubmitButton>
                </div>
              )}
            </ActionForm>
          </section>
        </div>
      </div>
    </div>
  );
}
