import type { Metadata } from "next";
import Link from "next/link";
import { AttendanceBadge, fmtNumber, fmtPercent, SessionStatusBadge } from "@/components/akademik";
import {
  AttendanceChart,
  DonutCard,
  HariIniCard,
  Hero,
  Kpi,
  KpiMini,
  ListCard,
  RingCard,
  rpShort,
  Shortcuts,
  type HeroChip,
  type KpiMiniItem,
  type ListItem,
  type PerluPerhatian,
  type Segment,
  type SesiHariIni,
} from "@/components/dashboard";
import { InfoPelatihCard } from "@/components/pengumuman";
import { rp } from "@/components/keuangan";
import { monthLabel } from "@/components/report-document";
import { Badge, Empty, Notice } from "@/components/ui";
import { disciplineLabel, SESSION_STATUS_LABEL } from "@/lib/core/akademik";
import { FITUR } from "@/lib/core/fitur";
import { canManageStudents, canRecordFinance } from "@/lib/core/permissions";
import { canManageSamapta, KLASIFIKASI, POS, POS_INFO } from "@/lib/core/samapta";
import type { Actor } from "@/lib/core/types";
import { isiTemplate, nomorWa, type WaJenis } from "@/lib/core/wa";
import { formatDate, formatPhone, formatToday, greeting } from "@/lib/format";
import { loadAcademicHome, type SessionCard } from "@/lib/server/akademik";
import { loadFinanceHome } from "@/lib/server/keuangan";
import { loadInfoPelatih, type PengumumanView } from "@/lib/server/pengumuman";
import { loadOverview, loadWaTemplates, type Overview } from "@/lib/server/queries";
import { loadMySamapta, loadSamaptaOverview } from "@/lib/server/samapta";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Beranda" };

type Search = Promise<Record<string, string | string[] | undefined>>;
type Academic = Awaited<ReturnType<typeof loadAcademicHome>>;
type StaffAcademic = Extract<Academic, { kind: "staff" }>;
type FamilyAcademic = Extract<Academic, { kind: "family" }>;
type FinanceHome = Awaited<ReturnType<typeof loadFinanceHome>>;
type SamaptaStaff = Awaited<ReturnType<typeof loadSamaptaOverview>>;
type SamaptaMine = Awaited<ReturnType<typeof loadMySamapta>>;

export default async function HomePage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor();
  const params = await searchParams;
  const role = actor.user.peran;
  const family = role === "SISWA" || role === "WALI";
  const [overview, academic, money, samaptaStaff, samaptaMine, templates, info] = await Promise.all([
    loadOverview(actor),
    loadAcademicHome(actor),
    loadFinanceHome(actor),
    canManageSamapta(actor) ? loadSamaptaOverview(actor) : Promise.resolve(null),
    role === "SISWA" ? loadMySamapta(actor) : Promise.resolve(null),
    canManageStudents(actor) ? loadWaTemplates() : Promise.resolve(null),
    family ? loadInfoPelatih() : Promise.resolve([] as PengumumanView[]),
  ]);

  return (
    <div className="page dash">
      {params.password === "diganti" ? <Notice tone="success">Password berhasil diganti. Perangkat lain sudah otomatis keluar.</Notice> : null}
      {canManageStudents(actor) && academic.kind === "staff" && templates ? <AdminHome actor={actor} overview={overview} academic={academic} money={money} samapta={samaptaStaff} templates={templates} /> : null}
      {role === "PENGAJAR" && academic.kind === "staff" ? <TeacherHome actor={actor} overview={overview} academic={academic} samapta={samaptaStaff} /> : null}
      {family && academic.kind === "family" ? <FamilyHome actor={actor} academic={academic} money={money} samapta={samaptaMine} info={info} /> : null}
    </div>
  );
}

const firstName = (actor: Actor) => actor.user.nama.split(/\s+/)[0];

function heroText(chips: HeroChip[], none: string) {
  return chips.length ? `Ada ${chips.length} hal yang perlu Anda tindak hari ini.` : none;
}

function sessionItems(sessions: SessionCard[]): ListItem[] {
  return sessions.map((s) => ({
    key: s.sesi_id,
    icon: "clock",
    tone: s.status === "AKTIF" ? "green" : "blue",
    title: `${s.jam_mulai}–${s.jam_selesai} · ${s.nama}`,
    sub: `${s.kelas} · ${s.bidang} · ${s.menunggu ? `${s.menunggu} menunggu pengesahan` : SESSION_STATUS_LABEL[s.status]}`,
    href: `/akademik/sesi/${s.sesi_id}`,
  }));
}

function lowAttendanceItems(academic: StaffAcademic, limit: number): ListItem[] {
  return academic.lowAttendance.slice(0, limit).map(({ student, summary }) => ({
    key: `low-${student.siswa_id}`,
    icon: "userAlert",
    tone: "red",
    title: `${student.nama} ${fmtPercent(summary.persen)}`,
    sub: `Hadir ${summary.hadir} dari ${summary.total} sesi bulan ini`,
    href: `/siswa/${student.siswa_id}`,
  }));
}

/** Sesi hari ini untuk kartu "Hari ini" owner: nama sesi, jam, jumlah hadir/menunggu, dan statusnya. */
function sesiHariIni(sessions: SessionCard[]): SesiHariIni[] {
  return sessions.map((s) => {
    const jam = `${s.jam_mulai}–${s.jam_selesai}`;
    const isi =
      s.status === "AKAN_DATANG"
        ? `${jam} · ${s.bidang}`
        : `${jam} · ${s.hadir} hadir${s.menunggu ? `, ${s.menunggu} menunggu` : ""}`;
    return { key: s.sesi_id, title: s.nama, sub: isi, status: s.status, href: `/akademik/sesi/${s.sesi_id}` };
  });
}

/** Siswa hadir < 75% bulan ini, masing-masing dengan pesan WA wali dari template "kehadiran". */
function perluPerhatian(academic: StaffAcademic, templates: Record<WaJenis, string>): PerluPerhatian[] {
  const bulan = monthLabel(academic.clock.periode);
  return academic.lowAttendance.map(({ student, summary }) => ({
    key: `low-${student.siswa_id}`,
    title: `${student.nama} · ${fmtPercent(summary.persen)}`,
    sub: `Hadir ${summary.hadir} dari ${summary.total} sesi bulan ini`,
    href: `/siswa/${student.siswa_id}`,
    wa: {
      nomor: nomorWa(student.no_wa_wali),
      pesan: isiTemplate(templates.kehadiran, {
        nama: student.nama,
        bulan,
        persen: fmtPercent(summary.persen),
        hadir: summary.hadir,
        sesi: summary.total,
        izin: summary.izin,
        sakit: summary.sakit,
        alfa: summary.alfa,
        lembaga: academic.clock.settings.nama_lembaga,
      }),
      untuk: `Wali ${student.nama}${student.nama_wali ? ` (${student.nama_wali})` : ""} · ${formatPhone(student.no_wa_wali)}`,
    },
  }));
}

/** Tes terbaru, tes yang masih berjalan, dan pos yang paling tertinggal isiannya. */
function samaptaFocus(samapta: SamaptaStaff | null) {
  const latest = samapta?.tests.find((s) => s.test.status !== "DIBATALKAN") ?? null;
  const running = samapta?.tests.find((s) => s.test.status === "BERJALAN") ?? null;
  const behind = running ? POS.map((pos) => ({ pos, count: running.progress[pos] })).sort((a, b) => a.count - b.count)[0] : null;
  const gap = running && behind && behind.count < running.peserta ? { ...behind, summary: running } : null;
  return { latest, running, gap, settings: samapta?.settings ?? null };
}

// ---------------------------------------------------------------- Pemilik & admin

function AdminHome({
  actor,
  overview,
  academic,
  money,
  samapta,
  templates,
}: {
  actor: Actor;
  overview: Overview;
  academic: StaffAcademic;
  money: FinanceHome;
  samapta: SamaptaStaff | null;
  templates: Record<WaJenis, string>;
}) {
  const finance = money?.kind === "staff" && money.ready ? money : null;
  const { latest, running, gap } = samaptaFocus(samapta);
  const chips: HeroChip[] = [];
  if (academic.pending) chips.push({ icon: "clipboard", label: `${academic.pending} pengajuan hadir menunggu`, href: "/akademik" });
  if (FITUR.tagihan && finance && finance.overdue > 0) chips.push({ icon: "receipt", label: `${rpShort(finance.overdue)} lewat jatuh tempo`, href: "/keuangan/tagihan?status=JATUH_TEMPO" });
  if (academic.lowAttendance.length) chips.push({ icon: "userAlert", label: `${academic.lowAttendance.length} siswa hadir < 75%`, href: "/akademik?tab=rekap" });
  if (gap) chips.push({ icon: "run", label: `${POS_INFO[gap.pos].short} ${gap.summary.test.nama}: ${gap.count}/${gap.summary.peserta} terisi`, href: `/samapta/${gap.summary.test.tes_id}?tab=pos&pos=${gap.pos}` });
  if (FITUR.tugas && academic.unchecked) chips.push({ icon: "file", label: `${academic.unchecked} tugas belum dinilai`, href: "/akademik/tugas" });

  const klasSegments: Segment[] = latest ? KLASIFIKASI.map((k) => ({ label: k, value: latest.klas[k] })).filter((s) => s.value > 0) : [];
  const tracks: Segment[] = [
    { label: "TNI", value: overview.byTrack.TNI },
    { label: "Polri", value: overview.byTrack.Polri },
    { label: "Kedinasan", value: overview.byTrack.Kedinasan },
  ].filter((s) => s.value > 0);
  if (overview.byTrack.lainnya) tracks.push({ label: "Belum diisi", value: overview.byTrack.lainnya });

  const kpis: KpiMiniItem[] = [
    { key: "siswa", label: "Siswa", value: `${overview.activeStudents}/${overview.capacity}`, meter: { value: overview.activeStudents, max: overview.capacity }, href: "/siswa" },
    { key: "hadir", label: "Kehadiran", value: fmtPercent(academic.attendance), note: monthLabel(academic.clock.periode).split(" ")[0], href: "/akademik?tab=rekap" },
    {
      key: "samapta",
      label: latest ? latest.test.nama.replace(/^Tes\s+/i, "") : "Samapta",
      value: latest?.rata != null ? fmtNumber(latest.rata, 2) : "-",
      note: latest ? "rata-rata" : "belum ada tes",
      href: latest ? `/samapta/${latest.test.tes_id}?tab=hasil` : "/samapta",
    },
    finance
      ? { key: "saldo", label: "Saldo", prefix: finance.balance === null ? undefined : "Rp", value: finance.balance === null ? "-" : rpShort(finance.balance).replace("Rp", ""), note: "kas + bank", href: "/keuangan" }
      : { key: "sesi", label: "Sesi hari ini", value: String(academic.todays.length), note: "jadwal hari ini", href: "/akademik" },
  ];

  return (
    <>
      <Hero eyebrow={formatToday()} title={`${greeting()}, ${firstName(actor)}`} text={heroText(chips, "Tidak ada yang perlu ditindak saat ini. Semua berjalan sesuai jadwal.")} chips={chips} />

      <HariIniCard
        sessions={sesiHariIni(academic.todays)}
        perhatian={perluPerhatian(academic, templates)}
        action={{ href: "/akademik", label: "Presensi" }}
        empty={
          <>
            Tidak ada sesi hari ini. <Link href="/akademik?tab=jadwal">Buat sesi</Link>
          </>
        }
      />

      <KpiMini items={kpis} />

      <div className="dash-grid-2">
        <AttendanceChart title={`Kehadiran ${academic.trend.length} hari terakhir`} sub="Persentase hadir per hari sesi" points={academic.trend} />
        {klasSegments.length ? (
          <DonutCard title={`Klasifikasi ${latest!.test.nama}`} sub={`${latest!.lengkap} dari ${latest!.peserta} siswa sudah lengkap`} segments={klasSegments} unit="siswa" />
        ) : (
          <DonutCard title="Siswa per jalur" sub={`${overview.activeStudents} siswa aktif`} segments={tracks} unit="siswa" />
        )}
      </div>

      <div className="dash-grid-2">
        {finance ? (
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Keuangan {monthLabel(academic.clock.periode)}</h2>
                <p>{FITUR.tagihan ? "Arus kas bulan berjalan dan piutang siswa" : "Pemasukan dan pengeluaran yang dicatat bulan ini"}</p>
              </div>
              <Link href="/keuangan" className="btn btn-secondary btn-sm">
                Buka keuangan
              </Link>
            </div>
            <div className="money-grid">
              <div>
                <span>Uang masuk</span>
                <b className="n">{rp(finance.incoming)}</b>
              </div>
              <div>
                <span>Uang keluar</span>
                <b className="n">{rp(finance.outgoing)}</b>
              </div>
              {FITUR.tagihan ? (
                <div>
                  <span>Piutang siswa</span>
                  <b className="n">{rp(finance.outstanding)}</b>
                  {finance.overdue ? <Badge tone="danger">{rp(finance.overdue)} lewat jatuh tempo</Badge> : null}
                </div>
              ) : (
                <div>
                  <span>Selisih</span>
                  <b className="n">{rp(finance.incoming - finance.outgoing)}</b>
                </div>
              )}
            </div>
          </section>
        ) : (
          <SamaptaCard latest={latest} />
        )}
        <Shortcuts
          items={[
            { href: "/akademik", icon: "qr", tone: "green", title: "Buka sesi presensi", sub: "QR sesi dan pengajuan hadir" },
            { href: running ? `/samapta/${running.test.tes_id}?tab=pos` : "/samapta", icon: "run", tone: "gold", title: "Isi tes samapta per pos", sub: "Nilai langsung dari lapangan" },
            ...(canRecordFinance(actor)
              ? [
                  FITUR.tagihan
                    ? { href: "/keuangan/tagihan", icon: "receipt" as const, tone: "violet" as const, title: "Catat pembayaran", sub: "Cicilan dan kuitansi" }
                    : { href: "/keuangan/transaksi", icon: "wallet" as const, tone: "violet" as const, title: "Catat pemasukan/pengeluaran", sub: "Laporan dibuat otomatis" },
                ]
              : []),
            { href: "/siswa/baru", icon: "plus", tone: "blue", title: "Tambah siswa", sub: "Akun siswa dibuat otomatis" },
          ]}
        />
      </div>
    </>
  );
}

function SamaptaCard({ latest }: { latest: ReturnType<typeof samaptaFocus>["latest"] }) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>{latest ? latest.test.nama : "Tes Samapta"}</h2>
          <p>{latest ? `${formatDate(latest.test.tanggal, "long")} · ${latest.test.tempat}` : "Belum ada sesi tes."}</p>
        </div>
        <Link href={latest ? `/samapta/${latest.test.tes_id}?tab=hasil` : "/samapta"} className="btn btn-secondary btn-sm">
          {latest ? "Hasil" : "Buat tes"}
        </Link>
      </div>
      {latest ? (
        <div className="money-grid">
          <div>
            <span>Rata-rata hasil akhir</span>
            <b className="n">{fmtNumber(latest.rata, 2)}</b>
          </div>
          <div>
            <span>Baik Sekali</span>
            <b className="n">{latest.klas["Baik Sekali"]} siswa</b>
          </div>
          <div>
            <span>Perlu pembinaan</span>
            <b className="n">{latest.klas.Cukup + latest.klas.Kurang} siswa</b>
          </div>
        </div>
      ) : (
        <p className="muted">Buat sesi tes, isi hasil per pos dari HP, lalu cetak blangko A4.</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Pengajar (peran disembunyikan, tetap berfungsi)

function TeacherHome({ actor, overview, academic, samapta }: { actor: Actor; overview: Overview; academic: StaffAcademic; samapta: SamaptaStaff | null }) {
  const { latest, gap } = samaptaFocus(samapta);
  const chips: HeroChip[] = [];
  if (academic.pending) chips.push({ icon: "clipboard", label: `${academic.pending} pengajuan hadir menunggu`, href: "/akademik" });
  if (gap) chips.push({ icon: "run", label: `${POS_INFO[gap.pos].short}: ${gap.count}/${gap.summary.peserta} terisi`, href: `/samapta/${gap.summary.test.tes_id}?tab=pos&pos=${gap.pos}` });
  if (FITUR.tugas && academic.unchecked) chips.push({ icon: "file", label: `${academic.unchecked} tugas belum dinilai`, href: "/akademik/tugas" });
  if (academic.lowAttendance.length)
    chips.push({ icon: "userAlert", label: `${academic.lowAttendance.length} siswa hadir < 75%`, href: `/siswa/${academic.lowAttendance[0]!.student.siswa_id}` });
  const persen = academic.attendance === null ? 0 : Math.round(academic.attendance);

  return (
    <>
      <div className="dash-hero-row">
        <Hero
          eyebrow={formatToday()}
          title={`${greeting()}, ${firstName(actor)}`}
          text={heroText(chips, academic.todays.length ? `Ada ${academic.todays.length} sesi hari ini.` : "Tidak ada sesi dan tindakan tertunda hari ini.")}
          chips={chips}
          action={{ href: "/akademik", label: academic.todays.length ? "Buka sesi hari ini" : "Lihat presensi" }}
        />
        <RingCard title="Kehadiran siswa" sub={monthLabel(academic.clock.periode)} value={persen} max={100} display={fmtPercent(academic.attendance)} caption={disciplineLabel(academic.attendance)} />
      </div>

      <div className="kpi-grid">
        <Kpi icon="clock" tone="green" value={String(academic.todays.length)} label="Sesi hari ini" href="/akademik" />
        <Kpi icon="school" tone="blue" value={String(overview.myClasses.length)} label="Kelas yang diajar" />
        <Kpi icon="run" tone="violet" value={latest?.rata != null ? fmtNumber(latest.rata, 2) : "-"} label={latest ? `Rata-rata ${latest.test.nama}` : "Belum ada Tes Samapta"} href="/samapta" />
        <Kpi icon="calendar" tone="gold" value={fmtPercent(academic.attendance)} label="Kehadiran bulan ini" href="/akademik" />
      </div>

      <div className="dash-grid-2">
        <AttendanceChart title={`Kehadiran ${academic.trend.length} hari terakhir`} sub="Siswa di sesi Anda" points={academic.trend} />
        <ListCard title="Hari ini" sub="Buka sesi, tampilkan QR, lalu sahkan pengajuan" items={[...sessionItems(academic.todays), ...lowAttendanceItems(academic, 2)]} empty="Tidak ada sesi hari ini." action={{ href: "/akademik", label: "Presensi" }} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Siswa & wali

function FamilyHome({ actor, academic, money, samapta, info }: { actor: Actor; academic: FamilyAcademic; money: FinanceHome; samapta: SamaptaMine; info: PengumumanView[] }) {
  const wali = actor.user.peran === "WALI";
  if (academic.family.length === 0) {
    return (
      <>
        <Hero eyebrow={formatToday()} title={`${greeting()}, ${firstName(actor)}`} text="Akun Anda belum tertaut ke data siswa." />
        <InfoPelatihCard items={info} />
        <Empty title="Belum tertaut">Minta admin menautkan data siswa ke akun Anda.</Empty>
      </>
    );
  }
  const first = academic.family[0]!;
  const history = samapta?.history ?? [];
  const latest = history.at(-1) ?? null;
  const previous = history.length > 1 ? history.at(-2)! : null;
  const chips: HeroChip[] = [];
  for (const item of academic.family) {
    const active = item.todays.find((s) => s.status === "AKTIF" && (!s.record || s.record.status === "KOSONG"));
    if (active && !wali) chips.push({ icon: "clipboard", label: `Sesi berlangsung: ajukan hadir`, href: "/akademik" });
    if (FITUR.tugas && item.dueSoon.length && !wali) chips.push({ icon: "file", label: `${item.dueSoon.length} tugas mendekati tenggat`, href: "/akademik/tugas" });
  }
  if (money?.kind === "family") {
    const overdue = money.children.reduce((sum, c) => sum + c.overdue, 0);
    const next = money.children.map((c) => c.next).filter((n) => n !== null).sort((a, b) => a!.date.localeCompare(b!.date))[0];
    if (overdue > 0) chips.push({ icon: "receipt", label: `${rpShort(overdue)} lewat jatuh tempo`, href: "/keuangan/tagihan" });
    else if (next) chips.push({ icon: "receipt", label: `Cicilan berikutnya ${formatDate(next.date)} · ${rpShort(next.amount)}`, href: "/keuangan/tagihan" });
  }
  if (latest?.entry.score.klas) chips.push({ icon: "run", label: `${latest.test.nama}: ${latest.entry.score.klas}`, href: "/samapta" });
  const sessionsToday = academic.family.reduce((sum, item) => sum + item.todays.length, 0);

  return (
    <>
      <div className="dash-hero-row">
        <Hero
          eyebrow={formatToday()}
          title={`${greeting()}, ${wali ? firstName(actor) : first.student.nama.split(/\s+/).find((w) => !/^(muh\.?|muhamad|muhammad|a\.?)$/i.test(w)) ?? firstName(actor)}`}
          text={chips.length ? `Ada ${chips.length} hal yang perlu kamu perhatikan.` : sessionsToday ? `Ada ${sessionsToday} sesi hari ini.` : wali ? "Perkembangan anak yang ditautkan ke akun Anda." : "Tidak ada sesi hari ini. Tetap semangat berlatih."}
          chips={chips}
          action={wali && FITUR.tagihan ? { href: "/keuangan/tagihan", label: "Lihat tagihan" } : { href: "/akademik", label: "Buka presensi" }}
        />
        {/* Di ponsel tepat di bawah sapaan; di layar lebar selebar baris di bawah sapaan dan kehadiran. */}
        <InfoPelatihCard items={info} />
        <RingCard
          title={wali && academic.family.length > 1 ? `Kehadiran ${first.student.nama.split(/\s+/)[0]}` : "Kehadiran bulan ini"}
          sub={monthLabel(academic.clock.periode)}
          value={first.summary.persen === null ? 0 : Math.round(first.summary.persen)}
          max={100}
          display={fmtPercent(first.summary.persen)}
          caption={`Hadir ${first.summary.hadir} dari ${first.summary.total} sesi · ${disciplineLabel(first.summary.persen)}`}
        />
      </div>

      {academic.family.map((item) => {
        const bill = money?.kind === "family" ? money.children.find((c) => c.siswa_id === item.student.siswa_id) : undefined;
        return (
          <div className="dash" key={item.student.siswa_id}>
            {wali ? (
              <div className="row spread">
                <h2 className="section-title">{item.student.nama}</h2>
                <Link href={`/siswa/${item.student.siswa_id}`} className="btn btn-secondary btn-sm">
                  Profil
                </Link>
              </div>
            ) : null}
            <div className="kpi-grid">
              <Kpi icon="calendar" tone="green" value={fmtPercent(item.summary.persen)} label={`Kehadiran ${monthLabel(academic.clock.periode)}`} href="/akademik" />
              {!wali ? (
                <>
                  <Kpi
                    icon="run"
                    tone="gold"
                    value={latest?.entry.score.akhir != null ? fmtNumber(latest.entry.score.akhir, 2) : "-"}
                    label={latest ? `${latest.test.nama}${latest.entry.score.klas ? ` · ${latest.entry.score.klas}` : " · belum lengkap"}` : "Belum ada Tes Samapta"}
                    href="/samapta"
                  />
                  <Kpi icon="trophy" tone="violet" value={latest?.entry.rank ? `#${latest.entry.rank}` : "-"} unit={latest?.entry.rank ? `dari ${latest.peserta}` : undefined} label="Peringkat tes terakhir" href="/samapta" />
                </>
              ) : null}
              {FITUR.rapor ? (
                <Kpi
                  icon="file"
                  tone="blue"
                  value={item.latestReport ? monthLabel(item.latestReport.periode) : "-"}
                  label={item.latestReport ? `Rapor terbaru · versi ${item.latestReport.versi}` : "Belum ada rapor terbit"}
                  href={item.latestReport ? `/akademik/rapor/${item.student.siswa_id}?periode=${item.latestReport.periode}` : "/akademik/rapor"}
                />
              ) : null}
              {money?.kind === "family" ? (
                <Kpi icon="wallet" tone="red" value={bill ? (bill.remaining ? rpShort(bill.remaining) : "Lunas") : "-"} label={bill?.next ? `Sisa tagihan · jatuh tempo ${formatDate(bill.next.date)}` : "Sisa tagihan"} href="/keuangan/tagihan" />
              ) : null}
            </div>
            <div className="dash-grid-2">
              <ListCard
                title="Sesi hari ini"
                sub={item.kelas || "Semua siswa"}
                items={item.todays.map((s) => ({
                  key: s.sesi_id,
                  icon: "clock",
                  tone: s.status === "AKTIF" ? "green" : "blue",
                  title: `${s.jam_mulai}–${s.jam_selesai} · ${s.nama}`,
                  sub: s.bidang,
                  href: wali ? undefined : "/akademik",
                  side: s.record && s.record.status !== "KOSONG" ? <AttendanceBadge status={s.record.status} late={s.record.terlambat} /> : <SessionStatusBadge status={s.status} />,
                }))}
                empty="Tidak ada sesi hari ini."
                action={!wali ? { href: "/akademik", label: "Presensi" } : undefined}
              />
              {!wali ? (
                <ListCard
                  title="Perkembangan samapta"
                  sub={previous ? `${previous.test.nama} → ${latest!.test.nama}` : latest ? latest.test.nama : "Belum ada tes"}
                  items={
                    latest
                      ? [
                          { label: "Garjas A (lari 12 menit)", now: latest.entry.score.garjasA, before: previous?.entry.score.garjasA ?? null },
                          { label: "Garjas B", now: latest.entry.score.garjasB, before: previous?.entry.score.garjasB ?? null },
                          { label: "Hasil akhir", now: latest.entry.score.akhir, before: previous?.entry.score.akhir ?? null },
                        ].map((row) => {
                          const diff = row.now !== null && row.before !== null ? row.now - row.before : null;
                          return {
                            key: row.label,
                            icon: "run" as const,
                            tone: diff === null ? ("blue" as const) : diff >= 0 ? ("green" as const) : ("red" as const),
                            title: `${row.label}: ${fmtNumber(row.now, 2)}`,
                            sub: diff === null ? "Belum ada pembanding" : `${diff >= 0 ? "Naik" : "Turun"} ${fmtNumber(Math.abs(diff), 2)} dari ${fmtNumber(row.before, 2)}`,
                            href: "/samapta",
                          };
                        })
                      : []
                  }
                  empty="Hasil muncul setelah pelatih mengisi tes samapta."
                  action={{ href: "/samapta", label: "Hasil" }}
                />
              ) : FITUR.tagihan ? (
                <section className="card">
                  <div className="card-head">
                    <h2>Tagihan</h2>
                    <Link href="/keuangan/tagihan" className="btn btn-secondary btn-sm">
                      Rincian
                    </Link>
                  </div>
                  {bill ? (
                    <div className="money-grid">
                      <div>
                        <span>Sisa tagihan</span>
                        <b className="n">{rp(bill.remaining)}</b>
                      </div>
                      <div>
                        <span>Lewat jatuh tempo</span>
                        <b className="n">{bill.overdue ? rp(bill.overdue) : "Tidak ada"}</b>
                      </div>
                      <div>
                        <span>Jatuh tempo berikutnya</span>
                        <b className="n">{bill.next ? `${formatDate(bill.next.date)}` : "-"}</b>
                        {bill.next ? <span className="muted small">{rp(bill.next.amount)}</span> : null}
                      </div>
                    </div>
                  ) : (
                    <p className="muted">Belum ada tagihan.</p>
                  )}
                </section>
              ) : null}
            </div>
          </div>
        );
      })}
    </>
  );
}
