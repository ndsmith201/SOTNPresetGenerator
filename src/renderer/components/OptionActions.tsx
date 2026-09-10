import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PresetOption } from "../types";
import { Icon } from "./Icon";

export function OptionActions({ option, onEdit, onShare, onDelete }: {
  option: PresetOption;
  onEdit: (option: PresetOption) => void;
  onShare: (option: PresetOption) => void;
  onDelete: (option: PresetOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = (restoreFocus = false) => { setOpen(false); if (restoreFocus) trigger.current?.focus(); };
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const button = trigger.current.getBoundingClientRect();
    const bounds = menu.current.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(button.right - bounds.width, window.innerWidth - bounds.width - 8)), top: Math.max(8, button.bottom + bounds.height + 6 < window.innerHeight ? button.bottom + 6 : button.top - bounds.height - 6) });
    menu.current.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    const dismiss = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", dismiss); window.removeEventListener("scroll", dismiss, true); };
  }, [open]);
  const act = (callback: (option: PresetOption) => void) => { close(true); callback(option); };
  return <>
    <button ref={trigger} className="option-edit-button" type="button" aria-label={`Actions for ${option.label}`} title={`Actions for ${option.label}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(value => !value)} onKeyDown={event => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setOpen(true); } }}><Icon name="menu" /></button>
    {open && createPortal(<div ref={menu} id={id} className="option-actions-menu" role="menu" aria-label={`Actions for ${option.label}`} style={position}
      onPointerDown={event => event.stopPropagation()} onFocus={event => event.stopPropagation()} onMouseEnter={event => event.stopPropagation()} onMouseLeave={event => event.stopPropagation()} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
          const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
          buttons[index]?.focus();
        }
      }}>
      <button role="menuitem" type="button" onClick={() => act(onEdit)}><Icon name={option.source.readOnly ? "eye" : "pencil"} />{option.source.readOnly ? "View" : "Edit"}</button>
      {!option.source.readOnly && <>
        <button role="menuitem" type="button" onClick={() => act(onShare)}><Icon name="share" />Share</button>
        <button role="menuitem" type="button" className="danger-text" onClick={() => act(onDelete)}><Icon name="trash" />Delete</button>
      </>}
    </div>, document.body)}
  </>;
}
