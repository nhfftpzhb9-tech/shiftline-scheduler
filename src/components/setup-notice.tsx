import { Database, ShieldCheck, Smartphone } from "lucide-react";

export function SetupNotice() {
  return <main className="setup-screen">
    <div className="setup-card">
      <div className="brand-mark brand-mark-large">S</div>
      <p className="eyebrow">Shiftline setup</p>
      <h1>Connect your workspace</h1>
      <p className="muted setup-lead">Shiftline stores your schedules in a secure database so they stay in sync on your Mac and iPhone.</p>
      <ol className="setup-steps">
        <li><span>1</span><div><strong>Create a Supabase project</strong><p>Set up a free project at supabase.com and open its SQL Editor.</p></div><Database size={18} /></li>
        <li><span>2</span><div><strong>Install the database schema</strong><p>Run the SQL in <code>supabase/schema.sql</code> from this repository.</p></div><ShieldCheck size={18} /></li>
        <li><span>3</span><div><strong>Add your project keys</strong><p>Copy <code>.env.example</code> to <code>.env.local</code>, then add your project URL and publishable key.</p></div><Smartphone size={18} /></li>
        <li><span>4</span><div><strong>Create your manager login</strong><p>In Supabase Authentication, add your user and turn off public sign-ups.</p></div><ShieldCheck size={18} /></li>
      </ol>
      <div className="setup-footnote">Restart the development server after saving <code>.env.local</code>.</div>
    </div>
  </main>;
}
