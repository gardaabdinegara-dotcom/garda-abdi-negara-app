import { redirect } from "next/navigation";

type Search = Promise<Record<string, string | string[] | undefined>>;

/** Transaksi kini menyatu dengan halaman utama Keuangan (dompet). Alamat lama tetap berlaku beserta saringannya. */
export default async function TransactionsPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const q = new URLSearchParams();
  for (const key of ["bulan", "akun", "koreksi"]) {
    const value = params[key];
    if (typeof value === "string" && value) q.set(key, value);
  }
  const s = q.toString();
  redirect(s ? `/keuangan?${s}` : "/keuangan");
}
