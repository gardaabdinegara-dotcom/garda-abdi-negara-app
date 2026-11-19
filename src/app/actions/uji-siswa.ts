"use server";

import { redirect } from "next/navigation";
import { canTestAsStudent } from "@/lib/auth/uji-siswa";
import { endUjiSiswa, getLogin, getUjiSiswa, startUjiSiswa } from "@/lib/server/session";

export async function mulaiUjiSiswa(): Promise<void> {
  const login = await getLogin();
  if (!login) redirect("/masuk");
  if (await getUjiSiswa()) redirect("/beranda");
  await startUjiSiswa(login);
  redirect("/beranda");
}

export async function aturUlangUjiSiswa(scope: string | null): Promise<void> {
  const login = await getLogin();
  if (!login) redirect("/masuk");
  if (!canTestAsStudent(login.actor.user)) redirect("/beranda");
  const test = await getUjiSiswa();
  if (!test) redirect("/pengaturan/pratinjau");
  if ((test.status === "aktif" ? test.id : null) !== scope) redirect("/beranda");
  await startUjiSiswa(login);
  redirect("/beranda");
}

export async function kembaliDariUjiSiswa(scope: string | null): Promise<void> {
  const login = await getLogin();
  const test = await getUjiSiswa();
  if (test && (test.status === "aktif" ? test.id : null) === scope) await endUjiSiswa();
  if (!login) redirect("/masuk");
  redirect(canTestAsStudent(login.actor.user) ? "/pengaturan/pratinjau" : "/beranda");
}
