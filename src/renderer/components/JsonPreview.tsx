import type { JsonObject } from "../types";
import { syntaxHighlight } from "../preset-utils";
import { Icon } from "./Icon";

export function JsonPreview({ preview, onCopy }: { preview: JsonObject | null; onCopy: () => void }) {
  const json = preview ? JSON.stringify(preview, null, 2) : "";
  return (
    <aside className="preview-pane" aria-labelledby="preview-title">
      <div className="preview-heading"><div><span className="step-label">02 / Preview</span><h2 id="preview-title">Preset JSON</h2><p>Live preview of your configuration.</p></div><button className="icon-button" type="button" aria-label="Copy JSON" title="Copy JSON" onClick={onCopy}><Icon name="copy" /></button></div>
      <div className="code-window">
        <div className="code-toolbar"><div className="file-label"><Icon name="file" />preset.json</div><span className="valid-indicator"><span /> Valid JSON</span></div>
        {preview ? <pre className="code-preview" aria-label="Generated JSON preview" dangerouslySetInnerHTML={{ __html: syntaxHighlight(json) }} /> : <div className="preview-placeholder"><div className="placeholder-icon"><Icon name="file" /></div><strong>Your preset starts here</strong><span>The preset template could not be loaded.</span></div>}
      </div>
      <div className="preview-footer"><span className="draft-status"><span aria-hidden="true" /> Local draft</span></div>
    </aside>
  );
}
