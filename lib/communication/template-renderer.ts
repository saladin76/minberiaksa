import { knownVariableKeys, sampleVariablesMap } from "./template-variables";

const variablePattern = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

export type TemplateRenderResult = {
  rendered: string;
  variables: string[];
  unknownVariables: string[];
  missingSampleValues: string[];
};

export function extractTemplateVariables(body: string) {
  const found = new Set<string>();
  for (const match of body.matchAll(variablePattern)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

export function renderTemplatePreview(body: string, values: Record<string, string> = sampleVariablesMap()): TemplateRenderResult {
  const variables = extractTemplateVariables(body);
  const known = new Set(knownVariableKeys());
  const unknownVariables = variables.filter((key) => !known.has(key));
  const missingSampleValues = variables.filter((key) => !values[key]);
  const rendered = body.replace(variablePattern, (_match, key: string) => values[key] || `{{${key}}}`);
  return { rendered, variables, unknownVariables, missingSampleValues };
}
