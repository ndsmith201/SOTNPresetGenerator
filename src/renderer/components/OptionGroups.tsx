import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OPTION_GROUPS } from "../constants";
import type { OptionCategory, PresetOption } from "../types";
import { Icon, type IconName } from "./Icon";

interface OptionGroupsProps {
  groups: Map<OptionCategory, PresetOption[]>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onEdit: (option: PresetOption) => void;
}

function OptionCard({ option, selected, onToggle, onEdit }: {
  option: PresetOption;
  selected: boolean;
  onToggle: (id: string) => void;
  onEdit: (option: PresetOption) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  const clearTimer = () => clearTimeout(timerRef.current);
  const hide = () => { clearTimer(); setOpen(false); };
  const show = (delay = 350) => {
    clearTimer();
    timerRef.current = setTimeout(() => setOpen(true), delay);
  };
  const leave = () => {
    clearTimer();
    timerRef.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => {
    const dismiss = () => { clearTimeout(timerRef.current); setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    const onScroll = (event: Event) => {
      if (event.target !== tooltipRef.current) dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open || !cardRef.current || !tooltipRef.current) return;
    const card = cardRef.current.getBoundingClientRect();
    const tooltip = tooltipRef.current.getBoundingClientRect();
    const margin = 12;
    const below = card.bottom + 8;
    setPosition({
      left: Math.max(margin, Math.min(card.left, window.innerWidth - tooltip.width - margin)),
      top: Math.max(margin, below + tooltip.height <= window.innerHeight - margin
        ? below : card.top - tooltip.height - 8)
    });
  }, [open, option.label, option.description]);

  return (
    <div ref={cardRef} className={`option-card${selected ? " is-selected" : ""}`}
      onMouseEnter={() => show()} onMouseLeave={leave} onPointerDown={hide}
      onFocus={(event) => { if (event.target.matches(":focus-visible")) show(0); }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) hide(); }}>
      <label className="option-card-label">
        <input type="checkbox" checked={selected} aria-describedby={open ? tooltipId : undefined} onChange={() => onToggle(option.id)} />
        <span className="checkmark"><Icon name="check" /></span>
        <span className="option-copy"><strong>{option.label}</strong>{option.description && <span>{option.description}</span>}</span>
      </label>
      <button className="option-edit-button" type="button" aria-label={`${option.source.readOnly ? "View" : "Edit"} ${option.label}`} onClick={() => { hide(); onEdit(option); }}><Icon name={option.source.readOnly ? "eye" : "pencil"} /></button>
      {open && createPortal(
        <div ref={tooltipRef} id={tooltipId} role="tooltip" className="option-tooltip" style={position}
          onMouseEnter={clearTimer} onMouseLeave={leave} onPointerDown={(event) => event.stopPropagation()}>
          <strong>{option.label}</strong>
          {option.description && <p>{option.description}</p>}
        </div>, document.body
      )}
    </div>
  );
}

export function OptionGroups({ groups, selected, onToggle, onEdit }: OptionGroupsProps) {
  const visibleCount = [...groups.values()].reduce((total, options) => total + options.length, 0);
  if (!visibleCount) return <div className="empty-state"><strong>No matching options</strong><span>Try another search or switch filters.</span></div>;
  return (
    <div className="option-groups">
      {OPTION_GROUPS.map((group) => {
        const options = groups.get(group.id) ?? [];
        if (!options.length) return null;
        return (
          <section className="option-group" aria-labelledby={`group-${group.id}`} key={group.id}>
            <h3 className="group-heading" id={`group-${group.id}`}><Icon name={group.icon as IconName} />{group.label}</h3>
            <div className="option-list">
              {options.map((option) => (
                <OptionCard key={option.id} option={option} selected={selected.has(option.id)} onToggle={onToggle} onEdit={onEdit} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
