/** Only send fields supported by the community API's strict option schema. */
export function optionSubmission(option: object): Record<string, unknown> {
  const source = option as Record<string, unknown>;
  // primaryWrite is local editor metadata; type/value/address already describe
  // the first write in the API format.
  return Object.fromEntries(["comment", "description", "category", "type", "value", "address", "gameInit", "statEdit", "rawJson", "additionalWrites"]
    .filter(key => source[key] !== undefined).map(key => [key, source[key]]));
}
