import * as vscode from "vscode";
import { type Finding, type FindingType } from "./scanner.js";

type DecorationClass = "danger" | "warning" | "confusable" | "info";

type DecorationSet = Record<DecorationClass, vscode.TextEditorDecorationType>;

let decorations: DecorationSet | undefined;

function gutterIcon(color: string): vscode.Uri {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="${color}"/></svg>`;
  return vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
}

function createDecorations(): DecorationSet {
  if (decorations) return decorations;

  decorations = {
    danger: vscode.window.createTextEditorDecorationType({
      textDecoration: "underline wavy #ff4444",
      gutterIconPath: gutterIcon("#ff4444"),
      gutterIconSize: "contain",
      backgroundColor: new vscode.ThemeColor("inputValidation.errorBackground"),
      border: "1px solid #ff4444",
      overviewRulerColor: "#ff4444",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    }),
    warning: vscode.window.createTextEditorDecorationType({
      textDecoration: "underline wavy #ff9900",
      gutterIconPath: gutterIcon("#ff9900"),
      gutterIconSize: "contain",
      backgroundColor: new vscode.ThemeColor("inputValidation.warningBackground"),
      border: "1px solid #ff9900",
      overviewRulerColor: "#ff9900",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    }),
    confusable: vscode.window.createTextEditorDecorationType({
      textDecoration: "underline wavy #ffcc00",
      gutterIconPath: gutterIcon("#ffcc00"),
      gutterIconSize: "contain",
      backgroundColor: new vscode.ThemeColor("inputValidation.warningBackground"),
      border: "1px solid #ffcc00",
      overviewRulerColor: "#ffcc00",
      overviewRulerLane: vscode.OverviewRulerLane.Center,
    }),
    info: vscode.window.createTextEditorDecorationType({
      textDecoration: "underline dotted #5b9bd5",
      gutterIconPath: gutterIcon("#5b9bd5"),
      gutterIconSize: "contain",
      overviewRulerColor: "#5b9bd5",
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    }),
  };

  return decorations;
}

function decorationClass(type: FindingType): DecorationClass {
  switch (type) {
    case "tag_chars":
    case "private_use":
    case "strip":
    case "zwj_family":
    case "other_cf":
      return "danger";
    case "bidi":
    case "variation_selector":
      return "warning";
    case "confusable":
      return "confusable";
    case "space":
      return "info";
  }
}

export function applyDecorations(editor: vscode.TextEditor, findings: Finding[]): void {
  const types = createDecorations();
  const ranges: Record<DecorationClass, vscode.DecorationOptions[]> = {
    danger: [],
    warning: [],
    confusable: [],
    info: [],
  };

  for (const finding of findings) {
    const start = new vscode.Position(finding.line, finding.character);
    const width = finding.codepoint > 0xffff ? 2 : 1;
    const end = new vscode.Position(finding.line, finding.character + width);
    ranges[decorationClass(finding.type)].push({
      range: new vscode.Range(start, end),
      hoverMessage: new vscode.MarkdownString(buildHoverMessage(finding)),
    });
  }

  editor.setDecorations(types.danger, ranges.danger);
  editor.setDecorations(types.warning, ranges.warning);
  editor.setDecorations(types.confusable, ranges.confusable);
  editor.setDecorations(types.info, ranges.info);
}

export function clearDecorations(editor: vscode.TextEditor): void {
  if (!decorations) return;
  editor.setDecorations(decorations.danger, []);
  editor.setDecorations(decorations.warning, []);
  editor.setDecorations(decorations.confusable, []);
  editor.setDecorations(decorations.info, []);
}

export function disposeDecorations(): void {
  if (!decorations) return;
  decorations.danger.dispose();
  decorations.warning.dispose();
  decorations.confusable.dispose();
  decorations.info.dispose();
  decorations = undefined;
}

function buildHoverMessage(finding: Finding): string {
  const decoded = finding.decoded ? `| Suggested replacement | \`${finding.decoded}\` |\n` : "";

  return [
    `**Layer A Unicode finding: ${finding.type}**`,
    "",
    "| Field | Value |",
    "|---|---|",
    `| Codepoint | \`${finding.codepointHex}\` |`,
    `| Confidence | ${finding.confidence} |`,
    `| Line | ${finding.line + 1} |`,
    `| Column | ${finding.character + 1} |`,
    decoded.trimEnd(),
    "",
    finding.description,
    "",
    "_Run **Reveal Hidden Payload** to inspect all findings in this document._",
  ].filter(Boolean).join("\n");
}
