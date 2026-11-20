// Riwayat bayar per siswa (opsional): uang masuk yang dicatat manual lalu ditautkan ke satu siswa lewat "Dari siswa".
// Ini catatan uang yang sudah diterima, bukan tagihan; tidak ada sisa bayar yang dihitung. Murni agar bisa diuji.
import { num, text, type Row } from "./domain";
import { shortAccount } from "./dompet";
import { reversedIds } from "./ringkasan";

type Sumber = { Transaksi: Row[]; Akun: Row[]; Kategori: Row[] };

export interface ItemBayar {
  id: string;
  tanggal: string;
  judul: string;
  akun: string;
  nominal: number;
}

export interface PembayaranSiswa {
  total: number;
  jumlah: number;
  terakhir: string | null;
  /** Terbaru dulu. */
  items: ItemBayar[];
}

/** Uang masuk yang masih berlaku untuk siswa ini: bukan pembalik dan belum dibalik (dihapus/diubah). */
export function uangMasukSiswa(state: Pick<Sumber, "Transaksi">, siswaId: string): Row[] {
  if (!siswaId) return [];
  const reversed = reversedIds(state as Parameters<typeof reversedIds>[0]);
  return state.Transaksi.filter(
    (t) => text(t, "siswa_id") === siswaId && t.arah === "IN" && t.jenis !== "PEMBALIK" && !reversed.has(text(t, "transaksi_id")),
  );
}

/** "Pembayaran bimbel · ARIF PRATAMA" → "Pembayaran bimbel" (nama siswa sudah jelas di profilnya). */
export function judulBayar(deskripsi: string, nama: string, cadangan: string): string {
  const d = deskripsi.trim();
  const n = nama.trim();
  if (n) {
    const akhiran = ` · ${n}`;
    if (d.toLowerCase().endsWith(akhiran.toLowerCase())) return d.slice(0, -akhiran.length).trim() || cadangan;
  }
  return d || cadangan;
}

export function pembayaranSiswa(state: Sumber, siswaId: string, nama = ""): PembayaranSiswa {
  const akun = new Map(state.Akun.map((a) => [text(a, "akun_id"), a]));
  const kategori = new Map(state.Kategori.map((k) => [text(k, "kategori_id"), text(k, "nama_kategori")]));
  const items = uangMasukSiswa(state, siswaId)
    .map((t) => {
      const a = akun.get(text(t, "akun_id"));
      return {
        id: text(t, "transaksi_id"),
        tanggal: text(t, "tanggal_transaksi"),
        judul: judulBayar(text(t, "deskripsi"), nama, kategori.get(text(t, "kategori_id")) || "Uang masuk"),
        akun: a ? shortAccount(text(a, "nama_akun"), text(a, "jenis_akun")) : "-",
        nominal: num(t, "nominal"),
        urut: `${text(t, "created_at")}|${String(Number(t.line_no) || 0).padStart(4, "0")}`,
      };
    })
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.urut.localeCompare(a.urut))
    .map(({ urut: _urut, ...item }) => item);
  return { total: items.reduce((sum, i) => sum + i.nominal, 0), jumlah: items.length, terakhir: items[0]?.tanggal ?? null, items };
}

/** Tanggal uang masuk terakhir per siswa (untuk "terakhir bayar" di pilihan Dari siswa). */
export function terakhirBayarPerSiswa(state: Pick<Sumber, "Transaksi">): Map<string, string> {
  const reversed = reversedIds(state as Parameters<typeof reversedIds>[0]);
  const out = new Map<string, string>();
  for (const t of state.Transaksi) {
    const id = text(t, "siswa_id");
    if (!id || t.arah !== "IN" || t.jenis === "PEMBALIK" || reversed.has(text(t, "transaksi_id"))) continue;
    const date = text(t, "tanggal_transaksi");
    if (date > (out.get(id) ?? "")) out.set(id, date);
  }
  return out;
}
