import { redirect } from "next/navigation";

export default function MetaAcquisitionPage() {
  redirect("/admin/acquisizione?tab=meta");
}
