import { redirect } from "next/navigation";
import { requireActor } from "@/lib/server/session";

export default async function SettingsIndex() {
  await requireActor({ roles: ["OWNER", "ADMIN"] });
  redirect("/pengaturan/akun");
}
