import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FieldMode, type FieldStudent } from "@/components/samapta-client";
import { canManageSamapta, POS } from "@/lib/core/samapta";
import { initials } from "@/lib/format";
import { loadSamaptaTest } from "@/lib/server/samapta";
import { requireActor } from "@/lib/server/session";
import { isPos, posBrief, posInputValues, POS_TILE, POS_TITLE, shortTestName } from "../../../samapta-ui";

type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Promise<{ pos: string }> }): Promise<Metadata> {
  const { pos } = await params;
  return { title: isPos(pos) ? `Mode lapangan: ${POS_TITLE[pos]}` : "Mode lapangan" };
}

/** Mode lapangan: satu pos, satu siswa per layar, papan angka besar. Khusus owner/staf. */
export default async function FieldModePage({ params, searchParams }: { params: Promise<{ id: string; pos: string }>; searchParams: Search }) {
  const actor = await requireActor();
  if (!canManageSamapta(actor)) notFound();
  const { id, pos } = await params;
  if (!isPos(pos)) notFound();
  const sp = await searchParams;
  const data = await loadSamaptaTest(actor, decodeURIComponent(id));
  const { test, entries, summary, previous } = data;
  const prevById = new Map((previous?.entries ?? []).map((e) => [e.student.siswa_id, e]));

  const students: FieldStudent[] = entries.map((e, i) => {
    const pe = prevById.get(e.student.siswa_id);
    return {
      id: e.student.siswa_id,
      nama: e.student.nama,
      inisial: initials(e.student.nama),
      no: i + 1,
      jk: e.student.jenis_kelamin,
      usia: e.usia,
      values: posInputValues(e.result, pos, e.score.renang),
      prev: pe ? posBrief(pos, pe.result, pe.score.renang) : null,
    };
  });

  // Pos berikutnya yang belum lengkap (setelah pos ini, lalu memutar ke awal).
  const order = [...POS.slice(POS.indexOf(pos) + 1), ...POS.slice(0, POS.indexOf(pos))];
  const nextPos = order.find((p) => (summary.progress[p] ?? 0) < summary.peserta);
  const siswa = typeof sp.siswa === "string" ? sp.siswa : null;
  // Tombol tutup kembali ke halaman asal: hasil tes, detail siswa, atau daftar tes.
  const dari = typeof sp.dari === "string" ? sp.dari : "";
  const fromStudent = dari.startsWith("s-") ? entries.find((e) => e.student.siswa_id === dari.slice(2)) : undefined;
  const closeHref = dari === "hasil" ? `/samapta/${test.tes_id}` : fromStudent ? `/samapta/${test.tes_id}/siswa/${fromStudent.student.siswa_id}` : "/samapta";

  return (
    <div className="page sam-page sam-fm-page">
      <FieldMode
        key={`${test.tes_id}-${pos}`}
        tesId={test.tes_id}
        tesNama={test.nama}
        pos={pos}
        locked={test.status === "SELESAI" ? "SELESAI" : test.status === "DIBATALKAN" ? "DIBATALKAN" : ""}
        prevName={previous ? shortTestName(previous.test.nama) : null}
        students={students}
        initialId={siswa}
        initialAll={sp.semua === "1"}
        closeHref={closeHref}
        hasilHref={`/samapta/${test.tes_id}`}
        nextPos={nextPos ? { href: `/samapta/${test.tes_id}/pos/${nextPos}${dari ? `?dari=${encodeURIComponent(dari)}` : ""}`, label: POS_TILE[nextPos] } : null}
      />
    </div>
  );
}
