import { redirect } from "next/navigation";

// Access is the only settings page for now
export default function SettingsPage() {
  redirect("/settings/access");
}
