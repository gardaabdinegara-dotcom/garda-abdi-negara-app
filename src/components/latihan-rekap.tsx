// Rekap latihan psikotes semua siswa untuk owner/admin (desain "Latihan siswa (owner)"): ringkasan minggu ini,
// siswa yang perlu didorong, dan daftar semua siswa (daftar di ponsel, tabel di layar lebar). Tanpa style inline (CSP).
import Link from "next/link";
import { JENIS_INFO } from "@/lib/core/latihan";
import { BATAS_LAMA_HARI, BATAS_TURUN, type RekapBaris, type RekapLatihan } from "@/lib/core/latihan-rekap";
import { initials } from "@/lib/format";
import { Icon } from "./icon";
import { RekapFilter } from "./latihan-progres-filter";
import { HariSejak, TandaBadge, TrenPill } from "./latihan-progres";
import { Empty, Notice, PageHead } from "./ui";

const hrefSiswa = (b: RekapBaris) => `/latihan/siswa/${encodeURIComponent(b.student.siswa_id)}`;

/** Satu kalimat alasan untuk kartu "Perlu didorong". */
function alasan(b: RekapBaris): string {
  if (b.tanda === "turun") return `skornya turun ${Math.abs(b.tren ?? 0)} poin`;
  if (b.tanda === "lama") return `belum latihan ${b.hariSejak} hari`;
  return "belum pernah latihan";
}

export function RekapLatihanView({ rekap }: { rekap: RekapLatihan }) {
  const perlu = rekap.baris.filter((b) => b.tanda);
  const pernah = rekap.baris.some((b) => b.total > 0);
  const contoh = perlu.slice(0, 3);

  return (
    <div className="page lp-page">
      <PageHead
        title="Latihan siswa"
        description="Latihan psikotes semua siswa aktif. Minggu ini = 7 hari terakhir."
        actions={
          <Link className="btn btn-secondary" href="/latihan/coba">
            <Icon name="target" />
            Coba latihan
          </Link>
        }
      />

      {rekap.siswaAktif === 0 ? (
        <section className="card lp-card">
          <Empty title="Belum ada siswa aktif">
            Tambahkan siswa di menu <Link href="/siswa">Siswa</Link>. Rekap latihan muncul setelah siswa mulai latihan dari HP.
          </Empty>
        </section>
      ) : (
        <>
          <div className="lp-kv" aria-label="Ringkasan minggu ini">
            <div>
              <b>{rekap.latihanMingguIni}</b>
              <span>latihan minggu ini</span>
            </div>
            <div>
              <b>
                {rekap.aktifMingguIni}
                <small>/{rekap.siswaAktif}</small>
              </b>
              <span>siswa latihan minggu ini</span>
            </div>
            <div className={rekap.perluPerhatian ? "is-warn" : undefined}>
              <b>{rekap.perluPerhatian}</b>
              <span>perlu perhatian</span>
            </div>
          </div>

          {!pernah ? (
            <Notice>Belum ada siswa yang latihan. Hasil muncul di sini setelah siswa mengerjakan latihan dari menu Latihan di HP.</Notice>
          ) : perlu.length ? (
            <section className="lp-push" aria-labelledby="lp-push-judul">
              <b id="lp-push-judul">Perlu didorong</b>
              <p>
                {contoh.map((b, i) => (
                  <span key={b.student.siswa_id}>
                    {i > 0 ? " · " : ""}
                    <Link href={hrefSiswa(b)}>{b.student.nama}</Link> {alasan(b)}
                  </span>
                ))}
                {perlu.length > contoh.length ? ` · dan ${perlu.length - contoh.length} siswa lainnya` : ""}.
              </p>
            </section>
          ) : (
            <Notice tone="success">Semua siswa aktif sudah latihan dalam {BATAS_LAMA_HARI} hari terakhir dan tidak ada skor yang turun.</Notice>
          )}

          <RekapFilter total={rekap.siswaAktif} perlu={rekap.perluPerhatian}>
            <ul className="lp-rlist">
              {rekap.baris.map((b) => (
                <li key={b.student.siswa_id} className={b.tanda ? `is-tanda is-${b.tanda}` : undefined}>
                  <Link href={hrefSiswa(b)}>
                    <span className="lp-av" aria-hidden="true">
                      {initials(b.student.nama)}
                    </span>
                    <span className="lp-rlist-main">
                      <b>{b.student.nama}</b>
                      <span className="lp-rlist-sub">
                        {b.terakhir ? (
                          <>
                            {JENIS_INFO[b.terakhir.jenis].nama} · <HariSejak hari={b.hariSejak} />
                          </>
                        ) : (
                          "Belum ada latihan"
                        )}
                        {b.mingguIni ? ` · ${b.mingguIni}× minggu ini` : ""}
                      </span>
                      {b.tanda ? <TandaBadge baris={b} /> : null}
                    </span>
                    <span className="lp-rlist-end">
                      <b className={b.terakhir ? undefined : "is-empty"}>{b.terakhir ? b.terakhir.skor : "-"}</b>
                      {b.terakhir ? <TrenPill tren={b.tren} /> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <table className="lp-rtbl">
              <thead>
                <tr>
                  <th>Siswa</th>
                  <th className="r">Minggu ini</th>
                  <th className="r">Total</th>
                  <th>Skor terakhir</th>
                  <th>Tren</th>
                  <th>Terakhir latihan</th>
                </tr>
              </thead>
              <tbody>
                {rekap.baris.map((b) => (
                  <tr key={b.student.siswa_id} className={b.tanda ? `is-tanda is-${b.tanda}` : undefined}>
                    <td className="lp-rtbl-nm">
                      <Link href={hrefSiswa(b)}>
                        <b>{b.student.nama}</b>
                        <span>{b.student.kode_siswa}</span>
                      </Link>
                      {b.tanda ? <TandaBadge baris={b} /> : null}
                    </td>
                    <td className="r">{b.mingguIni ? `${b.mingguIni}×` : "-"}</td>
                    <td className="r">{b.total || "-"}</td>
                    <td>
                      {b.terakhir ? (
                        <span className="lp-skor">
                          <b>{b.terakhir.skor}</b>
                          <meter className="lp-mini" min={0} max={100} value={b.terakhir.skor} aria-label={`Skor ${b.terakhir.skor} dari 100`} />
                          <em>{JENIS_INFO[b.terakhir.jenis].nama}</em>
                        </span>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                    <td>{b.terakhir ? <TrenPill tren={b.tren} /> : <span className="muted">-</span>}</td>
                    <td>
                      {b.terakhir ? <HariSejak hari={b.hariSejak} /> : <span className="muted">Belum pernah</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {rekap.perluPerhatian === 0 ? <p className="lp-none">Tidak ada siswa yang perlu perhatian saat ini.</p> : null}
            <p className="lp-foot">
              Ditandai bila belum pernah latihan, {BATAS_LAMA_HARI} hari atau lebih tidak latihan, atau skor turun {Math.abs(BATAS_TURUN)} poin atau
              lebih dari latihan sebelumnya (jenis yang sama).
            </p>
          </RekapFilter>
        </>
      )}
    </div>
  );
}
