"use client";

// Layar mengerjakan latihan psikotes (penuh layar, untuk HP): persiapan, mesin latihan, lalu hasil langsung.
// Waktu dihitung dari jam (Date.now dan performance.now), bukan dari hitungan detak, sehingga tetap berjalan
// saat layar tersembunyi. Siswa: hasil dikirim ke server (satu operation_id per latihan, dipakai ulang saat kirim
// ulang). Owner/admin: mode coba, hasil hanya ditampilkan. Semua gaya lewat kelas CSS (CSP).
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { DURASI_LABEL, DURASI_LATIHAN, hitungHasil, JENIS_INFO, type DurasiLatihan, type JenisLatihan } from "@/lib/core/latihan";
import {
  buatKiriman,
  HURUF,
  idOperasi,
  isCermat,
  jamMundur,
  jawabSesi,
  jendelaDeret,
  keteranganDurasi,
  majuWaktu,
  ringkasSesi,
  sesiBaru,
  sisaWaktu,
  totalMs,
  type BarisDeret,
  type KirimanLatihan,
  type Sesi,
} from "@/lib/core/latihan-soal";
import { Icon } from "./icon";
import { IKON_LATIHAN, LatihanHasil, type DataHasil } from "./latihan-hasil";
import { kirimLatihan, simpanTertunda } from "./latihan-tertunda";

/** Simbol ditampilkan sebagai teks (bukan emoji berwarna) agar sama di semua HP. */
const tampil = (x: string) => (/^[0-9]$/.test(x) ? x : `${x}︎`);

const KUNCI_SUARA = "rg-latihan-suara";

// ---------------------------------------------------------------- Aba-aba: bunyi, suara, getar

interface Aba {
  ctx: AudioContext | null;
  suara: boolean;
}

function buatAudio(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}

function bunyi(ctx: AudioContext | null, freq: number, dur: number, vol = 0.06) {
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") void ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.start();
    o.stop(ctx.currentTime + dur);
  } catch {
    // bunyi hanya pelengkap
  }
}

function ucap(kata: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(kata);
    u.lang = "id-ID";
    u.rate = 1.05;
    synth.cancel();
    synth.speak(u);
  } catch {
    // suara hanya pelengkap
  }
}

const KATA_PINDAH: Record<JenisLatihan, string> = { kraepelin: "Pindah", pauli: "Garis", angka: "Kolom baru", simbol: "Kolom baru" };

// ---------------------------------------------------------------- Petunjuk

const CARA: Record<JenisLatihan, string[]> = {
  kraepelin: [
    "Kolom angka dikerjakan dari bawah ke atas.",
    "Jumlahkan dua angka yang disorot, lalu ketuk angka terakhir hasilnya di keypad.",
    "Saat aba-aba \"Pindah\", kolom berganti dengan angka baru. Lanjutkan di kolom itu.",
    "Jawaban tidak bisa dihapus. Kerjakan secepat dan seteliti mungkin.",
  ],
  pauli: [
    "Satu deret panjang dikerjakan dari atas ke bawah, tanpa pindah kolom.",
    "Jumlahkan dua angka yang disorot, lalu ketuk angka terakhir hasilnya di keypad.",
    "Setiap interval terdengar aba-aba \"Garis\" dan garis oranye ditarik di posisimu. Terus lanjutkan.",
    "Jawaban tidak bisa dihapus. Jaga ritme dari awal sampai akhir.",
  ],
  angka: [
    "Lima angka kunci berlabel A sampai E tampil di atas.",
    "Setiap soal menampilkan empat dari lima angka itu dalam urutan acak.",
    "Ketuk huruf angka yang hilang. Soal berikutnya langsung muncul.",
    "Kunci berganti setiap kolom.",
  ],
  simbol: [
    "Lima simbol kunci berlabel A sampai E tampil di atas.",
    "Setiap soal menampilkan empat dari lima simbol itu dalam urutan acak.",
    "Ketuk huruf simbol yang hilang. Soal berikutnya langsung muncul.",
    "Kunci berganti setiap kolom.",
  ],
};

function KunciTabel({ kunci }: { kunci: readonly string[] }) {
  return (
    <div className="kj-kunci">
      {kunci.map((x, i) => (
        <div key={i}>
          <b>{tampil(x)}</b>
          <span>{HURUF[i]}</span>
        </div>
      ))}
    </div>
  );
}

function Contoh({ jenis }: { jenis: JenisLatihan }) {
  if (jenis === "kraepelin") {
    return (
      <p className="lt-sub">
        Dari bawah: 4 + 9 = 1<b>3</b>, ketuk <b>3</b>. Lalu 9 + 6 = 1<b>5</b>, ketuk <b>5</b>.
      </p>
    );
  }
  if (jenis === "pauli") {
    return (
      <p className="lt-sub">
        Dari atas: 7 + 8 = 1<b>5</b>, ketuk <b>5</b>. Lalu 8 + 2 = 1<b>0</b>, ketuk <b>0</b>.
      </p>
    );
  }
  const v = jenis === "angka" ? ["3", "8", "1", "6", "9"] : ["★", "◆", "♣", "▲", "●"];
  return (
    <>
      <KunciTabel kunci={v} />
      <p className="lt-sub">
        Soal: {[v[3], v[0], v[4], v[2]].map((x) => tampil(x!)).join(" ")}. Yang hilang <b>{tampil(v[1]!)}</b>, jadi jawab <b>B</b>.
      </p>
    </>
  );
}

const IkonX = () => (
  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

// ---------------------------------------------------------------- Mesin latihan

interface Mulai {
  sesi: Sesi;
  /** Titik nol jam dinding dan jam monoton. */
  d0: number;
  p0: number;
  /** Waktu mulai (ISO) untuk disimpan. */
  mulai: string;
}

function Baris({ r }: { r: BarisDeret }) {
  if (r.tipe === "angka") return <li className={`kj-d is-${r.posisi}${r.dekat ? " is-dekat" : ""}`}>{r.nilai ?? ""}</li>;
  if (r.isi === "slot")
    return (
      <li className="kj-s is-slot">
        <span>?</span>
      </li>
    );
  if (r.isi === "jawab")
    return (
      <li className={`kj-s is-jawab${r.garis ? " is-garis" : ""}`}>
        <span>{r.nilai}</span>
      </li>
    );
  return <li className="kj-s" />;
}

function Mesin({ awal, coba, aba, onSelesai }: { awal: Mulai; coba: boolean; aba: React.RefObject<Aba>; onSelesai: (sesi: Sesi, lewatMs: number) => void }) {
  const jenis = awal.sesi.jenis;
  const info = JENIS_INFO[jenis];
  const Satuan = info.bagian === "kolom" ? "Kolom" : "Interval";
  const [sesi, setSesi] = useState(awal.sesi);
  const ref = useRef(awal.sesi);
  const [lewatMs, setLewatMs] = useState(0);
  const [isyarat, setIsyarat] = useState<{ teks: string; n: number } | null>({ teks: "Mulai!", n: 0 });
  const habis = useRef(false);
  const timerIsyarat = useRef<number | null>(null);
  const onSelesaiRef = useRef(onSelesai);

  useEffect(() => {
    onSelesaiRef.current = onSelesai;
  }, [onSelesai]);

  const lewat = useCallback(() => Math.max(Date.now() - awal.d0, performance.now() - awal.p0), [awal]);

  const ganti = useCallback((s: Sesi) => {
    ref.current = s;
    setSesi(s);
  }, []);

  const tampilkanIsyarat = useCallback((teks: string) => {
    setIsyarat((p) => ({ teks, n: (p?.n ?? 0) + 1 }));
    if (timerIsyarat.current !== null) window.clearTimeout(timerIsyarat.current);
    timerIsyarat.current = window.setTimeout(() => setIsyarat(null), 900);
  }, []);

  const beriIsyarat = useCallback(() => {
    const kata = KATA_PINDAH[jenis];
    tampilkanIsyarat(`${kata}!`);
    const a = aba.current;
    if (a.suara) {
      bunyi(a.ctx, 760, 0.14);
      ucap(kata);
    }
    try {
      navigator.vibrate?.(80);
    } catch {
      // getar hanya pelengkap
    }
  }, [aba, jenis, tampilkanIsyarat]);

  const akhir = useCallback(
    (s: Sesi, ms: number) => {
      if (habis.current) return;
      habis.current = true;
      ganti(s);
      onSelesaiRef.current(s, ms);
    },
    [ganti],
  );

  /** Menyesuaikan sesi dengan jam. Null bila latihan sudah selesai. */
  const langkah = useCallback(() => {
    if (habis.current) return null;
    const ms = lewat();
    const r = majuWaktu(ref.current, ms, Math.random);
    if (r.sesi !== ref.current) ganti(r.sesi);
    if (r.pindah) beriIsyarat();
    if (r.sesi.selesai) {
      akhir(r.sesi, ms);
      return null;
    }
    setLewatMs(Math.floor(ms / 250) * 250);
    return r;
  }, [akhir, beriIsyarat, ganti, lewat]);

  // Detak tampilan. Waktu tetap dari jam; detak yang tertunda (layar tersembunyi) disusul saat layar kembali.
  useEffect(() => {
    langkah();
    const id = window.setInterval(langkah, 200);
    const susul = () => void langkah();
    document.addEventListener("visibilitychange", susul);
    window.addEventListener("focus", susul);
    window.addEventListener("pageshow", susul);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", susul);
      window.removeEventListener("focus", susul);
      window.removeEventListener("pageshow", susul);
    };
  }, [langkah]);

  useEffect(() => {
    timerIsyarat.current = window.setTimeout(() => setIsyarat(null), 700);
    return () => {
      if (timerIsyarat.current !== null) window.clearTimeout(timerIsyarat.current);
    };
  }, []);

  // Tanya dulu sebelum menutup atau memuat ulang halaman di tengah latihan.
  useEffect(() => {
    const tahan = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", tahan);
    return () => window.removeEventListener("beforeunload", tahan);
  }, []);

  // Layar dijaga tetap menyala selama latihan (bila didukung).
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    let batal = false;
    const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };
    const minta = () => {
      if (document.visibilityState !== "visible") return;
      nav.wakeLock?.request("screen").then(
        (l) => {
          if (batal) void l.release().catch(() => undefined);
          else lock = l;
        },
        () => undefined,
      );
    };
    minta();
    document.addEventListener("visibilitychange", minta);
    return () => {
      batal = true;
      document.removeEventListener("visibilitychange", minta);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  const jawab = useCallback(
    (nilai: number) => {
      const r = langkah();
      if (!r) return;
      // Bila kolom baru saja berganti, pasangan/soal yang diketuk sudah tidak tampil: ketukan diabaikan.
      if (r.pindah && ref.current.jenis !== "pauli") return;
      ganti(jawabSesi(ref.current, nilai, Math.random));
    },
    [ganti, langkah],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (ref.current.deret && /^[0-9]$/.test(e.key)) {
        e.preventDefault();
        jawab(Number(e.key));
        return;
      }
      const i = e.key.length === 1 ? "abcde".indexOf(e.key.toLowerCase()) : -1;
      if (ref.current.kunci && i >= 0) {
        e.preventDefault();
        jawab(i);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jawab]);

  const akhiri = () => {
    const s = ref.current;
    const teks =
      s.bagian === 0
        ? "Akhiri latihan sekarang? Hasil dinilai dari jawaban sejauh ini."
        : `Akhiri latihan sekarang? Hanya ${s.bagian} ${info.bagian} yang sudah selesai yang dinilai.`;
    if (!window.confirm(teks)) return;
    const ms = lewat();
    akhir(majuWaktu(ref.current, ms, Math.random).sesi, ms);
  };

  const sisa = sisaWaktu(sesi, lewatMs);
  const total = totalMs(sesi);
  const naik = jenis === "kraepelin";

  return (
    <div className={`kj-run kj-run-${isCermat(jenis) ? "cermat" : "deret"}`}>
      <header className="kj-top">
        <button type="button" className="kj-akhiri" onClick={akhiri}>
          <IkonX />
          Akhiri
        </button>
        <div className="kj-top-t">
          <b>{info.nama}</b>
          <small className="n">Dijawab {sesi.dijawab} · jangan keluar dari layar</small>
        </div>
        {coba ? <span className="badge badge-warning">Mode coba</span> : null}
      </header>
      <div className="kj-hud">
        <div className="kj-time" role="timer" aria-live="off">
          <span className="sr-only">Sisa waktu {info.bagian} ini</span>
          <b className="n">{jamMundur(sisa.bagianMs)}</b>
          <span className="n">Total {jamMundur(sisa.totalMs)}</span>
        </div>
        <meter className="kj-meter" min={0} max={total} value={Math.min(lewatMs, total)} aria-label="Waktu latihan yang sudah berjalan" />
        <div className="kj-pos">
          <span>{Satuan}</span>
          <b className="n">
            {sesi.bagian + 1} / {sesi.bagianTotal}
          </b>
        </div>
      </div>

      {sesi.deret ? (
        <>
          <div className="kj-kertas">
            <ol className="kj-strip" aria-hidden="true">
              {jendelaDeret(sesi.deret, naik ? "naik" : "turun", sesi.garis).map((r, i) => (
                <Baris key={i} r={r} />
              ))}
            </ol>
            <p className="kj-arah" aria-hidden="true">
              {naik ? "▲ Dari bawah ke atas" : "▼ Dari atas ke bawah"}
            </p>
            <p className="sr-only" aria-live="polite">
              {sesi.deret.angka[sesi.deret.jawab.length]} tambah {sesi.deret.angka[sesi.deret.jawab.length + 1]}
            </p>
          </div>
          <div className="kj-pad" role="group" aria-label="Keypad jawaban">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => (
              <button key={n} type="button" onClick={() => jawab(n)}>
                {n}
              </button>
            ))}
          </div>
        </>
      ) : sesi.kunci && sesi.soal ? (
        <>
          <div className="kj-kunci-wrap">
            <p className="kj-kunci-t">
              Kunci {info.bagian} {sesi.bagian + 1}
            </p>
            <KunciTabel kunci={sesi.kunci} />
          </div>
          <div className="kj-soal">
            <p className="kj-no n">Soal {sesi.nomor}</p>
            <p className="kj-q" key={`${sesi.bagian}-${sesi.nomor}`}>
              {sesi.soal.tampil.map((x, i) => (
                <span key={i}>{tampil(x)}</span>
              ))}
            </p>
            <p className="sr-only" aria-live="polite">
              Soal {sesi.nomor}: {sesi.soal.tampil.join(", ")}
            </p>
            <p className="kj-tanya">Mana yang hilang?</p>
          </div>
          <div className="kj-opsi" role="group" aria-label="Pilih huruf yang hilang">
            {HURUF.map((h, i) => (
              <button key={h} type="button" onClick={() => jawab(i)}>
                {h}
              </button>
            ))}
          </div>
        </>
      ) : null}

      <div className={`kj-cue${isyarat ? " is-on" : ""}`} aria-live="assertive">
        {isyarat?.teks ?? ""}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Layar utama: persiapan, mesin, hasil

type Simpan = { status: "coba" } | { status: "menyimpan" } | { status: "tersimpan"; alamat: string } | { status: "gagal"; pesan: string };

export function KerjakanLatihan({
  jenis,
  durasiAwal,
  coba,
  pemilik,
  kembali,
}: {
  jenis: JenisLatihan;
  durasiAwal: DurasiLatihan;
  /** Owner/admin: hasil tidak disimpan. */
  coba: boolean;
  /** siswa_id pemilik hasil (kosong di mode coba). */
  pemilik: string;
  kembali: string;
}) {
  const info = JENIS_INFO[jenis];
  const [fase, setFase] = useState<"siap" | "jalan" | "hasil">("siap");
  const [durasi, setDurasi] = useState(durasiAwal);
  const [suara, setSuara] = useState(true);
  const [awal, setAwal] = useState<Mulai | null>(null);
  const [percobaan, setPercobaan] = useState(0);
  const [hasil, setHasil] = useState<{ data: DataHasil; kiriman: KirimanLatihan | null } | null>(null);
  const [simpan, setSimpan] = useState<Simpan>({ status: "coba" });
  const [pesan, setPesan] = useState("");
  const aba = useRef<Aba>({ ctx: null, suara: true });
  const [, mulaiKirim] = useTransition();

  useEffect(() => {
    try {
      if (window.localStorage.getItem(KUNCI_SUARA) === "0") setSuara(false);
    } catch {
      // tetap bersuara
    }
  }, []);

  const pilihDurasi = (d: DurasiLatihan) => {
    setDurasi(d);
    try {
      window.history.replaceState(window.history.state, "", `?durasi=${d}`);
    } catch {
      // alamat tidak wajib ikut berubah
    }
  };

  const ubahSuara = (on: boolean) => {
    setSuara(on);
    try {
      window.localStorage.setItem(KUNCI_SUARA, on ? "1" : "0");
    } catch {
      // abaikan
    }
  };

  const mulai = () => {
    if (suara && !aba.current.ctx) aba.current.ctx = buatAudio();
    aba.current.suara = suara;
    if (suara) {
      const ctx = aba.current.ctx;
      bunyi(ctx, 660, 0.12);
      window.setTimeout(() => bunyi(ctx, 880, 0.16), 130);
      ucap("Mulai");
    }
    setAwal({ sesi: sesiBaru(jenis, durasi, Math.random), d0: Date.now(), p0: performance.now(), mulai: new Date().toISOString() });
    setPercobaan((n) => n + 1);
    setPesan("");
    setHasil(null);
    setFase("jalan");
    window.scrollTo(0, 0);
  };

  const kirim = useCallback((k: KirimanLatihan) => {
    setSimpan({ status: "menyimpan" });
    mulaiKirim(async () => {
      const r = await kirimLatihan(k);
      setSimpan(r.ok ? { status: "tersimpan", alamat: r.alamat } : { status: "gagal", pesan: r.message });
    });
  }, []);

  const selesai = useCallback(
    (sesi: Sesi, ms: number) => {
      const a = aba.current;
      if (a.suara) {
        bunyi(a.ctx, 392, 0.28);
        ucap("Berhenti");
      }
      const ringkas = ringkasSesi(sesi, ms);
      if (!ringkas || !awal) {
        setPesan(sesi.dijawab === 0 ? "Latihan dihentikan. Belum ada jawaban, jadi tidak ada hasil yang dinilai." : "Latihan dihentikan sebelum 5 detik, jadi tidak ada hasil yang dinilai.");
        setFase("siap");
        return;
      }
      const data: DataHasil = { ...hitungHasil(jenis, ringkas.seri, ringkas.detik), jenis, durasi: sesi.durasi, detik: ringkas.detik, mulai: awal.mulai };
      window.scrollTo(0, 0);
      if (coba) {
        setHasil({ data, kiriman: null });
        setSimpan({ status: "coba" });
        setFase("hasil");
        return;
      }
      const kiriman = buatKiriman({ operationId: idOperasi(), jenis, durasi: sesi.durasi, mulai: awal.mulai, pemilik, dibuat: new Date().toISOString(), ringkas });
      // Ditulis ke HP dulu: bila pengiriman terputus atau layar tertutup, hasil masih bisa dikirim dari menu.
      simpanTertunda(kiriman);
      setHasil({ data, kiriman });
      setFase("hasil");
      kirim(kiriman);
    },
    [awal, coba, jenis, kirim, pemilik],
  );

  // Selama hasil sedang dikirim, tanya dulu sebelum halaman ditutup.
  useEffect(() => {
    if (simpan.status !== "menyimpan") return;
    const tahan = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", tahan);
    return () => window.removeEventListener("beforeunload", tahan);
  }, [simpan.status]);

  if (fase === "jalan" && awal) return <Mesin key={percobaan} awal={awal} coba={coba} aba={aba} onSelesai={selesai} />;

  if (fase === "hasil" && hasil) {
    const k = hasil.kiriman;
    const status =
      simpan.status === "coba" ? (
        <p className="notice notice-warning">Tidak disimpan (mode coba).</p>
      ) : simpan.status === "menyimpan" ? (
        <p className="notice notice-info" role="status">
          Menyimpan hasil…
        </p>
      ) : simpan.status === "tersimpan" ? (
        <p className="notice notice-success" role="status">
          Hasil tersimpan. Membuka halaman hasil… <Link href={simpan.alamat}>Buka hasil</Link>
        </p>
      ) : (
        <div className="notice notice-danger kj-gagal" role="alert">
          <p>
            <b>Hasil belum tersimpan.</b> {simpan.pesan}
          </p>
          <p>Hasil ini disimpan sementara di HP ini dan bisa dikirim lagi nanti dari menu Latihan.</p>
          {k ? (
            <button type="button" className="btn btn-sm" onClick={() => kirim(k)}>
              Simpan ulang
            </button>
          ) : null}
        </div>
      );
    const aksi = coba ? (
      <>
        <button type="button" className="btn" onClick={() => setFase("siap")}>
          Coba lagi
        </button>
        <Link className="btn btn-secondary" href={kembali}>
          Menu mode coba
        </Link>
      </>
    ) : simpan.status === "gagal" && k ? (
      <>
        <button type="button" className="btn" onClick={() => kirim(k)}>
          Simpan ulang
        </button>
        <Link className="btn btn-secondary" href={kembali}>
          Menu latihan
        </Link>
      </>
    ) : (
      <Link className="btn btn-secondary" href={kembali}>
        Menu latihan
      </Link>
    );
    return (
      <div className="kj-layar">
        <header className="kj-top">
          <Link className="kj-back" href={kembali} aria-label="Kembali ke menu latihan">
            <Icon name="back" />
          </Link>
          <div className="kj-top-t">
            <b>Hasil {info.nama}</b>
            <small>
              Baru saja · {DURASI_LABEL[hasil.data.durasi]} · {hasil.data.kurva.length} {info.bagian}
            </small>
          </div>
        </header>
        <main className="kj-isi">
          <LatihanHasil data={hasil.data} sebelumnya={null} status={status} aksi={aksi} />
        </main>
      </div>
    );
  }

  return (
    <div className="kj-layar">
      <header className="kj-top">
        <Link className="kj-back" href={kembali} aria-label="Kembali ke menu latihan">
          <Icon name="back" />
        </Link>
        <div className="kj-top-t">
          <b>{info.nama}</b>
          <small>{coba ? "Mode coba" : "Latihan psikotes"}</small>
        </div>
      </header>
      <main className="kj-isi kj-siap">
        {pesan ? (
          <p className="notice notice-warning" role="status">
            {pesan}
          </p>
        ) : null}
        {coba ? <p className="notice notice-warning">Mode coba: hasil tidak disimpan.</p> : null}
        <section className="card lt-card" aria-labelledby="kj-cara-h">
          <span className={`lt-ico lt-ico-${jenis}`} aria-hidden="true">
            {IKON_LATIHAN[jenis]}
          </span>
          <h2 id="kj-cara-h">Cara mengerjakan</h2>
          <ul className="kj-cara">
            {CARA[jenis].map((c) => (
              <li key={c}>{c}</li>
            ))}
            <li className="kj-cara-laptop">Di laptop bisa juga memakai keyboard: {isCermat(jenis) ? "huruf A sampai E" : "angka 0 sampai 9"}.</li>
          </ul>
        </section>
        <section className="card lt-card" aria-labelledby="kj-durasi-h">
          <h2 id="kj-durasi-h">Durasi</h2>
          <div className="lt-seg" role="group" aria-labelledby="kj-durasi-h">
            {DURASI_LATIHAN.map((d) => (
              <button key={d} type="button" aria-pressed={durasi === d} onClick={() => pilihDurasi(d)}>
                {DURASI_LABEL[d]}
              </button>
            ))}
          </div>
          <p className="lt-sub">
            <b>{keteranganDurasi(jenis, durasi)}</b>
            {durasi === "asli" ? null : (
              <>
                <br />
                Tes asli: {keteranganDurasi(jenis, "asli")}.
              </>
            )}
          </p>
        </section>
        <section className="card lt-card" aria-labelledby="kj-contoh-h">
          <h2 id="kj-contoh-h">Contoh</h2>
          <Contoh jenis={jenis} />
        </section>
        <label className="kj-suara">
          <input type="checkbox" checked={suara} onChange={(e) => ubahSuara(e.target.checked)} />
          <span>
            <b>Bunyi aba-aba</b>
            <small>Bunyi dan suara &quot;{KATA_PINDAH[jenis]}&quot; saat {info.bagian} berganti.</small>
          </span>
        </label>
      </main>
      <footer className="kj-foot">
        <button type="button" className="btn btn-block kj-mulai" onClick={mulai}>
          Mulai latihan
        </button>
      </footer>
    </div>
  );
}
