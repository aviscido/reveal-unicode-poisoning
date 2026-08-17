import * as vscode from "vscode";
import { type Finding, extractTagPayload } from "./scanner.js";
import { buildSummary, tokenize } from "./decoder.js";

let currentPanel: vscode.WebviewPanel | undefined;

export function showRevealPanel(
  context: vscode.ExtensionContext,
  document: vscode.TextDocument,
  findings: Finding[],
): void {
  const title = `Unicode Layer A — ${document.fileName.split(/[\\/]/).pop() ?? "file"}`;

  if (currentPanel) {
    currentPanel.title = title;
    currentPanel.reveal(vscode.ViewColumn.Beside);
  } else {
    currentPanel = vscode.window.createWebviewPanel(
      "unicodePoisonReveal",
      title,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      },
    );

    currentPanel.onDidDispose(() => {
      currentPanel = undefined;
    });

    currentPanel.webview.onDidReceiveMessage((message: unknown) => {
      if (!isCopyMessage(message)) return;
      void vscode.env.clipboard.writeText(message.text);
      void vscode.window.showInformationMessage("Copied decoded tag payload to clipboard.");
    });
  }

  currentPanel.webview.html = buildHtml(document.getText(), findings);
}

export function closeRevealPanel(): void {
  currentPanel?.dispose();
}

function isCopyMessage(message: unknown): message is { command: "copy"; text: string } {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as { command?: unknown; text?: unknown };
  return candidate.command === "copy" && typeof candidate.text === "string";
}

function buildHtml(text: string, findings: Finding[]): string {
  const payload = extractTagPayload(findings);
  const summary = buildSummary(findings);
  const tokens = tokenize(text, findings);
  const nonce = randomNonce();

  const tokenHtml = tokens.map((token) => {
    if (token.kind === "plain") return escHtml(token.raw);
    return `<mark class="${escAttr(token.kind)}" title="${escAttr(token.label ?? "Unicode finding")}">${escHtml(token.label ?? token.raw)}</mark>`;
  }).join("");

  const rows = findings.map((finding) => {
    return `<tr>
      <td>${finding.line + 1}</td>
      <td>${finding.character + 1}</td>
      <td><code>${escHtml(finding.codepointHex)}</code></td>
      <td>${escHtml(finding.type)}</td>
      <td>${escHtml(finding.confidence)}</td>
      <td><code>${escHtml(finding.decoded || "—")}</code></td>
      <td>${escHtml(finding.description)}</td>
    </tr>`;
  }).join("");

  const banner = payload
    ? `<section class="banner danger"><strong>Decoded Unicode tag payload:</strong> <code>${escHtml(payload)}</code> <button id="copy">Copy</button></section>`
    : findings.length > 0
      ? `<section class="banner warning"><strong>Layer A findings detected.</strong> Review each occurrence below before modifying the source.</section>`
      : `<section class="banner ok"><strong>No Layer A findings.</strong></section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Unicode Layer A Review</title>
<style>
  body { color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); margin: 0; padding: 20px; }
  h1, h2 { margin: 0 0 12px; }
  .summary { color: var(--vscode-descriptionForeground); margin-bottom: 16px; }
  .banner { border-radius: 6px; margin: 16px 0; padding: 12px; }
  .danger { background: rgba(255, 68, 68, .18); border: 1px solid #ff4444; }
  .warning { background: rgba(255, 153, 0, .18); border: 1px solid #ff9900; }
  .ok { background: rgba(78, 201, 176, .15); border: 1px solid #4ec9b0; }
  button { margin-left: 8px; }
  pre { background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-panel-border); overflow: auto; padding: 12px; white-space: pre-wrap; word-break: break-word; }
  mark { border-radius: 3px; color: inherit; font-family: var(--vscode-editor-font-family); padding: 1px 3px; }
  mark.strip, mark.zwj_family, mark.tag_chars, mark.private_use, mark.other_cf { background: rgba(255, 68, 68, .35); border: 1px solid #ff4444; }
  mark.bidi, mark.variation_selector { background: rgba(255, 153, 0, .35); border: 1px solid #ff9900; }
  mark.confusable { background: rgba(255, 204, 0, .35); border: 1px solid #ffcc00; }
  mark.space { background: rgba(91, 155, 213, .28); border: 1px dotted #5b9bd5; }
  table { border-collapse: collapse; display: block; max-width: 100%; overflow: auto; }
  th, td { border: 1px solid var(--vscode-panel-border); padding: 7px; text-align: left; vertical-align: top; }
  th { background: var(--vscode-editor-inactiveSelectionBackground); }
  code { font-family: var(--vscode-editor-font-family); }
</style>
</head>
<body>
<h1>Unicode Layer A Review</h1>
<p class="summary">${escHtml(summary)}</p>
${banner}
<h2>Annotated source</h2>
<pre>${tokenHtml}</pre>
<h2>Findings (${findings.length})</h2>
<table>
<thead><tr><th>Line</th><th>Column</th><th>Code point</th><th>Kind</th><th>Confidence</th><th>Decoded / replacement</th><th>Description</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  document.getElementById('copy')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'copy', text: ${JSON.stringify(payload)} });
  });
</script>
</body>
</html>`;
}

function escHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escAttr(value: string): string {
  return escHtml(value).replaceAll("`", "&#096;");
}

function randomNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return nonce;
}
