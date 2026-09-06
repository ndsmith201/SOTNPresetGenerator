import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

interface WindowBarProps {
  editing: boolean;
  compactMode: boolean;
  wrapJson: boolean;
  exportPath: string;
  author: string;
  onEditAuthor: () => void;
  onDeletePreset: () => void;
  onNewPreset: () => void;
  onSavePreset: () => void;
  onShowLibrary: () => void;
  onToggleCompact: () => void;
  onToggleWrap: () => void;
  onChooseExportPath: () => void;
}

export function WindowBar(props: WindowBarProps) {
  const [openMenu, setOpenMenu] = useState<"file" | "settings" | null>(null);
  const menuRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const act = (callback: () => void) => {
    setOpenMenu(null);
    callback();
  };

  return (
    <div className="window-bar">
      <nav className="app-menu" aria-label="Application menu" ref={menuRef}>
        <div className="menu-root">
          <button className="menu-trigger" type="button" aria-haspopup="menu" aria-expanded={openMenu === "file"} onClick={() => setOpenMenu(openMenu === "file" ? null : "file")}>File</button>
          <div className="menu-popover" role="menu" hidden={openMenu !== "file"}>
            <button type="button" role="menuitem" onClick={() => act(props.onNewPreset)}><span>New preset</span><kbd>Ctrl N</kbd></button>
            {props.editing && <button type="button" role="menuitem" onClick={() => act(props.onSavePreset)}><span>Save preset</span><kbd>Ctrl S</kbd></button>}
            {props.editing && <button type="button" role="menuitem" onClick={() => act(props.onShowLibrary)}>Preset library</button>}
            {props.editing && <button className="danger-text" type="button" role="menuitem" onClick={() => act(props.onDeletePreset)}>Delete preset…</button>}
            <span className="menu-separator" role="separator" />
            <button type="button" role="menuitem" onClick={() => window.presetApp.windowControls.close()}>Exit</button>
          </div>
        </div>
        <div className="menu-root">
          <button className="menu-trigger" type="button" aria-haspopup="menu" aria-expanded={openMenu === "settings"} onClick={() => setOpenMenu(openMenu === "settings" ? null : "settings")}>Settings</button>
          <div className="menu-popover settings-menu" role="menu" hidden={openMenu !== "settings"}>
            <button type="button" role="menuitemcheckbox" aria-checked={props.compactMode} onClick={() => act(props.onToggleCompact)}><span className="menu-checkbox"><Icon name="check" /></span>Compact option cards</button>
            <button type="button" role="menuitemcheckbox" aria-checked={props.wrapJson} onClick={() => act(props.onToggleWrap)}><span className="menu-checkbox"><Icon name="check" /></span>Wrap JSON lines</button>
            <span className="menu-separator" role="separator" />
            <button className="path-menu-item" type="button" role="menuitem" onClick={() => act(props.onChooseExportPath)}>
              <span className="path-menu-copy"><strong>Export directory</strong><small title={props.exportPath}>{props.exportPath || "Not selected"}</small></span>
              <Icon name="folder" />
            </button>
            <button className="path-menu-item" type="button" role="menuitem" onClick={() => act(props.onEditAuthor)}>
              <span className="path-menu-copy"><strong>Preset author</strong><small title={props.author}>{props.author || "Use template author"}</small></span>
              <Icon name="file" />
            </button>
          </div>
        </div>
      </nav>
      <span className="window-title">SOTN Preset Generator</span>
      <div className="window-controls" aria-label="Window controls">
        <button type="button" aria-label="Minimize" onClick={() => window.presetApp.windowControls.minimize()}><svg viewBox="0 0 12 12"><path d="M2 6.5h8" /></svg></button>
        <button type="button" aria-label="Maximize" onClick={() => window.presetApp.windowControls.toggleMaximize()}><svg viewBox="0 0 12 12"><rect x="2.25" y="2.25" width="7.5" height="7.5" /></svg></button>
        <button className="window-close" type="button" aria-label="Close" onClick={() => window.presetApp.windowControls.close()}><svg viewBox="0 0 12 12"><path d="m2.5 2.5 7 7M9.5 2.5l-7 7" /></svg></button>
      </div>
    </div>
  );
}
