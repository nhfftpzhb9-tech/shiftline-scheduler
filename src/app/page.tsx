import { redirect } from "next/navigation";
import { PlannerApp } from "@/components/planner-app";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <PlannerApp userId={user.id} userEmail={user.email ?? ""} />;
}
