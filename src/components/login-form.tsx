"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: authError } = await createClient().auth.signInWithPassword({ email, password });
    if (authError) {
      setError("That email and password combination was not recognized.");
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return <main className="login-screen">
    <div className="login-panel">
      <div className="brand-lockup"><div className="brand-mark">S</div><span>Shiftline</span></div>
      <div className="login-symbol"><CalendarDays size={22} strokeWidth={1.7} /></div>
      <h1>Good to see you</h1>
      <p className="muted">Sign in to manage your team’s schedule.</p>
      <form className="login-form" onSubmit={submit}>
        <label>Email address<input autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@yourvenue.com" required /></label>
        <label>Password<div className="password-field"><input autoComplete="current-password" type={visible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required /><button className="icon-button password-toggle" type="button" aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        {error && <p className="form-error" role="alert"><LockKeyhole size={15} />{error}</p>}
        <button className="button button-primary button-wide" disabled={busy}>{busy ? <span className="spinner" /> : "Sign in"}</button>
      </form>
      <p className="login-note">Manager access only · Employee accounts are not available</p>
    </div>
  </main>;
}
