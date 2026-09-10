import { useEffect, useRef, useState } from "react";
import type { CommunityStatus } from "../../community-types";
import { communityRequest } from "../community-api";
import { Icon } from "./Icon";

export function LoginDialog({ onClose, onSignedIn }: { onClose: () => void; onSignedIn: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [tab, setTab] = useState<"signIn" | "signUp">("signIn");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<CommunityStatus | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    ref.current?.showModal();
    let canceled = false;
    void communityRequest<CommunityStatus>({ action: "status" }).then(value => { if (!canceled) setAccount(value); }).catch(cause => { if (!canceled) setError(String(cause.message)); });
    return () => { canceled = true; };
  }, []);
  const submit = async () => {
    if (pending.current) return;
    setError(""); setMessage("");
    if (tab === "signUp" && !account?.signedIn && password !== confirm) { setError("Passwords do not match."); return; }
    pending.current = true; setBusy(true);
    try {
      const result = await communityRequest<{ account: CommunityStatus; message: string }>({ action: "account", account: { action: account?.signedIn ? "signOut" : tab, username, password } });
      setAccount(result.account); setMessage(result.message);
      if (result.account.signedIn) onSignedIn();
      else setTab("signIn");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to sign in."); }
    finally { setPassword(""); setConfirm(""); pending.current = false; setBusy(false); }
  };
  const close = () => { if (!pending.current) onClose(); };
  return <dialog className="preset-dialog login-dialog" ref={ref} aria-labelledby="loginTitle" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="preset-dialog-card">
      <button className="dialog-close" type="button" aria-label="Close login" disabled={busy} onClick={close}><Icon name="close" /></button>
      <span className="step-label" id="loginTitle">Community</span>{account?.signedIn && <h2>Your account</h2>}
      {account?.signedIn ? <><p>Signed in as <strong>{account.email}</strong></p><button className="button button-ghost" disabled={busy || Boolean(account.config.devUser)} onClick={() => void submit()}>Sign out</button></> : <>
        <div className="login-tabs" role="tablist" aria-label="Account">
          {(["signIn", "signUp"] as const).map(value => <button key={value} id={`${value}Tab`} role="tab" type="button" aria-selected={tab === value} aria-controls="loginPanel" className={`filter-tab${tab === value ? " is-active" : ""}`} disabled={busy} onClick={() => { setTab(value); setPassword(""); setConfirm(""); setError(""); setMessage(""); }}>{value === "signIn" ? "Sign in" : "Sign up"}</button>)}
        </div>
        <form id="loginPanel" role="tabpanel" aria-labelledby={`${tab}Tab`} onSubmit={event => { event.preventDefault(); void submit(); }}>
          <fieldset className="community-fields" disabled={busy}>
            <label htmlFor="loginUsername">Username</label><input id="loginUsername" autoFocus autoComplete="username" required maxLength={128} value={username} onChange={event => setUsername(event.target.value)} />
            <label htmlFor="loginPassword">Password</label><input id="loginPassword" type="password" autoComplete={tab === "signIn" ? "current-password" : "new-password"} required maxLength={256} value={password} onChange={event => setPassword(event.target.value)} />
            {tab === "signUp" && <><label htmlFor="loginConfirm">Confirm password</label><input id="loginConfirm" type="password" autoComplete="new-password" required maxLength={256} value={confirm} onChange={event => setConfirm(event.target.value)} /></>}
            <button className="button button-primary" type="submit">{busy ? "Please wait…" : tab === "signIn" ? "Sign in" : "Sign up"}</button>
          </fieldset>
        </form>
      </>}
      {error && <p className="community-error" role="alert">{error}</p>}
      {message && <p className="community-message" role="status">{message}</p>}
    </div>
  </dialog>;
}
