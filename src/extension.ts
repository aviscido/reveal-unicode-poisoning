import * as vscode from "vscode";
import { type Finding, type ScanOptions, extractTagPayload, scan } from "./scanner.js";
import { buildSummary } from "./decoder.js";
import { applyDecorations, clearDecorations, disposeDecorations } from "./decorations.js";
import { closeRevealPanel, showRevealPanel } from "./panel.js";

let statusBarItem: vscode.StatusBarItem;
let diagnosticCollection: vscode.DiagnosticCollection;
const findingsCache = new Map<string, Finding[]>();
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
const debounceMs = 300;

export function activate(context: vscode.ExtensionContext): void {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = "unicodePoisonDetector.reveal";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  diagnosticCollection = vscode.languages.createDiagnosticCollection("unicodePoisonDetector");
  context.subscriptions.push(diagnosticCollection);

  context.subscriptions.push(
    vscode.commands.registerCommand("unicodePoisonDetector.scan", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) runScan(editor, context, true);
    }),
    vscode.commands.registerCommand("unicodePoisonDetector.reveal", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const findings = findingsCache.get(editor.document.uri.toString()) ??
        scan(editor.document.getText(), currentScanOptions());
      showRevealPanel(context, editor.document, findings);
    }),
    vscode.commands.registerCommand("unicodePoisonDetector.strip", () => {
      void vscode.window.showWarningMessage(
        "Automatic stripping is disabled in this local fork. Use Reveal Hidden Payload to review findings; add a diff-based cleanup command before editing files.",
        { modal: true },
      );
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) {
        updateStatusBar(null);
        return;
      }

      if (config().get<boolean>("scanOnOpen", true)) {
        runScan(editor, context, false);
        return;
      }

      const cached = findingsCache.get(editor.document.uri.toString());
      if (cached) {
        updateStatusBar(cached);
        applyDecorations(editor, cached);
      } else {
        updateStatusBar([]);
        clearDecorations(editor);
      }
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (!config().get<boolean>("scanOnSave", true)) return;
      const editor = editorForDocument(document);
      if (editor) runScan(editor, context, false);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.contentChanges.length === 0) return;
      const editor = editorForDocument(event.document);
      if (!editor) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        runScan(editor, context, false);
      }, debounceMs);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      findingsCache.delete(document.uri.toString());
      diagnosticCollection.delete(document.uri);
    }),
  );

  if (vscode.window.activeTextEditor) {
    runScan(vscode.window.activeTextEditor, context, false);
  } else {
    updateStatusBar([]);
  }
}

export function deactivate(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  disposeDecorations();
  closeRevealPanel();
  findingsCache.clear();
}

function config(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("unicodePoisonDetector");
}

function currentScanOptions(): ScanOptions {
  return {
    aggressive: config().get<boolean>("aggressive", true),
    stripEmojiGlue: config().get<boolean>("stripEmojiGlue", false),
  };
}

function editorForDocument(document: vscode.TextDocument): vscode.TextEditor | undefined {
  return vscode.window.visibleTextEditors.find((editor) => editor.document.uri.toString() === document.uri.toString());
}

function runScan(editor: vscode.TextEditor, context: vscode.ExtensionContext, notifyOnTagPayload: boolean): void {
  const findings = scan(editor.document.getText(), currentScanOptions());
  const uri = editor.document.uri.toString();
  const previous = findingsCache.get(uri) ?? [];

  findingsCache.set(uri, findings);
  updateStatusBar(findings);
  applyDecorations(editor, findings);
  pushDiagnostics(editor.document, findings);

  const previousTags = previous.filter((finding) => finding.type === "tag_chars").length;
  const tagCount = findings.filter((finding) => finding.type === "tag_chars").length;
  if (tagCount > 0 && (notifyOnTagPayload || tagCount > previousTags)) {
    const payload = extractTagPayload(findings);
    void vscode.window.showWarningMessage(
      `Unicode tag payload detected: ${tagCount} tag character${tagCount === 1 ? "" : "s"}.${payload ? ` Decoded payload: "${payload}"` : ""}`,
      "Reveal",
      "Dismiss",
    ).then((choice) => {
      if (choice === "Reveal") showRevealPanel(context, editor.document, findings);
    });
  }
}

function updateStatusBar(findings: Finding[] | null): void {
  if (findings === null) {
    statusBarItem.text = "$(shield) Unicode";
    statusBarItem.tooltip = "No active file";
    statusBarItem.color = undefined;
    statusBarItem.backgroundColor = undefined;
    return;
  }

  const danger = findings.filter((finding) =>
    ["tag_chars", "private_use", "strip", "zwj_family", "other_cf"].includes(finding.type),
  ).length;
  const warnings = findings.filter((finding) =>
    ["bidi", "variation_selector", "confusable"].includes(finding.type),
  ).length;

  if (danger > 0) {
    statusBarItem.text = `$(warning) ${findings.length} Unicode finding${findings.length === 1 ? "" : "s"}`;
    statusBarItem.tooltip = buildSummary(findings);
    statusBarItem.color = "#ff4444";
    statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
  } else if (warnings > 0) {
    statusBarItem.text = `$(warning) ${findings.length} Unicode finding${findings.length === 1 ? "" : "s"}`;
    statusBarItem.tooltip = buildSummary(findings);
    statusBarItem.color = "#ff9900";
    statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  } else if (findings.length > 0) {
    statusBarItem.text = `$(info) ${findings.length} Unicode space${findings.length === 1 ? "" : "s"}`;
    statusBarItem.tooltip = buildSummary(findings);
    statusBarItem.color = "#5b9bd5";
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = "$(shield) Unicode OK";
    statusBarItem.tooltip = "No suspicious Layer A Unicode characters found in this file.";
    statusBarItem.color = "#4ec9b0";
    statusBarItem.backgroundColor = undefined;
  }
}

function pushDiagnostics(document: vscode.TextDocument, findings: Finding[]): void {
  const configuredSeverity = config().get<string>("severity", "error");
  const tagSeverity = severityFor(configuredSeverity);

  const diagnostics = findings.map((finding) => {
    const severity = finding.type === "tag_chars"
      ? tagSeverity
      : finding.type === "space"
        ? vscode.DiagnosticSeverity.Information
        : finding.type === "confusable" || finding.type === "bidi" || finding.type === "variation_selector"
          ? vscode.DiagnosticSeverity.Warning
          : vscode.DiagnosticSeverity.Error;

    const width = finding.codepoint > 0xffff ? 2 : 1;
    const range = new vscode.Range(
      new vscode.Position(finding.line, finding.character),
      new vscode.Position(finding.line, finding.character + width),
    );
    const diagnostic = new vscode.Diagnostic(range, finding.description, severity);
    diagnostic.source = "Unicode Layer A Detector";
    diagnostic.code = finding.codepointHex;
    return diagnostic;
  });

  diagnosticCollection.set(document.uri, diagnostics);
}

function severityFor(value: string): vscode.DiagnosticSeverity {
  switch (value) {
    case "warning": return vscode.DiagnosticSeverity.Warning;
    case "info": return vscode.DiagnosticSeverity.Information;
    default: return vscode.DiagnosticSeverity.Error;
  }
}
