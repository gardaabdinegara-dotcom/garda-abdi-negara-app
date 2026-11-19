import Link from "next/link";
import { DURASI_LABEL, JENIS_INFO } from "@/lib/core/latihan";
import {
  BATAS_LAMA_HARI,
  BATAS_TURUN,
  PERIODE_REKAP,
  type FokusRekap,
  type RekapBaris,
  type RekapLatihan,
} from "@/lib/core/latihan-rekap";
import type { Latihan } from "@/lib/core/latihan-simpan";
import { initials } from "@/lib/format";
import { rekapHref, type PilihanRekap } from "@/lib/latihan-rekap-route";
import { Icon } from "./icon";
import { ASPEK, HariSejak, TandaBadge, TrenPill, tanggalPendek } from "./latihan-progres";
import { RekapFilter } from "./latihan-progres-filter";
import { GrafikRekap, type TitikRekap } from "./latihan-rekap-chart";
import { Empty, PageHead } from "./ui";

const angka = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const labelSesi = (l: Latihan) => `${JENIS_INFO[l.jenis].nama} · ${DURASI_LABEL[l.durasi]}`;
const rentang = (dari: string, sampai: string) => dari === sampai ? tanggalPendek(dari) : `${tanggalPendek(dari)} – ${tanggalPendek(sampai)}`;
const JUDUL_SESI_BARU = "Sesi pertama pada jenis dan durasi ini";
const BATAS_TITIK_SISWA = 20;

const TANDA = [
  { key: "turun", judul: "Skor turun", rincian: `Turun ≥${Math.abs(BATAS_TURUN)} poin dari sesi sebanding`, icon: "chart" },
  { key: "lama", judul: "Jeda latihan", rincian: `≥${BATAS_LAMA_HARI} hari sejak latihan terakhir`, icon: "clock" },
  { key: "belum", judul: "Belum pernah", rincian: "Belum ada sesi latihan", icon: "user" },
] as const;

interface RekapProps {
  rekap: RekapLatihan;
  pilihan: PilihanRekap;
}

function GrafikKelompok({ rekap, pilihan }: RekapProps) {
  const skor = pilihan.grafik === "skor";
  const grafikJudul = skor ? "Tren skor kelompok" : "Aktivitas latihan";
  const skorHref = rekapHref(pilihan, {
    grafik: "skor",
    jenis: pilihan.jenis ?? rekap.contohSkor?.jenis ?? "kraepelin",
    durasi: pilihan.durasi ?? rekap.contohSkor?.durasi ?? "standar",
  });
  const sebanding = Boolean(pilihan.jenis && pilihan.durasi);
  const intervalHari = pilihan.periode / rekap.interval.length;
  const titik: TitikRekap[] = rekap.interval.map((interval) => ({
    id: interval.dari,
    label: rentang(interval.dari, interval.sampai),
    sumbu: tanggalPendek(interval.sampai),
    nilai: skor ? interval.medianSkor : interval.sesi,
    rincian: skor
      ? interval.medianSkor === null ? "Belum ada skor" : `Median ${angka.format(interval.medianSkor)} · ${angka.format(interval.siswa)} siswa`
      : `${angka.format(interval.sesi)} sesi selesai · ${angka.format(interval.siswa)} siswa`,
  }));

  return (
    <section id="grafik-latihan" className="card lp-card lp-monitor-graph" aria-labelledby="judul-grafik-latihan">
      <div className="lp-card-head">
        <div>
          <h2 id="judul-grafik-latihan">{grafikJudul}</h2>
          <p>{rentang(rekap.mulaiPeriode, rekap.hariIni)} · {skor ? "Median skor terbaru tiap siswa per interval" : `Sesi selesai per ${intervalHari === 1 ? "hari" : `${intervalHari} hari`}`}</p>
        </div>
        <nav className="lp-monitor-tabs" aria-label="Grafik kelompok">
          <Link href={rekapHref(pilihan, { grafik: "aktivitas" })} prefetch={false} scroll={false} aria-current={!skor ? "true" : undefined}>Aktivitas</Link>
          <Link href={skorHref} prefetch={false} scroll={false} aria-current={skor ? "true" : undefined}>Tren skor</Link>
        </nav>
      </div>
      {skor && !sebanding ? (
        <Empty title="Pilih satu jenis dan satu durasi">
          Gunakan filter di atas untuk melihat tren skor yang sebanding.
        </Empty>
      ) : rekap.sesiSelesai > 0 ? (
        <GrafikRekap key={`${pilihan.grafik}-${pilihan.periode}-${pilihan.jenis}-${pilihan.durasi}`} mode={pilihan.grafik} titik={titik} label={grafikJudul} />
      ) : (
        <Empty title={skor ? "Belum ada skor pada periode ini" : "Belum ada sesi pada periode ini"}>
          Ubah periode, jenis latihan, atau durasi.
        </Empty>
      )}
    </section>
  );
}

function TindakLanjut({ rekap, pilihan }: RekapProps) {
  return (
    <section className="card lp-card lp-monitor-followup" aria-labelledby="judul-tindak-lanjut">
      <div className="lp-card-head">
        <div>
          <h2 id="judul-tindak-lanjut">Prioritas tindak lanjut</h2>
          <p>Ketuk kategori untuk melihat siswanya.</p>
        </div>
      </div>
      <ul className="lp-monitor-reasons">
        {TANDA.map(({ key, judul, rincian, icon }) => (
          <li key={key}>
            <Link href={rekapHref(pilihan, { tanda: pilihan.tanda === key ? null : key }, "daftar-latihan")}
              prefetch={false} aria-current={pilihan.tanda === key ? "true" : undefined} className={`is-${key}`}>
              <span className="lp-monitor-reason-icon"><Icon name={icon} /></span>
              <span><b>{judul}</b><small>{rincian}</small></span>
              <strong>{angka.format(rekap.perhatian[key])}</strong>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DetailSiswa({ fokus, pilihan, rekap }: RekapProps & { fokus: FokusRekap }) {
  const { sesi, jenis, durasi, student, sebelumnya } = fokus;
  const terakhir = sesi.at(-1);
  const terlihat = sesi.slice(-BATAS_TITIK_SISWA);
  const titik: TitikRekap[] = terlihat.map((l, i) => ({
    id: l.latihan_id,
    label: `${tanggalPendek(l.tanggal)} · Sesi ${sesi.length - terlihat.length + i + 1}`,
    sumbu: tanggalPendek(l.tanggal),
    nilai: l.skor,
    rincian: `Skor ${angka.format(l.skor)} dari 100`,
  }));
  const hrefRiwayat = `/latihan/siswa/${encodeURIComponent(student.siswa_id)}${jenis ? `?jenis=${jenis}` : ""}`;

  return (
    <>
      <section id="grafik-latihan" className="card lp-card lp-monitor-graph" aria-labelledby="judul-grafik-latihan">
        <div className="lp-card-head">
          <div>
            <h2 id="judul-grafik-latihan">Progres {student.nama}</h2>
            <p>
              {jenis && durasi ? `${JENIS_INFO[jenis].nama} · ${DURASI_LABEL[durasi]} · ` : ""}
              {rentang(rekap.mulaiPeriode, rekap.hariIni)}
            </p>
          </div>
          <Link className="lp-monitor-text-link" href={rekapHref(pilihan, { siswa: null }, "grafik-latihan")} prefetch={false}>
            <Icon name="back" /> Ringkasan
          </Link>
        </div>
        {titik.length ? (
          <GrafikRekap key={`${student.siswa_id}-${jenis}-${durasi}-${pilihan.periode}`} mode="skor" titik={titik} label={`Tren skor ${student.nama}`} />
        ) : (
          <Empty title="Belum ada sesi pada periode ini">Ubah filter untuk melihat latihan siswa ini.</Empty>
        )}
        {sesi.length > terlihat.length ? <p className="lp-monitor-note">{terlihat.length} sesi terbaru dari {angka.format(sesi.length)} sesi sebanding dalam periode ini.</p> : null}
      </section>

      <section className="card lp-card lp-monitor-followup" aria-labelledby="judul-aspek-latihan">
        <div className="lp-card-head">
          <div>
            <h2 id="judul-aspek-latihan">Per aspek</h2>
            <p>{sebelumnya && terakhir ? `${tanggalPendek(terakhir.tanggal)} dibanding sesi ${tanggalPendek(sebelumnya.tanggal)}` : "Skor aspek dari sesi terbaru"}</p>
          </div>
        </div>
        {terakhir ? (
          <ul className="lp-monitor-aspects">
            {ASPEK.map(({ key, nama }) => {
              const nilai = terakhir.skorAspek[key];
              const tren = sebelumnya ? Math.round((nilai - sebelumnya.skorAspek[key]) * 10) / 10 : null;
              return (
                <li key={key}>
                  <div>
                    <b>{nama}</b>
                    <span>{angka.format(nilai)} {tren !== null ? <TrenPill tren={tren} /> : null}</span>
                  </div>
                  <meter className="lp-bar" min={0} max={100} value={nilai} aria-label={`Skor ${nama} dari 100`} />
                </li>
              );
            })}
          </ul>
        ) : <p className="lp-monitor-note">Skor aspek tersedia setelah siswa menyelesaikan sesi yang sesuai dengan filter.</p>}
        <Link className="lp-monitor-text-link" href={hrefRiwayat} prefetch={false}>Riwayat latihan <Icon name="arrow" /></Link>
      </section>
    </>
  );
}

function DaftarSiswa({ rekap, pilihan }: RekapProps) {
  const terlihat = rekap.baris.filter((b) => !pilihan.tanda || (pilihan.tanda === "perlu" ? b.tanda !== null : b.tanda === pilihan.tanda));
  const judul = pilihan.tanda === "perlu" ? "Siswa perlu perhatian" : TANDA.find((t) => t.key === pilihan.tanda)?.judul ?? "Daftar siswa";
  const hrefSiswa = (b: RekapBaris) => rekapHref(pilihan, { siswa: b.student.siswa_id }, "grafik-latihan");

  return (
    <section id="daftar-latihan" className="card lp-card lp-monitor-roster" aria-labelledby="judul-daftar-latihan">
      <div className="lp-card-head">
        <div>
          <h2 id="judul-daftar-latihan">{judul}</h2>
          <p>{angka.format(terlihat.length)} siswa · Pilih nama untuk melihat progres.</p>
        </div>
        {pilihan.tanda ? (
          <Link href={rekapHref(pilihan, { tanda: null }, "daftar-latihan")} className="lp-monitor-text-link" prefetch={false}>Tampilkan semua</Link>
        ) : null}
      </div>
      {terlihat.length > 0 ? (
        <>
          <ul className="lp-rlist">
            {terlihat.map((b) => (
              <li key={b.student.siswa_id} className={b.tanda ? `is-${b.tanda}` : undefined}>
                <Link href={hrefSiswa(b)} prefetch={false} aria-current={pilihan.siswa === b.student.siswa_id ? "true" : undefined}>
                  <span className="lp-av" aria-hidden="true">{initials(b.student.nama)}</span>
                  <span className="lp-rlist-main">
                    <b>{b.student.nama}</b>
                    <span className="lp-rlist-sub">{angka.format(b.sesi)} sesi{b.hariSejak !== null ? <> · Terakhir <HariSejak hari={b.hariSejak} /></> : null}</span>
                    {b.terakhir ? <span className="lp-rlist-sub">{labelSesi(b.terakhir)}</span> : null}
                    <TandaBadge baris={b} />
                  </span>
                  <span className="lp-rlist-end">
                    <b className={b.terakhir ? undefined : "is-empty"} aria-label={b.terakhir ? `Skor terakhir ${b.terakhir.skor}` : "Tidak ada skor"}>{b.terakhir?.skor ?? "—"}</b>
                    {b.terakhir ? <TrenPill tren={b.tren} judulBaru={JUDUL_SESI_BARU} /> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <table className="lp-rtbl">
            <thead>
              <tr>
                <th scope="col">Siswa</th>
                <th scope="col" className="r">Sesi</th>
                <th scope="col">Skor terakhir</th>
                <th scope="col">Tren</th>
                <th scope="col">Aktivitas terakhir</th>
              </tr>
            </thead>
            <tbody>
              {terlihat.map((b) => (
                <tr key={b.student.siswa_id} className={b.tanda ? `is-${b.tanda}` : undefined}>
                  <td className="lp-rtbl-nm">
                    <Link href={hrefSiswa(b)} prefetch={false} aria-current={pilihan.siswa === b.student.siswa_id ? "true" : undefined}>
                      <b>{b.student.nama}</b>
                      <span>{b.student.kode_siswa}</span>
                    </Link>
                    <TandaBadge baris={b} />
                  </td>
                  <td className="r">{angka.format(b.sesi)}</td>
                  <td>{b.terakhir ? <span className="lp-skor"><b>{b.terakhir.skor}</b><em>{labelSesi(b.terakhir)}</em></span> : <span className="muted">—</span>}</td>
                  <td>{b.terakhir ? <TrenPill tren={b.tren} judulBaru={JUDUL_SESI_BARU} /> : <span className="muted">—</span>}</td>
                  <td>{b.hariSejak === null ? <span className="muted">Belum pernah</span> : <HariSejak hari={b.hariSejak} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="lp-monitor-note">Sesi dan skor mengikuti filter. Aktivitas terakhir mencakup semua latihan.</p>
        </>
      ) : <Empty title="Tidak ada siswa dalam kategori ini" />}
    </section>
  );
}

export function RekapLatihanView({ rekap, pilihan }: RekapProps) {
  const aktif = rekap.fokus ? pilihan : { ...pilihan, siswa: null };
  const perlu = rekap.perhatian.turun + rekap.perhatian.lama + rekap.perhatian.belum;

  return (
    <div className="page lp-page lp-monitor">
      <PageHead
        title="Latihan siswa"
        description="Pantau aktivitas dan perkembangan latihan psikotes siswa aktif."
        actions={<Link className="btn btn-secondary" href="/latihan/coba"><Icon name="target" /> Coba latihan</Link>}
      />

      {rekap.siswaAktif === 0 ? (
        <section className="card lp-card">
          <Empty title="Belum ada siswa aktif">Tambahkan siswa di menu <Link href="/siswa">Siswa</Link> untuk mulai melihat progres latihan.</Empty>
        </section>
      ) : (
        <>
          <div className="lp-monitor-filters">
            <div className="lp-monitor-period">
              <span>Periode</span>
              <nav className="lp-monitor-tabs" aria-label="Periode latihan">
                {PERIODE_REKAP.map((periode) => (
                  <Link key={periode} href={rekapHref(aktif, { periode })} prefetch={false} scroll={false}
                    aria-current={aktif.periode === periode ? "true" : undefined}>{periode} hari</Link>
                ))}
              </nav>
            </div>
            <RekapFilter pilihan={aktif} />
          </div>
          <section className="lp-monitor-kpis" aria-label="Ringkasan latihan">
            <div className="lp-monitor-kpi">
              <span><Icon name="users" /> Siswa berlatih</span>
              <b>{angka.format(rekap.siswaBerlatih)} <small>/ {angka.format(rekap.siswaAktif)}</small></b>
            </div>
            <div className="lp-monitor-kpi">
              <span><Icon name="clipboard" /> Sesi selesai</span>
              <b>{angka.format(rekap.sesiSelesai)}</b>
            </div>
            <Link className="lp-monitor-kpi lp-monitor-kpi-alert" href={rekapHref(aktif, { tanda: aktif.tanda === "perlu" ? null : "perlu" }, "daftar-latihan")}
              prefetch={false} aria-current={aktif.tanda === "perlu" ? "true" : undefined}>
              <span><Icon name="userAlert" /> Perlu perhatian</span>
              <b>{angka.format(perlu)} <Icon name="arrow" /></b>
            </Link>
          </section>
          <div className="lp-monitor-grid">
            {rekap.fokus ? (
              <DetailSiswa fokus={rekap.fokus} rekap={rekap} pilihan={aktif} />
            ) : (
              <>
                <GrafikKelompok rekap={rekap} pilihan={aktif} />
                <TindakLanjut rekap={rekap} pilihan={aktif} />
              </>
            )}
          </div>
          <DaftarSiswa rekap={rekap} pilihan={aktif} />
        </>
      )}
    </div>
  );
}
