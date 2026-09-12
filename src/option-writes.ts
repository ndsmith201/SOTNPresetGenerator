type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Read current options and older catalogs without losing first-write properties. */
export function optionWrites(input: object): JsonObject[] {
  const option = input as JsonObject;
  if (option.rawJson) return [];
  if (option.writes !== undefined) {
    if (!Array.isArray(option.writes) || !option.writes.every(isObject)) throw new Error("Writes must be an array of objects.");
    return structuredClone(option.writes);
  }
  const primary = isObject(option.primaryWrite) ? option.primaryWrite : {
    comment: option.comment, type: option.type, value: option.value, ...(option.address ? { address: option.address } : {})
  };
  const additional = option.additionalWrites ?? [];
  if (!Array.isArray(additional) || !additional.every(isObject)) throw new Error("Additional writes must be an array of objects.");
  return structuredClone([primary, ...additional]);
}

/** Canonical option representation: all memory writes live in one ordered array. */
export function unifiedOption(input: object): JsonObject {
  const { type, address, primaryWrite, additionalWrites, value, ...option } = input as JsonObject;
  return { ...option, ...(option.rawJson ? { value } : {}), writes: optionWrites(input) };
}
