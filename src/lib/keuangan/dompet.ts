// Riwayat "dompet" Keuangan: transaksi satu bulan yang siap tampil di HP dan laptop.
// Murni (tanpa penyimpanan): transfer digabung jadi satu baris, koreksi disembunyikan kecuali diminta,
// dan hak ubah/hapus ditentukan di sini agar halaman dan tes memakai aturan yang sama.
import { endOfMonth, num, text, type State } from "./domain";
import { reversedIds } from "./ringkasan";
import { EDITABLE_KINDS } from "./sumber";

export type ArahBaris = "in" | "out" | "tr" | "fix";

export interface UbahData {
  jenis: string;
  akun_id: string;
  kategori_id: string;
  deskripsi: string;
  nominal: number;
  tanggal: string;
  /** Siswa asal uang masuk ("Dari siswa"), kosong bila tidak ditautkan. */
  siswa_id: string;
}

export interface BarisDompet {
  id: string;
  date: string;
  title: string;
  /** Rincian sebelum nama akun, mis. ["Cicilan 2", "GAN-0005"] atau ["Operasional latihan"]. */
  meta: string[];
  account: string;
  accountShort: string;
  arah: ArahBaris;
  sign: "+" | "−" | "";
  amount: number;
  status: "" | "dikoreksi" | "koreksi";
  bukti: string;
  edit: UbahData | null;
  hapus: { transaksi_id: string; tanggal: string } | null;
}

export interface HariDompet {
  date: string;
  label: string;
  rows: BarisDompet[];
}

/** "Rekening BRI" → "BRI", "Kas tunai" → "Kas"; nama lain dipakai apa adanya. */
export function shortAccount(name: string, jenis = "") {
  const bank = /^rekening\s+/i;
  if (bank.test(name)) return name.replace(bank, "");
  if (jenis === "KAS" && name.includes(" ")) return name.split(" ")[0]!;
  return name;
}

const STUDENT = /^(.+?)\s+-\s+([A-Za-z]{2,6}-\d{2,})\s+(.+)$/;

/** "Cicilan 2 - GAN-0005 Arif Pratama" → judul "Arif Pratama", rincian ["Cicilan 2", "GAN-0005"]. */
export function splitDescription(description: string): { title: string; meta: string[] } | null {
  const m = STUDENT.exec(description.trim());
  return m ? { title: m[3]!, meta: [m[1]!, m[2]!.toUpperCase()] } : null;
}

/** Bulan YYYY-MM digeser n bulan. */
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function addDay(date: string, delta: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** "2026-11" → "November 2026". */
export function bulanLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y!, (m ?? 1) - 1, 1)));
}

/** "2026-11-17" → "17 Nov 2026" (atau tanpa tahun). */
export function tanggalPendek(date: string, withYear = true) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" as const } : {}), timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export const validMonth = (value: unknown) => (typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null);

export function riwayatDompet(
  state: State,
  options: { month: string; akun?: string; corrections?: boolean; owner: boolean; labels: Record<string, string> },
): BarisDompet[] {
  const { month, akun = "", corrections = false, owner, labels } = options;
  const from = `${month}-01`;
  const to = endOfMonth(month);
  const reversed = reversedIds(state);
  const accounts = new Map(state.Akun.map((a) => [text(a, "akun_id"), a]));
  const nameOf = (id: unknown) => text(accounts.get(String(id ?? "")), "nama_akun") || "-";
  const shortOf = (id: unknown) => {
    const a = accounts.get(String(id ?? ""));
    return a ? shortAccount(text(a, "nama_akun"), text(a, "jenis_akun")) : "-";
  };
  const categories = new Map(state.Kategori.map((k) => [text(k, "kategori_id"), text(k, "nama_kategori")]));
  const inMonth = state.Transaksi.filter((t) => {
    const date = text(t, "tanggal_transaksi");
    if (date < from || date > to) return false;
    return corrections || (t.jenis !== "PEMBALIK" && !reversed.has(text(t, "transaksi_id")));
  });

  const rows: (BarisDompet & { order: string; line: number })[] = [];
  const transfers = new Set<string>();
  for (const t of inMonth) {
    const id = text(t, "transaksi_id");
    const jenis = text(t, "jenis");
    const date = text(t, "tanggal_transaksi");
    const order = text(t, "created_at");
    const line = Number(t.line_no) || 0;
    const status: BarisDompet["status"] = jenis === "PEMBALIK" ? "koreksi" : reversed.has(id) ? "dikoreksi" : "";

    if (jenis.startsWith("TRANSFER_")) {
      const op = text(t, "operation_id");
      if (transfers.has(op)) continue;
      const legs = inMonth.filter((x) => text(x, "operation_id") === op && text(x, "jenis").startsWith("TRANSFER_"));
      if (akun && !legs.some((x) => x.akun_id === akun)) continue;
      transfers.add(op);
      const out = legs.find((x) => x.jenis === "TRANSFER_KELUAR") ?? t;
      const into = legs.find((x) => x.jenis === "TRANSFER_MASUK");
      rows.push({
        id: text(out, "transaksi_id"),
        date,
        title: text(out, "deskripsi") || "Pindah saldo",
        meta: [],
        account: into ? `${nameOf(out.akun_id)} ke ${nameOf(into.akun_id)}` : nameOf(out.akun_id),
        accountShort: into ? `${shortOf(out.akun_id)} ke ${shortOf(into.akun_id)}` : shortOf(out.akun_id),
        arah: "tr",
        sign: akun ? (out.akun_id === akun ? "−" : "+") : "",
        amount: num(out, "nominal"),
        status,
        bukti: "",
        edit: null,
        hapus: owner && !status ? { transaksi_id: text(out, "transaksi_id"), tanggal: date } : null,
        order,
        line,
      });
      continue;
    }

    if (akun && t.akun_id !== akun) continue;
    const description = text(t, "deskripsi");
    const parsed = splitDescription(description);
    const category = categories.get(text(t, "kategori_id")) ?? "";
    const editable = owner && !status && !t.tagihan_id && EDITABLE_KINDS.includes(jenis);
    rows.push({
      id,
      date,
      title: parsed?.title ?? (description || labels[jenis] || jenis),
      meta: parsed ? parsed.meta : [category || labels[jenis] || jenis],
      account: nameOf(t.akun_id),
      accountShort: shortOf(t.akun_id),
      arah: jenis === "PEMBALIK" ? "fix" : t.arah === "IN" ? "in" : "out",
      sign: t.arah === "IN" ? "+" : "−",
      amount: num(t, "nominal"),
      status,
      bukti: text(t, "bukti_url"),
      edit: editable
        ? { jenis, akun_id: text(t, "akun_id"), kategori_id: text(t, "kategori_id"), deskripsi: description, nominal: num(t, "nominal"), tanggal: date, siswa_id: text(t, "siswa_id") }
        : null,
      hapus: owner && !status && !t.tagihan_id ? { transaksi_id: id, tanggal: date } : null,
      order,
      line,
    });
  }

  rows.sort((a, b) => b.date.localeCompare(a.date) || b.order.localeCompare(a.order) || b.line - a.line);
  return rows.map(({ order: _order, line: _line, ...row }) => row);
}

const DAY = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });

/** "Selasa, 17 Nov"; hari ini dan kemarin diberi awalan. */
export function dayLabel(date: string, today: string) {
  const base = DAY.format(new Date(`${date}T00:00:00Z`));
  if (date === today) return `Hari ini · ${base}`;
  if (date === addDay(today, -1)) return `Kemarin · ${base}`;
  return base;
}

export function kelompokHari(rows: BarisDompet[], today: string): HariDompet[] {
  const days: HariDompet[] = [];
  for (const row of rows) {
    const last = days[days.length - 1];
    if (last && last.date === row.date) last.rows.push(row);
    else days.push({ date: row.date, label: dayLabel(row.date, today), rows: [row] });
  }
  return days;
}
