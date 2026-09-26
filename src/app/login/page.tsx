import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/");
  return <LoginForm />;
}
