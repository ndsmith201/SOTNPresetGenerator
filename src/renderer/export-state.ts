export interface SuccessfulExport {
  localPresetId: string;
  directory: string;
  json: string;
  buildToken: string;
}

export function exportMatchesCurrent(exported: SuccessfulExport | undefined, localPresetId: string | null, directory: string, json: string): boolean {
  return Boolean(exported && exported.localPresetId === localPresetId && exported.directory === directory && exported.json === json);
}
