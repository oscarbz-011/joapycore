import { redirect } from "next/navigation";

export default function LegacyInventoryConfigPage() {
  redirect("/dashboard/inventory/categories");
}
