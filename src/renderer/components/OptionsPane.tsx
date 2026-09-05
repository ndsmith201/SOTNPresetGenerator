import { useMemo, useState } from "react";
import type { OptionCategory, OptionFilter, Preset, PresetOption } from "../types";
import { BuiltInSettings } from "./BuiltInSettings";
import { Icon } from "./Icon";
import { OptionGroups } from "./OptionGroups";
import { ComplexityControl, MetaExtensionControl } from "./PresetControls";

interface OptionsPaneProps {
  preset: Preset;
  options: PresetOption[];
  onChange: (changes: Partial<Preset>) => void;
  onNewOption: () => void;
}

export function OptionsPane({ preset, options, onChange, onNewOption }: OptionsPaneProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<OptionFilter>("all");
  const selected = useMemo(() => new Set(preset.optionIds), [preset.optionIds]);
  const groups = useMemo(() => {
    const result = new Map<OptionCategory, PresetOption[]>();
    options.forEach((option) => {
      const matchesSearch = `${option.label} ${option.description}`.toLowerCase().includes(query.trim().toLowerCase());
      const matchesFilter = filter === "all" || selected.has(option.id);
      if (matchesSearch && matchesFilter) result.set(option.category, [...(result.get(option.category) ?? []), option]);
    });
    return result;
  }, [filter, options, query, selected]);

  const toggleOption = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ optionIds: [...next] });
  };

  return (
    <section className="options-pane" aria-labelledby="options-title">
      <div className="pane-heading">
        <div><span className="step-label">01 / Configure</span><h2 id="options-title">Choose options</h2><strong className="editing-preset-name">{preset.name}</strong><p>Mix and match settings to shape your next run.</p></div>
        <div className="selection-count" aria-live="polite"><strong>{selected.size}</strong><span>selected</span></div>
      </div>
      <label className="search-box">
        <Icon name="search" /><input id="optionSearch" type="search" placeholder="Search options…" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd>
      </label>
      <ComplexityControl value={preset.complexity} onChange={(complexity) => onChange({ complexity })} />
      <MetaExtensionControl value={preset.metaExtension} onChange={(metaExtension) => onChange({ metaExtension })} />
      <BuiltInSettings value={preset.builtInSettings} onChange={(builtInSettings) => onChange({ builtInSettings })} />
      <div className="option-toolbar">
        <div className="filter-tabs" role="tablist" aria-label="Option filters">
          {(["all", "selected"] as const).map((value) => <button className={`filter-tab${filter === value ? " is-active" : ""}`} type="button" key={value} onClick={() => setFilter(value)}>{value === "all" ? "All" : "Selected"}</button>)}
        </div>
        <div className="option-toolbar-actions"><button className="text-button add-option-button" type="button" onClick={onNewOption}>+ New option</button><button className="text-button" type="button" onClick={() => onChange({ optionIds: [] })}>Clear all</button></div>
      </div>
      <OptionGroups groups={groups} selected={selected} onToggle={toggleOption} />
    </section>
  );
}
