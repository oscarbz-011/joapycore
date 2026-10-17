import { redirect } from "next/navigation";
import { COMMUNICATIONS_PATH } from "@/lib/api/communications";

export default function LegacyEmailRedirect() {
  redirect(COMMUNICATIONS_PATH);
}
