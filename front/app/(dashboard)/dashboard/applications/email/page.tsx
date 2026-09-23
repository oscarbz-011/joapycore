import { redirect } from "next/navigation";

export default function LegacyEmailRedirect() {
  redirect("/dashboard/applications/communications");
}
