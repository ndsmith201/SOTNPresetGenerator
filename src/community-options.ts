import { unifiedOption } from "./option-writes";

/** The API and review dialog share the same canonical option payload. */
export function optionSubmission(option: object): Record<string, unknown> {
  const source = unifiedOption(option);
  return Object.fromEntries(["comment", "description", "category", "value", "gameInit", "statEdit", "rawJson", "writes"]
    .filter(key => source[key] !== undefined).map(key => [key, source[key]]));
}
