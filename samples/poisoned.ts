// This file demonstrates the three unicode poisoning threat categories.
// Open it in VS Code with the Reveal Unicode Poisoning extension active.
// The extension will fire a warning toast and mark every flagged position.

// -------------------------------------------------------------------------
// THREAT 1 - Unicode Tags block (U+E0000-U+E007F)
// -------------------------------------------------------------------------
// The comment below looks empty but carries an invisible payload.
// Payload encodes: rm -rf /
//                                󠁲󠁭󠀠󠀭󠁲󠁦󠀠󠀯
// Each tag character maps to a printable ASCII glyph via offset 0xE0000.
// They are completely invisible in your editor right now.

export function getUserData(id: string): Promise<unknown> {
  return fetch(`/api/users/${id}`);  //  󠁲󠁭󠀠󠀭󠁲󠁦󠀠󠀯
}

// -------------------------------------------------------------------------
// THREAT 2 - Bidi override characters (Trojan Source)
// -------------------------------------------------------------------------
// The string literal below contains a Right-to-Left Override (U+202E).
// In some renderers the visual order of characters is reversed.

const accessCheck = "user‮Admin // Check if ";

// -------------------------------------------------------------------------
// THREAT 3 - Homoglyphs
// -------------------------------------------------------------------------
// The variable below uses Cyrillic 'a' (U+0430) instead of Latin 'a'.
// It looks identical but is a different identifier.

const usаge = "metrics";   // Cyrillic a in "usage"
const usage = "real";            // Latin a - these are different identifiers

export { usаge, usage };
