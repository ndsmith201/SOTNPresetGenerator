import { OPTION_GROUPS } from "../constants";
import type { OptionCategory, PresetOption } from "../types";
import { Icon, type IconName } from "./Icon";

interface OptionGroupsProps {
  groups: Map<OptionCategory, PresetOption[]>;
  selected: Set<string>;
  onToggle: (id: string) => void;
}

export function OptionGroups({ groups, selected, onToggle }: OptionGroupsProps) {
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
                <label className={`option-card${selected.has(option.id) ? " is-selected" : ""}`} key={option.id}>
                  <input type="checkbox" checked={selected.has(option.id)} onChange={() => onToggle(option.id)} />
                  <span className="checkmark"><Icon name="check" /></span>
                  <span className="option-copy"><strong>{option.label}</strong><span>{option.description}</span></span>
                </label>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
