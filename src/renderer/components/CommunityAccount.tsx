import { useState } from "react";
import type { AccountAction, CommunityConfig, CommunityStatus } from "../../community-types";
import { communityRequest } from "../community-api";

export function CommunityAccount({ account, busy, run, onAccount }: {
  account: CommunityStatus;
  busy: boolean;
  run: (operation: () => Promise<void>) => void;
  onAccount: (account: CommunityStatus, message: string) => void;
}) {
  const [action, setAction] = useState<AccountAction>("signIn");
  const [email, setEmail] = useState(account.email);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [config, setConfig] = useState<CommunityConfig>(account.config);
  const actions: [AccountAction, string][] = [["signIn", "Sign in"], ["signUp", "Create account"], ["confirm", "Confirm email"], ["resend", "Resend confirmation code"], ["forgot", "Send password reset code"], ["reset", "Reset password"]];
  const submit = (selected: AccountAction) => run(async () => {
    try {
      const result = await communityRequest<{ message: string; account: CommunityStatus }>({ action: "account", account: { action: selected, email, password, code } });
      onAccount(result.account, result.message);
      if (selected === "forgot") setAction("reset");
      else if (selected === "signUp" && result.message.includes("Check your email")) setAction("confirm");
      else if (["confirm", "reset"].includes(selected)) setAction("signIn");
    } finally { setPassword(""); setCode(""); }
  });
  return <div className="community-account">
    <h3>Community account</h3>
    <p>Browse and import without an account. Sign in to share options and presets or vote.</p>
    {account.signedIn ? <div>
      <p>Signed in as <strong>{account.email}</strong></p>
      <p>{account.config.devUser ? "Using a local development identity." : account.remembered ? "Your session is saved securely on this device." : "Your session lasts until the app closes because secure storage is unavailable."}</p>
      {!account.config.devUser && <button className="button button-ghost" disabled={busy} onClick={() => submit("signOut")}>Sign out</button>}
    </div> : <form onSubmit={event => { event.preventDefault(); submit(action); }}>
      <fieldset disabled={busy} className="community-fields">
        <label htmlFor="communityAccountAction">Account action</label>
        <select id="communityAccountAction" value={action} onChange={event => { setAction(event.target.value as AccountAction); setPassword(""); setCode(""); }}>{actions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <label htmlFor="communityEmail">Email address</label>
        <input id="communityEmail" type="email" autoComplete="username" required maxLength={320} value={email} onChange={event => setEmail(event.target.value)} />
        {["signIn", "signUp", "reset"].includes(action) && <>
          <label htmlFor="communityPassword">{action === "reset" ? "New password" : "Password"}</label>
          <input id="communityPassword" type="password" autoComplete={action === "signIn" ? "current-password" : "new-password"} required maxLength={256} value={password} onChange={event => setPassword(event.target.value)} />
          {action !== "signIn" && <p className="community-hint">Use at least 12 characters, including uppercase, lowercase, a number, and a symbol.</p>}
        </>}
        {["confirm", "reset"].includes(action) && <><label htmlFor="communityCode">Email code</label><input id="communityCode" autoComplete="one-time-code" required value={code} onChange={event => setCode(event.target.value)} /></>}
        <button className="button button-primary" type="submit">{actions.find(([value]) => value === action)?.[1]}</button>
      </fieldset>
    </form>}
    <details className="community-connection">
      <summary>Connection settings</summary>
      <p>The public community service is configured by default. Change these fields only to connect to another deployment or a local test server. Saving signs you out.</p>
      <form onSubmit={event => { event.preventDefault(); run(async () => {
        const next = await communityRequest<CommunityStatus>({ action: "configure", config });
        setConfig(next.config); onAccount(next, "Connection settings saved.");
      }); }}>
        <fieldset disabled={busy} className="community-fields">
          <label htmlFor="communityUrl">API URL</label><input id="communityUrl" type="url" required value={config.apiUrl} onChange={event => setConfig({ ...config, apiUrl: event.target.value })} />
          <label htmlFor="communityRegion">Cognito region</label><input id="communityRegion" required value={config.region} onChange={event => setConfig({ ...config, region: event.target.value })} />
          <label htmlFor="communityClient">Cognito app client ID</label><input id="communityClient" required value={config.clientId} onChange={event => setConfig({ ...config, clientId: event.target.value })} />
          <label htmlFor="communityDevUser">Development identity (localhost only)</label><input id="communityDevUser" value={config.devUser} onChange={event => setConfig({ ...config, devUser: event.target.value })} />
          <button className="button button-primary" type="submit">Save connection</button>
          <button className="button button-ghost" type="button" onClick={() => run(async () => { await communityRequest({ action: "health" }); onAccount(account, "Community service is reachable."); })}>Check saved connection</button>
        </fieldset>
      </form>
    </details>
  </div>;
}
