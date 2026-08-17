import { type Finding, type FindingType, extractTagPayload } from "./scanner.js";

export interface TextToken {
  kind: "plain" | FindingType;
  raw: string;
  label?: string;
  codepointHex?: string;
}

export function tokenize(text: string, findings: Finding[]): TextToken[] {
  const tokens: TextToken[] = [];
  let cursor = 0;

  for (const finding of findings) {
    if (finding.offset > cursor) {
      tokens.push({ kind: "plain", raw: text.slice(cursor, finding.offset) });
    }

    const width = finding.codepoint > 0xffff ? 2 : 1;
    tokens.push({
      kind: finding.type,
      raw: text.slice(finding.offset, finding.offset + width),
      label: buildLabel(finding),
      codepointHex: finding.codepointHex,
    });

    cursor = finding.offset + width;
  }

  if (cursor < text.length) {
    tokens.push({ kind: "plain", raw: text.slice(cursor) });
  }

  return tokens;
}

function buildLabel(finding: Finding): string {
  const replacement = finding.decoded ? ` -> '${finding.decoded}'` : "";
  return `[${finding.codepointHex} ${finding.type}${replacement}]`;
}

export function buildSummary(findings: Finding[]): string {
  if (findings.length === 0) {
    return "No suspicious Layer A Unicode characters found";
  }

  const counts = new Map<FindingType, number>();
  for (const finding of findings) {
    counts.set(finding.type, (counts.get(finding.type) ?? 0) + 1);
  }

  const parts = [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, count]) => `${count} ${kind.replaceAll("_", " ")}`);

  const payload = extractTagPayload(findings);
  if (payload) {
    parts.push(`tag payload: '${payload}'`);
  }

  return parts.join(", ");
}

export function isInvisibleTag(codepoint: number): boolean {
  return codepoint >= 0xe0001 && codepoint <= 0xe007f;
}
