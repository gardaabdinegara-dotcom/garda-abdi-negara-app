import type { Metadata } from "next";
import { AcademicTabs, requirePart } from "@/components/akademik";
import {
  CreateSessionButton,
  EditSessionFields,
  EmptyDay,
  FamilyPresensi,
  NearbyCard,
  PresensiHead,
  RecapMini,
  RecapTab,
  ScheduleTab,
  SessionStrip,
  SessionWorkspaceView,
  type PresensiTab,
} from "@/components/presensi";
import { LiveRefresh } from "@/components/presensi-client";
import { Empty } from "@/components/ui";
import { loadPresensi } from "@/lib/server/akademik";
import { presensiQr } from "@/lib/server/qr-presensi";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Presensi" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

/**
 * Presensi, opsi A "Layar hari ini".
 * Staf: tab Hari ini (sesi berjalan, QR, pengajuan, kartu siswa), Jadwal (per tanggal), dan Rekap (bulanan).
 * Siswa/wali: sesi yang sedang dibuka, status, rekap bulan ini, dan riwayat.
 */
export default async function PresensiPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor();
  requirePart(actor, "presensi");
  const params = await searchParams;
  const data = await loadPresensi(actor, { sesi: one(params.sesi), tanggal: one(params.tanggal), bulan: one(params.bulan) });

  if (data.kind === "family") {
    const wali = actor.user.peran === "WALI";
    return (
      <div className="page pr">
        <PresensiHead />
        <AcademicTabs actor={actor} current="presensi" />
        {data.family.length === 0 ? <Empty title="Belum tertaut">Minta admin menautkan data siswa ke akun Anda.</Empty> : null}
        {data.family.map((item) => (
          <FamilyPresensi key={item.student.siswa_id} item={item} canSubmit={actor.user.peran === "SISWA"} showName={wali} clock={data.clock} />
        ))}
      </div>
    );
  }

  const tab: PresensiTab = params.tab === "jadwal" ? "jadwal" : params.tab === "rekap" ? "rekap" : "hari";
  const { clock, selected, classes, teachers, sessionTypes } = data;
  const sessionOptions = { classes, teachers, sessionTypes };
  const isAdmin = actor.user.peran === "OWNER" || actor.user.peran === "ADMIN";
  const canCreate = !(actor.user.peran === "PENGAJAR" && data.classes.length === 0);
  const live = selected && selected.session.status === "AKTIF" && selected.session.canManage && selected.session.tanggal === clock.today;
  const qr = tab === "hari" && live ? await presensiQr(selected.session.sesi_id) : null;
  const createDate = tab === "jadwal" && data.schedule.date >= clock.today ? data.schedule.date : clock.today;

  return (
    <div className="page pr">
      <PresensiHead
        tab={tab}
        create={
          canCreate ? (
            <CreateSessionButton key={`${tab}:${selected?.session.sesi_id ?? ""}:${createDate}`} {...sessionOptions} date={createDate} />
          ) : null
        }
      />
      <AcademicTabs actor={actor} current="presensi" />
      {tab === "hari" ? (
        <>
          <SessionStrip items={data.strip} selectedId={selected?.session.sesi_id ?? null} today={clock.today} />
          {selected ? (
            <>
              {selected.session.status === "AKTIF" ? <LiveRefresh seconds={20} /> : null}
              <SessionWorkspaceView
                ws={selected}
                clock={clock}
                isAdmin={isAdmin}
                qr={qr}
                editFields={selected.session.canManage ? <EditSessionFields ws={selected} {...sessionOptions} /> : null}
                side={
                  <>
                    <NearbyCard items={data.nearby} today={clock.today} />
                    <RecapMini recap={data.recap} today={clock.today} />
                  </>
                }
              />
            </>
          ) : (
            <EmptyDay next={data.nearby} today={clock.today} canCreate={canCreate} />
          )}
        </>
      ) : tab === "jadwal" ? (
        <ScheduleTab schedule={data.schedule} today={clock.today} />
      ) : (
        <RecapTab recap={data.recap} today={clock.today} />
      )}
    </div>
  );
}
