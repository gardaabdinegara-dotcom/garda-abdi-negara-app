// Klasemen latihan: posisi siswa, klasemen umum dan per jenis, tingkat, dan lencana.
// Komponen server tanpa JavaScript tambahan: tab memakai tautan ?jenis=, batang memakai SVG dan <meter>.
import Link from "next/link";
import { JENIS_INFO, JENIS_LATIHAN, type JenisLatihan } from "@/lib/core/latihan";
import {
  gerakUmum,
  inisial,
  MIN_LATIHAN,
  POIN_PERINGKAT,
  rentangMinggu,
  singkatanZona,
  TINGKAT,
  type Gerak,
  type KlasemenMinggu,
  type KodeLencana,
  type Lencana,
  type TingkatJenis,
} from "@/lib/core/latihan-klasemen";
import type { DataKlasemen } from "@/lib/server/latihan";
import { Icon, type IconName } from "./icon";
import { IKON_LATIHAN } from "./latihan-hasil";
import { Empty, PageHead } from "./ui";

export type TabKlasemen = "umum" | JenisLatihan;
export const tabKlasemen = (v: unknown): TabKlasemen => ((JENIS_LATIHAN as readonly string[]).includes(String(v)) ? (v as JenisLatihan) : "umum");

const satuDesimal = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const d1 = (v: number) => satuDesimal.format(v);
const pendek: Record<JenisLatihan, string> = { kraepelin: "Kraepelin", pauli: "Pauli", angka: "Angka", simbol: "Simbol" };
const hrefTab = (tab: TabKlasemen) => (tab === "umum" ? "/latihan/klasemen" : `/latihan/klasemen?jenis=${tab}`);
const IKON_LENCANA: Record<KodeLencana, IconName> = {
  juara_jenis: "trophy",
  rekor_pribadi: "star",
  naik_tingkat: "levelUp",
  lengkap_4: "grid",
  stabil: "wave",
  tahan_uji: "shield",
  beruntun_7: "flame",
  podium_umum: "podium",
  emas_semua: "medal",
  juara_umum: "crown",
};

function Tingkat({ indeks }: { indeks: number }) {
  const t = TINGKAT[indeks]!;
  return <span className={`kl-tier t-${t.kode}`}>{t.nama}</span>;
}

function Panah({ gerak }: { gerak: Gerak | null }) {
  if (!gerak) return null;
  if (gerak.arah === "baru") return <span className="kl-move baru">baru</span>;
  if (gerak.arah === "tetap") return <span className="kl-move tetap">tetap</span>;
  return (
    <span className={`kl-move ${gerak.arah}`}>
      <svg viewBox="0 0 10 10" aria-hidden="true">
        <path d={gerak.arah === "naik" ? "M5 1l4 7H1z" : "M5 9 1 2h8z"} />
      </svg>
      {gerak.selisih}
      <span className="sr-only"> peringkat {gerak.arah} dari kemarin</span>
    </span>
  );
}

function Avatar({ nama }: { nama: string }) {
  return (
    <span className="kl-av" aria-hidden="true">
      {inisial(nama)}
    </span>
  );
}

// ---------------------------------------------------------------- Kartu posisi

function teksGerak(g: Gerak | null) {
  if (!g) return null;
  if (g.arah === "naik") return <><span className="kl-up">▲ naik {g.selisih}</span> dari kemarin. </>;
  if (g.arah === "turun") return <><span className="kl-down">▼ turun {g.selisih}</span> dari kemarin. </>;
  if (g.arah === "baru") return <>Baru masuk klasemen hari ini. </>;
  return <>Sama seperti kemarin. </>;
}

function dorongan(sekarang: KlasemenMinggu, id: string): string | null {
  for (const kurang of [1, 2]) {
    const j = JENIS_LATIHAN.find((x) => !sekarang.jenis[x].baris.some((b) => b.siswa_id === id) && sekarang.jenis[x].peserta[id]?.jumlah === MIN_LATIHAN - kurang);
    if (j) return `${kurang === 1 ? "Satu" : "Dua"} latihan ${pendek[j]} Standar lagi dan kamu ikut klasemen ${pendek[j]}. Peringkat 8 pun sudah dapat 1 poin.`;
  }
  const batas = POIN_PERINGKAT.length;
  for (const j of JENIS_LATIHAN) {
    const baris = sekarang.jenis[j].baris;
    const saya = baris.find((b) => b.siswa_id === id);
    const kedelapan = baris[batas - 1];
    if (saya && saya.peringkat > batas && kedelapan) return `Naikkan rata-rata ${pendek[j]} ${d1(kedelapan.nilai - saya.nilai)} lagi untuk masuk 8 besar dan dapat poin.`;
  }
  return null;
}

function KartuSiswa({ data, tab, id }: { data: DataKlasemen; tab: TabKlasemen; id: string }) {
  const { sekarang } = data;
  const atasKartu = <KepalaKartu data={data} />;
  if (tab === "umum") {
    const r = sekarang.umum.find((x) => x.siswa_id === id);
    const atas = r ? sekarang.umum[r.peringkat - 2] : undefined;
    const ajak = dorongan(sekarang, id);
    return (
      <section className="kl-hero" aria-label="Posisi kamu">
        {atasKartu}
        <div className="kl-hero-main">
          <div className="kl-rank">
            <b>{r ? r.peringkat : "–"}</b>
            <span>{r ? `dari ${sekarang.umum.length}` : "peringkat"}</span>
          </div>
          <div>
            <h2>{r ? `${r.poin} poin` : "Belum dapat poin"}</h2>
            <p>
              {r ? (
                <>
                  {teksGerak(gerakUmum(sekarang, data.kemarin, id))}
                  {atas
                    ? atas.poin > r.poin
                      ? `Kurang ${atas.poin - r.poin} poin untuk menyusul peringkat ${atas.peringkat}.`
                      : `Poin sama dengan peringkat ${atas.peringkat}; rata-rata nilai yang menentukan.`
                    : "Kamu memimpin klasemen umum."}
                </>
              ) : (
                `Masuk 8 besar satu jenis untuk dapat poin. Setiap jenis butuh ${MIN_LATIHAN} latihan Standar minggu ini.`
              )}
            </p>
          </div>
        </div>
        <div className="kl-hero-jenis">
          {JENIS_LATIHAN.map((j) => {
            const b = sekarang.jenis[j].baris.find((x) => x.siswa_id === id);
            const n = sekarang.jenis[j].peserta[id]?.jumlah ?? 0;
            return b ? (
              <Link key={j} href={hrefTab(j)} scroll={false}>
                <i>{IKON_LATIHAN[j]}</i>
                <b>#{b.peringkat}</b>
                <span>+{b.poin} poin</span>
              </Link>
            ) : (
              <Link key={j} className="is-kurang" href={hrefTab(j)} scroll={false}>
                <i>{IKON_LATIHAN[j]}</i>
                <b>{n}/{MIN_LATIHAN}</b>
                <span>latihan</span>
              </Link>
            );
          })}
        </div>
        {ajak ? (
          <p className="kl-nudge">
            <Icon name="info" />
            <span>{ajak}</span>
          </p>
        ) : null}
      </section>
    );
  }

  const k = sekarang.jenis[tab];
  const b = k.baris.find((x) => x.siswa_id === id);
  const p = k.peserta[id];
  const nama = pendek[tab];
  const atas = b ? k.baris[b.peringkat - 2] : undefined;
  return (
    <section className="kl-hero" aria-label={`Posisi kamu di ${JENIS_INFO[tab].nama}`}>
      {atasKartu}
      <div className="kl-hero-main">
        <div className="kl-rank">
          <b>{b ? b.peringkat : `${p?.jumlah ?? 0}/${MIN_LATIHAN}`}</b>
          <span>{b ? `dari ${k.baris.length}` : "latihan"}</span>
        </div>
        <div>
          <h2>{b ? `${d1(b.nilai)} rata-rata` : `Belum masuk klasemen ${nama}`}</h2>
          <p>
            {b ? (
              <>
                Dari 3 skor terbaikmu {b.terbaik.join(" · ")}.{" "}
                {atas
                  ? atas.nilai > b.nilai
                    ? `Kurang ${d1(atas.nilai - b.nilai)} untuk menyusul peringkat ${atas.peringkat}. `
                    : `Nilai sama dengan peringkat ${atas.peringkat}; skor tunggal terbaik yang menentukan. `
                  : "Kamu memimpin klasemen ini. "}
                {b.poin ? (
                  <>
                    Sumbang <b>+{b.poin} poin</b> ke klasemen umum.
                  </>
                ) : (
                  "Masuk 8 besar untuk dapat poin."
                )}
              </>
            ) : (
              `${p ? `Skor minggu ini ${p.skor.join(" · ")}. ` : ""}Butuh ${MIN_LATIHAN - (p?.jumlah ?? 0)} latihan Standar lagi minggu ini.`
            )}
          </p>
        </div>
      </div>
      <Link className="kl-cta" href={`/kerjakan/${tab}?durasi=standar`}>
        Latihan {nama} Standar
      </Link>
    </section>
  );
}

function KepalaKartu({ data }: { data: DataKlasemen }) {
  return (
    <div className="kl-hero-top">
      <b>{rentangMinggu(data.dari, data.sampai)}</b>
      <span className="kl-chip-dark">Tutup Minggu 23.59 {singkatanZona(data.zona)}</span>
    </div>
  );
}

function KartuPelatih({ data }: { data: DataKlasemen }) {
  const { sekarang } = data;
  const latihan = data.peserta - sekarang.belumLatihan;
  const pemimpin = sekarang.umum[0];
  return (
    <section className="kl-hero" aria-label="Ringkasan minggu ini">
      <KepalaKartu data={data} />
      <div className="kl-hero-main">
        <div className="kl-rank">
          <b>{sekarang.umum.length}</b>
          <span>dapat poin</span>
        </div>
        <div>
          <h2>
            {latihan} dari {data.peserta} siswa latihan Standar
          </h2>
          <p>{pemimpin ? `Sementara dipimpin ${data.nama[pemimpin.siswa_id] ?? "siswa"} dengan ${pemimpin.poin} poin.` : "Belum ada siswa yang dapat poin minggu ini."}</p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Papan klasemen

function Podium({ items }: { items: { id: string; nama: string; peringkat: number; nilai: string; kamu: boolean }[] }) {
  const urut = [items[1], items[0], items[2]].filter((x) => x !== undefined);
  return (
    <div className="kl-podium">
      {urut.map((x) => (
        <div key={x.id} className={`kl-pod p${x.peringkat}`}>
          {x.kamu ? <span className="kl-kamu-tag">Kamu</span> : null}
          <Avatar nama={x.nama} />
          <b>{x.nama}</b>
          <small>{x.nilai}</small>
          <div className="kl-step">
            <span className="sr-only">Peringkat </span>
            {x.peringkat}
          </div>
        </div>
      ))}
    </div>
  );
}

function Nama({ nama, kamu }: { nama: string; kamu: boolean }) {
  return (
    <b>
      {nama}
      {kamu ? <span className="kl-kamu-tag">Kamu</span> : null}
    </b>
  );
}

function PapanUmum({ data, id }: { data: DataKlasemen; id: string | null }) {
  const { sekarang } = data;
  const nama = (sid: string) => data.nama[sid] ?? "Siswa";
  const catatan = [
    sekarang.tanpaPoin ? `${sekarang.tanpaPoin} siswa lain sudah latihan Standar tetapi belum dapat poin.` : "",
    sekarang.belumLatihan ? `${sekarang.belumLatihan} siswa belum latihan Standar minggu ini.` : "",
  ].filter(Boolean);
  return (
    <section className="card kl-board" aria-labelledby="kl-papan-h">
      <div className="kl-board-head">
        <h2 id="kl-papan-h">Klasemen umum</h2>
        <span>Jumlah poin 4 jenis</span>
      </div>
      {sekarang.umum.length === 0 ? (
        <Empty title="Belum ada yang dapat poin">Poin didapat dari 8 besar tiap jenis. Setiap jenis butuh {MIN_LATIHAN} latihan Standar minggu ini.</Empty>
      ) : (
        <>
          <Podium items={sekarang.umum.slice(0, 3).map((r) => ({ id: r.siswa_id, nama: nama(r.siswa_id), peringkat: r.peringkat, nilai: `${r.poin} poin`, kamu: r.siswa_id === id }))} />
          {sekarang.umum.length > 3 ? (
            <ol className="kl-list">
              {sekarang.umum.slice(3).map((r) => (
                <li key={r.siswa_id} className={r.siswa_id === id ? "kl-row is-kamu" : "kl-row"}>
                  <span className="kl-no">{r.peringkat}</span>
                  <Avatar nama={nama(r.siswa_id)} />
                  <span className="kl-who">
                    <Nama nama={nama(r.siswa_id)} kamu={r.siswa_id === id} />
                    <span className="kl-sub">
                      {JENIS_LATIHAN.map((j) => (
                        <span key={j} className={r.jenis[j]?.poin ? `kl-mini j-${j}` : "kl-mini is-nol"} title={JENIS_INFO[j].nama}>
                          <i>{IKON_LATIHAN[j]}</i>
                          {r.jenis[j]?.poin ?? 0}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="kl-val">
                    <b>{r.poin}</b>
                    <Panah gerak={gerakUmum(sekarang, data.kemarin, r.siswa_id)} />
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      )}
      {catatan.length ? <p className="kl-foot">{catatan.join(" ")}</p> : null}
    </section>
  );
}

function PapanJenis({ data, jenis, id }: { data: DataKlasemen; jenis: JenisLatihan; id: string | null }) {
  const k = data.sekarang.jenis[jenis];
  const nama = (sid: string) => data.nama[sid] ?? "Siswa";
  return (
    <section className="card kl-board" aria-labelledby="kl-papan-h">
      <div className="kl-board-head">
        <h2 id="kl-papan-h">Klasemen {JENIS_INFO[jenis].nama}</h2>
        <span>Rata-rata 3 skor terbaik</span>
      </div>
      {k.baris.length === 0 ? (
        <Empty title="Belum ada yang masuk klasemen">Siswa masuk klasemen setelah {MIN_LATIHAN} latihan {JENIS_INFO[jenis].nama} Standar minggu ini.</Empty>
      ) : (
        <>
          <Podium items={k.baris.slice(0, 3).map((b) => ({ id: b.siswa_id, nama: nama(b.siswa_id), peringkat: b.peringkat, nilai: `${d1(b.nilai)} · +${b.poin} poin`, kamu: b.siswa_id === id }))} />
          {k.baris.length > 3 ? (
            <ol className="kl-list">
              {k.baris.slice(3).map((b) => (
                <li key={b.siswa_id} className={b.siswa_id === id ? "kl-row is-kamu" : "kl-row"}>
                  <span className="kl-no">{b.peringkat}</span>
                  <Avatar nama={nama(b.siswa_id)} />
                  <span className="kl-who">
                    <Nama nama={nama(b.siswa_id)} kamu={b.siswa_id === id} />
                    <span className="kl-sub">{b.jumlah} latihan</span>
                  </span>
                  <span className="kl-val">
                    <b>{d1(b.nilai)}</b>
                    <span className={b.poin ? "kl-plus" : "kl-plus is-nol"}>{b.poin ? `+${b.poin} poin` : "0 poin"}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      )}
      {k.belumCukup ? (
        <p className="kl-foot">
          {k.belumCukup} siswa belum {MIN_LATIHAN} latihan {JENIS_INFO[jenis].nama} Standar, jadi belum masuk klasemen.
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- Tingkat, lencana, aturan

const posisiBatang = (v: number) => Math.max(0, Math.min(100, ((v - 40) / 60) * 100));

function BatangTingkat({ nilai }: { nilai: number | null }) {
  return (
    <svg className="kl-bar" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
      <rect className="kl-bar-jalur" width="100" height="8" />
      {nilai !== null ? <rect className="kl-bar-isi" width={posisiBatang(nilai)} height="8" /> : null}
      {TINGKAT.slice(1).map((t) => (
        <rect key={t.kode} className="kl-bar-batas" x={posisiBatang(t.batas) - 0.4} width="0.8" height="8" />
      ))}
    </svg>
  );
}

function KartuTingkat({ tingkat }: { tingkat: Record<JenisLatihan, TingkatJenis> }) {
  const batas = TINGKAT.slice(1).map((t) => t.batas).join(" · ");
  return (
    <section className="card kl-card" aria-labelledby="kl-tingkat-h">
      <div className="kl-card-head">
        <h2 id="kl-tingkat-h">Tingkatmu</h2>
        <p>Rata-rata 3 skor Standar terbaik 30 hari terakhir. Naik tingkat tanpa harus mengalahkan teman.</p>
      </div>
      <ul className="kl-tingkat">
        {JENIS_LATIHAN.map((j) => {
          const t = tingkat[j];
          return (
            <li key={j}>
              <span className={`kl-jico j-${j}`} aria-hidden="true">
                {IKON_LATIHAN[j]}
              </span>
              <div>
                <div className="kl-t-top">
                  <b>{JENIS_INFO[j].nama}</b>
                  {t.tingkat !== null && t.nilai !== null ? (
                    <span>
                      <Tingkat indeks={t.tingkat} /> {d1(t.nilai)}
                    </span>
                  ) : (
                    <span className="kl-t-belum">
                      {t.jumlah}/{MIN_LATIHAN} latihan
                    </span>
                  )}
                </div>
                <BatangTingkat nilai={t.nilai} />
                <div className="kl-t-note">
                  <span>
                    {t.berikut ? (
                      <>
                        Kurang <b>{d1(t.berikut.kurang)}</b> ke {t.berikut.nama}
                      </>
                    ) : t.tingkat !== null ? (
                      <>
                        <b>Tingkat tertinggi.</b> Jaga di atas {TINGKAT.at(-1)!.batas}.
                      </>
                    ) : (
                      `Butuh ${MIN_LATIHAN - t.jumlah} latihan Standar lagi dalam 30 hari`
                    )}
                  </span>
                  <span>{batas}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function KartuLencana({ lencana }: { lencana: Lencana[] }) {
  const dapat = lencana.filter((l) => l.dapat).length;
  return (
    <section className="card kl-card" aria-labelledby="kl-lencana-h">
      <div className="kl-card-head">
        <h2 id="kl-lencana-h">Lencana</h2>
        <p>
          {dapat} dari {lencana.length} sudah kamu dapat. Lencana tidak hilang saat klasemen dimulai lagi.
        </p>
      </div>
      <ul className="kl-lencana">
        {lencana.map((l) => (
          <li key={l.kode} className={l.dapat ? "kl-l" : "kl-l is-kunci"}>
            <span className="kl-l-ico" aria-hidden="true">
              <Icon name={IKON_LENCANA[l.kode]} />
            </span>
            <b>
              {l.judul}
              <span className="sr-only">{l.dapat ? " (sudah didapat)" : " (belum didapat)"}</span>
            </b>
            <span>{l.ket}</span>
            {!l.dapat && l.progres ? <meter className="kl-meter" min={0} max={l.progres.target} value={Math.min(l.progres.nilai, l.progres.target)} aria-hidden="true" /> : null}
            <small>{l.catatan}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PemimpinJenis({ data }: { data: DataKlasemen }) {
  return (
    <section className="card kl-card" aria-labelledby="kl-pemimpin-h">
      <div className="kl-card-head">
        <h2 id="kl-pemimpin-h">Pemimpin tiap jenis</h2>
        <p>Sementara, sampai minggu ditutup.</p>
      </div>
      <ul className="kl-pemimpin">
        {JENIS_LATIHAN.map((j) => {
          const b = data.sekarang.jenis[j].baris[0];
          return (
            <li key={j}>
              <span className={`kl-jico j-${j}`} aria-hidden="true">
                {IKON_LATIHAN[j]}
              </span>
              <span className="kl-who">
                <b>{JENIS_INFO[j].nama}</b>
                <span className="kl-sub">{b ? data.nama[b.siswa_id] ?? "Siswa" : "Belum ada yang masuk klasemen"}</span>
              </span>
              <span className="kl-val">{b ? <b>{d1(b.nilai)}</b> : null}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CaraHitung({ zona }: { zona: string }) {
  const [, perunggu, perak, emas] = TINGKAT;
  return (
    <section className="card kl-card kl-aturan">
      <details>
        <summary>Cara hitung</summary>
        <ul>
          <li>
            Yang dihitung hanya latihan durasi <b>Standar</b>, Senin sampai Minggu ({singkatanZona(zona)}).
          </li>
          <li>
            Nilai tiap jenis = <b>rata-rata 3 skor terbaik</b> minggu itu. Minimal {MIN_LATIHAN} latihan untuk masuk klasemen.
          </li>
          <li>
            Peringkat 1 sampai {POIN_PERINGKAT.length} tiap jenis mendapat <b>{POIN_PERINGKAT.join(", ")} poin</b>. Klasemen umum menjumlah poin keempat jenis.
          </li>
          <li>Bila sama: di klasemen jenis, skor tunggal terbaik lalu yang lebih dulu mencapainya; di klasemen umum, rata-rata nilai jenis yang lebih tinggi.</li>
          <li>
            Tingkat memakai rata-rata 3 skor Standar terbaik 30 hari terakhir: {perunggu!.nama} {perunggu!.batas}, {perak!.nama} {perak!.batas}, {emas!.nama} {emas!.batas}. Tingkat tidak dimulai ulang tiap minggu.
          </li>
          <li>Juara dan podium mingguan menjadi lencana setelah minggu ditutup.</li>
        </ul>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------- Halaman

export function KlasemenView({ data, tab }: { data: DataKlasemen; tab: TabKlasemen }) {
  const id = data.saya?.siswa_id ?? null;
  const juaraLalu = data.mingguLalu.umum[0];
  return (
    <div className="page kl-page">
      <PageHead
        back={{ href: "/latihan", label: data.lihatSemua ? "Latihan siswa" : "Latihan" }}
        title="Klasemen"
        description={`Adu skor latihan durasi Standar. Klasemen dimulai lagi setiap Senin pukul 00.00 ${singkatanZona(data.zona)}.`}
      />
      <div className="kl-layout">
        <div className="kl-col">
          {data.saya ? <KartuSiswa data={data} tab={tab} id={data.saya.siswa_id} /> : <KartuPelatih data={data} />}
          <nav className="kl-tabs" aria-label="Pilih klasemen">
            {(["umum", ...JENIS_LATIHAN] as TabKlasemen[]).map((t) => (
              <Link key={t} href={hrefTab(t)} scroll={false} aria-current={t === tab ? "page" : undefined}>
                {t === "umum" ? "Umum" : pendek[t]}
              </Link>
            ))}
          </nav>
          {tab === "umum" ? <PapanUmum data={data} id={id} /> : <PapanJenis data={data} jenis={tab} id={id} />}
          {juaraLalu ? (
            <div className="kl-lalu">
              <Icon name="trophy" />
              <div>
                <span>Juara umum minggu lalu ({rentangMinggu(data.mingguLalu.dari, data.mingguLalu.sampai)})</span>
                <b>
                  {data.nama[juaraLalu.siswa_id] ?? "Siswa"} · {juaraLalu.poin} poin
                </b>
              </div>
            </div>
          ) : null}
        </div>
        <div className="kl-col">
          {data.saya ? (
            <>
              <KartuTingkat tingkat={data.saya.tingkat} />
              <KartuLencana lencana={data.saya.lencana} />
            </>
          ) : (
            <PemimpinJenis data={data} />
          )}
          <CaraHitung zona={data.zona} />
        </div>
      </div>
    </div>
  );
}
