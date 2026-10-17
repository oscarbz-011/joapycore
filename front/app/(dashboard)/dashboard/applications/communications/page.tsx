import { redirect } from "next/navigation";
import { COMMUNICATIONS_PATH } from "@/lib/api/communications";

export default function LegacyCommunicationsRedirect() {
  redirect(COMMUNICATIONS_PATH);
}
