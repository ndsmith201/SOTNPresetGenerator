import { MAX_COMPLEXITY, META_EXTENSIONS, MIN_COMPLEXITY } from "../constants";
import type { MetaExtension } from "../types";

export function ComplexityControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <section className="complexity-control" aria-labelledby="complexityLabel">
      <div className="complexity-heading"><div><strong id="complexityLabel">Complexity target</strong><span>Minimum logic depth; higher values can take longer to generate.</span></div><output>{value}</output></div>
      <input type="range" min={MIN_COMPLEXITY} max={MAX_COMPLEXITY} step="1" value={value} aria-labelledby="complexityLabel" onChange={(event) => onChange(Number(event.target.value))} />
      <div className="complexity-scale" aria-hidden="true"><span>{MIN_COMPLEXITY}</span><span>{MAX_COMPLEXITY}</span></div>
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
