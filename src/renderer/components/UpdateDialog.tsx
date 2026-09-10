import { useEffect, useRef, useState } from "react";
import type { UpdateState } from "../../update-types";

export function UpdateDialog({ state, onLater, onRestart }: { state: UpdateState; onLater: () => void; onRestart: () => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const restartPending = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = ["downloading", "ready", "restarting"].includes(state.phase);
  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => {
    if (state.phase !== "ready" || restartPending.current) return;
    restartPending.current = true;
    void onRestart().catch(cause => { setError(cause instanceof Error ? cause.message : "Unable to restart."); restartPending.current = false; });
  }, [state.phase, onRestart]);
  const close = () => { if (!busy && !pending) onLater(); };
  const install = async () => {
    if (pending) return;
    setPending(true); setError("");
    try {
      const result = state.release?.automatic ? await window.presetApp.updates.install() : await window.presetApp.updates.openDownload();
      if (result.status === "error") throw new Error(result.error);
      if (!state.release?.automatic) onLater();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update."); }
    finally { setPending(false); }
  };
  return <dialog ref={ref} className="preset-dialog update-dialog" aria-labelledby="updateTitle" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="preset-dialog-card">
      <span className="step-label">App update</span><h2 id="updateTitle">{busy ? "Updating your app" : "A new version is available"}</h2>
      <p>Version {state.release?.version} is available. You’re using {state.currentVersion}.</p>
      {busy ? <p role="status">{state.phase === "downloading" ? "Downloading and preparing the update… The app will restart when it’s ready." : "Saving your presets and restarting…"}</p> : state.release?.automatic ?
        <p>Update now and restart the app. Your saved presets, options, settings, and login will be kept.</p> :
        <p>This copy needs a manual update. Download and run the latest Windows installer to enable automatic updates. Your saved presets, options, settings, and login will be kept.</p>}
      {(error || state.error) && <p className="community-error" role="alert">{error || state.error}</p>}
      <div className="dialog-actions">
        {!busy && <><button className="button button-ghost" autoFocus disabled={pending} onClick={close}>Later</button><button className="button button-primary" disabled={pending} onClick={() => void install()}>{state.release?.automatic ? "Update and restart" : "Download update"}</button></>}
        {error && state.phase === "ready" && <button className="button button-primary" onClick={() => { setError(""); void onRestart().catch(cause => setError(String(cause.message))); }}>Retry restart</button>}
      </div>
    </div>
  </dialog>;
}
