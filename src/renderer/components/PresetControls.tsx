import { META_EXTENSIONS, MIN_COMPLEXITY } from "../constants";
import type { MetaExtension } from "../types";

export function ComplexityControl({ value, maximum, onChange }: { value: number; maximum: number; onChange: (value: number) => void }) {
  const minimum = Math.min(MIN_COMPLEXITY, maximum);
  return (
    <section className="complexity-control" aria-labelledby="complexityLabel">
      <div className="complexity-heading"><div><strong id="complexityLabel">Complexity target</strong><span id="complexityHelp">{maximum === 0 ? "Starting relics already open every check through Trio." : `Maximum ${maximum}, based on starting relics and checks through Trio.`}</span></div><output>{value}</output></div>
      <input type="range" min={minimum} max={maximum} step="1" value={value} disabled={maximum === minimum} aria-labelledby="complexityLabel" aria-describedby="complexityHelp" onChange={(event) => onChange(Number(event.target.value))} />
      <div className="complexity-scale" aria-hidden="true"><span>{minimum}</span><span>{maximum}</span></div>
    </section>
  );
}

export function MetaExtensionControl({ value, onChange }: { value: MetaExtension; onChange: (value: MetaExtension) => void }) {
  return (
    <label className="extension-control">
      <span><strong>Relic location extension</strong><small>Controls the preset&apos;s available relic check locations.</small></span>
      <select value={value} onChange={(event) => onChange(event.target.value as MetaExtension)}>
        {META_EXTENSIONS.map((extension) => <option value={extension} key={extension}>{extension}</option>)}
      </select>
    </label>
  );
}
