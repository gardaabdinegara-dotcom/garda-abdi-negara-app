import Form from "next/form";
import Link from "next/link";
import { DISCIPLINE, type AttendanceSummary } from "@/lib/core/akademik";
import { PERIODE_PRESENSI, type DashboardPresensi, type FilterPresensi, type PeriodePresensi, type RingkasanPresensi } from "@/lib/core/presensi-ringkasan";
import { GrafikRekap, type TitikRekap } from "./grafik-rekap";
import { PerubahanSiswaCard } from "./perubahan-siswa";
import { AttendanceRecapRows } from "./presensi";
import { pct } from "./presensi-format";
import { PrIcon } from "./presensi-icons";
import { Empty } from "./ui";

const angka = new Intl.NumberFormat("id-ID");
const tanggalPendek = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
const tanggalLengkap = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateOf = (iso: string) => new Date(`${iso}T00:00:00Z`);

function labelRentang(dari: string, sampai: string): string {
  if (dari === sampai) return tanggalLengkap.format(dateOf(dari));
  const awal = dari.slice(0, 4) === sampai.slice(0, 4) ? tanggalPendek : tanggalLengkap;
  return `${awal.format(dateOf(dari))} – ${tanggalLengkap.format(dateOf(sampai))}`;
}

const STATUS = [
  { key: "hadir", label: "Hadir" },
  { key: "izin", label: "Izin" },
  { key: "sakit", label: "Sakit" },
  { key: "alfa", label: "Alfa" },
] as const;

function hrefPeriode(periode: PeriodePresensi, filter: FilterPresensi) {
  const query = new URLSearchParams({ tab: "ringkasan", periode });
  if (periode === "kustom" && filter.dari && filter.sampai) {
    query.set("dari", filter.dari);
    query.set("sampai", filter.sampai);
  }
  return `/akademik?${query}`;
}

function PeriodeRingkasan({ filter }: { filter: FilterPresensi }) {
  const invalid = Boolean(filter.error);
  return (
    <section className="card pr-card" aria-labelledby="pr-judul-ringkasan">
      <div className="pr-head pr-head-wrap">
        <div>
          <h2 id="pr-judul-ringkasan">Ringkasan kehadiran</h2>
          {invalid ? null : (
            <p className="pr-overview-date pr-xs pr-muted n"><PrIcon name="cal" size="sm" /> {labelRentang(filter.dari, filter.sampai)}</p>
          )}
        </div>
        <nav className="pr-seg pr-overview-period" aria-label="Periode ringkasan">
          {(Object.keys(PERIODE_PRESENSI) as PeriodePresensi[]).map((key) => (
            <Link key={key} href={hrefPeriode(key, filter)} aria-current={key === filter.periode ? "page" : undefined}
              prefetch={false} scroll={false}>{PERIODE_PRESENSI[key]}</Link>
          ))}
        </nav>
      </div>
      {filter.periode === "kustom" ? (
        <Form key={`${filter.dari}-${filter.sampai}`} className="pr-overview-range" action="/akademik" scroll={false} prefetch={false}>
          <input type="hidden" name="tab" value="ringkasan" />
          <input type="hidden" name="periode" value="kustom" />
          <div>
            <label htmlFor="ringkasan-dari">Dari tanggal</label>
            <input id="ringkasan-dari" type="date" name="dari" defaultValue={filter.dari} required
              aria-invalid={invalid || undefined} aria-describedby={invalid ? "pr-ringkasan-error" : undefined} />
          </div>
          <div>
            <label htmlFor="ringkasan-sampai">Sampai tanggal</label>
            <input id="ringkasan-sampai" type="date" name="sampai" defaultValue={filter.sampai} required
              aria-invalid={invalid || undefined} aria-describedby={invalid ? "pr-ringkasan-error" : undefined} />
          </div>
          <button className="pr-btn" type="submit">Tampilkan</button>
        </Form>
      ) : null}
      {filter.error ? <p className="pr-err" id="pr-ringkasan-error" role="alert">{filter.error}</p> : null}
    </section>
  );
}

function KomposisiPresensi({ counts }: { counts: AttendanceSummary }) {
  let offset = 0;
  return (
    <section className="card pr-card" aria-labelledby="pr-status-kehadiran">
      <div className="pr-head">
        <div>
          <h2 id="pr-status-kehadiran">Status kehadiran</h2>
          <p className="pr-xs pr-muted">Dihitung per siswa di setiap sesi selesai.</p>
        </div>
      </div>
      <svg className="pr-overview-composition" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
        <rect className="track" width="100" height="8" />
        {counts.total > 0 ? STATUS.map(({ key }) => {
          const width = counts[key] / counts.total * 100;
          const x = offset;
          offset += width;
          return <rect key={key} className={`is-${key}`} x={x} width={width} height="8" />;
        }) : null}
      </svg>
      <dl className="pr-overview-status">
        {STATUS.map(({ key, label }) => (
          <div key={key}>
            <dt><i className={`is-${key}`} aria-hidden="true" />{label}</dt>
            <dd className="n">{angka.format(counts[key])}</dd>
          </div>
        ))}
      </dl>
      {counts.terlambat > 0 ? <p className="pr-xs pr-muted n">{angka.format(counts.terlambat)} kehadiran tercatat terlambat.</p> : null}
    </section>
  );
}

function TrenKehadiran({ ringkasan, filter }: { ringkasan: RingkasanPresensi; filter: FilterPresensi }) {
  const titik: TitikRekap[] = ringkasan.interval.map(({ dari, sampai, counts }) => ({
    id: dari,
    label: labelRentang(dari, sampai),
    sumbu: tanggalPendek.format(dateOf(sampai)),
    nilai: counts.persen,
    rincian: counts.total ? `${angka.format(counts.hadir)} dari ${angka.format(counts.total)} hadir · ${pct(counts.persen)}` : "Belum ada presensi sesi selesai",
  }));
  return (
    <section className="card pr-card pr-overview-graph" aria-labelledby="pr-tren-kehadiran">
      <div className="pr-head">
        <div>
          <h2 id="pr-tren-kehadiran">Tren kehadiran</h2>
          <p className="pr-xs pr-muted">Persentase hadir per {ringkasan.intervalHari > 1 ? `${ringkasan.intervalHari} hari` : "hari"}.</p>
        </div>
      </div>
      {ringkasan.counts.total ? (
        <GrafikRekap key={`${filter.dari}-${filter.sampai}`} mode="garis" satuan="%" titik={titik} label="Persentase kehadiran per periode" />
      ) : (
        <Empty title="Belum ada presensi sesi selesai">
          {ringkasan.sesiTerbuka ? "Grafik terisi setelah sesi ditutup." : "Pilih periode yang memiliki catatan kehadiran."}
        </Empty>
      )}
    </section>
  );
}

export function PresensiOverview({ filter, ringkasan }: { filter: FilterPresensi; ringkasan: DashboardPresensi | null }) {
  return (
    <div className="pr-col pr-overview">
      <PeriodeRingkasan filter={filter} />
      {ringkasan ? (
        <>
          <section className="pr-k4 pr-overview-kpis" aria-label="Angka kehadiran">
            <div>
              <span><PrIcon name="okc" size="sm" /> Tingkat kehadiran</span>
              <b className="n">{pct(ringkasan.counts.persen)}</b>
              {ringkasan.counts.total ? <small>{angka.format(ringkasan.counts.hadir)} dari {angka.format(ringkasan.counts.total)} hadir</small> : null}
            </div>
            <div className="m"><span><PrIcon name="cal" size="sm" /> Sesi selesai</span><b className="n">{angka.format(ringkasan.sesiSelesai)}</b></div>
            <div className="m"><span><PrIcon name="users" size="sm" /> Siswa tercatat</span><b className="n">{angka.format(ringkasan.rows.length)}</b></div>
            <div className={ringkasan.perluPerhatian ? "r" : "m"}>
              <span><PrIcon name="note" size="sm" /> Kehadiran di bawah {DISCIPLINE.cukup}%</span>
              <b className="n">{angka.format(ringkasan.perluPerhatian)}</b>
            </div>
          </section>
          {ringkasan.sesiTerbuka ? (
            <div className="pr-overview-open">
              <PrIcon name="clock" />
              <p><b>{angka.format(ringkasan.sesiTerbuka)} sesi masih terbuka</b>{ringkasan.pengajuanMenunggu ? ` · ${angka.format(ringkasan.pengajuanMenunggu)} pengajuan menunggu` : ""}</p>
            </div>
          ) : null}
          <div className="pr-overview-grid">
            <TrenKehadiran ringkasan={ringkasan} filter={filter} />
            <KomposisiPresensi counts={ringkasan.counts} />
          </div>
          <PerubahanSiswaCard
            periode={filter}
            perbandingan={ringkasan.perbandingan}
            satuan="poin persentase"
            keterangan="Selisih persentase hadir per siswa dari sesi yang sudah selesai."
            petunjuk="Rentang tanggal pembanding tidak tersedia."
          />
          <section className="card pr-card" aria-labelledby="pr-kehadiran-per-siswa">
            <div className="pr-head">
              <div>
                <h2 id="pr-kehadiran-per-siswa">Kehadiran per siswa</h2>
                <p className="pr-xs pr-muted">Persentase terendah di atas. Peserta tanpa catatan pada sesi selesai dihitung alfa.</p>
              </div>
            </div>
            <AttendanceRecapRows rows={ringkasan.rows} emptyText="Belum ada catatan untuk periode ini." />
          </section>
        </>
      ) : null}
    </div>
  );
}
