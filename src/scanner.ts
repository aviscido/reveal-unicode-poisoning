export type FindingType =
  | "strip"
  | "bidi"
  | "tag_chars"
  | "variation_selector"
  | "zwj_family"
  | "private_use"
  | "space"
  | "confusable"
  | "other_cf";

export interface ScanOptions {
  aggressive?: boolean;
  stripEmojiGlue?: boolean;
}

export interface Finding {
  offset: number;
  line: number;
  character: number;
  codepoint: number;
  codepointHex: string;
  decoded: string;
  type: FindingType;
  description: string;
  confidence: "informational" | "probable";
}

export const TAG_BLOCK_START = 0xe0001;
export const TAG_BLOCK_END = 0xe007f;
export const TAG_OFFSET = 0xe0000;

const STRIP_CODEPOINTS = new Set<number>([
  0x00ad, 0x034f, 0x061c, 0x115f, 0x1160, 0x17b4, 0x17b5,
  0x180b, 0x180c, 0x180d, 0x180e, 0x200b, 0x200c, 0x200d,
  0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
  0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0x2066, 0x2067,
  0x2068, 0x2069, 0x206a, 0x206b, 0x206c, 0x206d, 0x206e,
  0x206f, 0xfeff, 0xfe00, 0xfe01, 0xfe02, 0xfe03, 0xfe04,
  0xfe05, 0xfe06, 0xfe07, 0xfe08, 0xfe09, 0xfe0a, 0xfe0b,
  0xfe0c, 0xfe0d, 0xfe0e, 0xfe0f, 0xfff9, 0xfffa, 0xfffb,
]);

const SPACE_HOMOGLYPHS = new Map<number, string>([
  [0x00a0, " "], [0x1680, " "], [0x2000, " "], [0x2001, " "],
  [0x2002, " "], [0x2003, " "], [0x2004, " "], [0x2005, " "],
  [0x2006, " "], [0x2007, " "], [0x2008, " "], [0x2009, " "],
  [0x200a, " "], [0x202f, " "], [0x205f, " "], [0x3000, " "],
]);

const LATIN_CONFUSABLES = new Map<number, string>([
  [0x0410, "A"], [0x0412, "B"], [0x0415, "E"], [0x041a, "K"],
  [0x041c, "M"], [0x041d, "H"], [0x041e, "O"], [0x0420, "P"],
  [0x0421, "C"], [0x0422, "T"], [0x0425, "X"], [0x0430, "a"],
  [0x0435, "e"], [0x043e, "o"], [0x0440, "p"], [0x0441, "c"],
  [0x0443, "y"], [0x0445, "x"], [0x0456, "i"],
  [0xff21, "A"], [0xff22, "B"], [0xff23, "C"], [0xff24, "D"],
  [0xff25, "E"], [0xff26, "F"], [0xff27, "G"], [0xff28, "H"],
  [0xff29, "I"], [0xff2a, "J"], [0xff2b, "K"], [0xff2c, "L"],
  [0xff2d, "M"], [0xff2e, "N"], [0xff2f, "O"], [0xff30, "P"],
  [0xff31, "Q"], [0xff32, "R"], [0xff33, "S"], [0xff34, "T"],
  [0xff35, "U"], [0xff36, "V"], [0xff37, "W"], [0xff38, "X"],
  [0xff39, "Y"], [0xff3a, "Z"], [0xff41, "a"], [0xff42, "b"],
  [0xff43, "c"], [0xff44, "d"], [0xff45, "e"], [0xff46, "f"],
  [0xff47, "g"], [0xff48, "h"], [0xff49, "i"], [0xff4a, "j"],
  [0xff4b, "k"], [0xff4c, "l"], [0xff4d, "m"], [0xff4e, "n"],
  [0xff4f, "o"], [0xff50, "p"], [0xff51, "q"], [0xff52, "r"],
  [0xff53, "s"], [0xff54, "t"], [0xff55, "u"], [0xff56, "v"],
  [0xff57, "w"], [0xff58, "x"], [0xff59, "y"], [0xff5a, "z"],
]);

const BIDI_CODEPOINTS = new Set<number>([
  0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c,
  0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
]);

const ZW_FAMILY = new Set<number>([0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x180e]);
const EMOJI_GLUE = new Set<number>([0x200d, 0xfe0e, 0xfe0f]);
const SCRIPT_JOINERS = new Set<number>([0x200c, 0x200d]);
const MONGOLIAN_FVS = new Set<number>([0x180b, 0x180c, 0x180d]);
const KHMER_VOWELS = new Set<number>([0x17b4, 0x17b5]);
const HANGUL_FILLERS = new Set<number>([0x115f, 0x1160]);
const ORTHOGRAPHIC_CF = new Set<number>([
  0x0600, 0x0601, 0x0602, 0x0603, 0x0604, 0x0605,
  0x06dd, 0x070f, 0x08e2, 0x110bd, 0x110cd,
]);

interface Scalar {
  cp: number;
  offset: number;
  width: number;
  char: string;
}

interface Decision {
  suspicious: boolean;
  type?: FindingType;
  decoded?: string;
  advancePreviousKept: boolean;
}

function scalarValues(text: string): Scalar[] {
  const values: Scalar[] = [];
  for (let offset = 0; offset < text.length; ) {
    const cp = text.codePointAt(offset)!;
    const width = cp > 0xffff ? 2 : 1;
    values.push({ cp, offset, width, char: text.slice(offset, offset + width) });
    offset += width;
  }
  return values;
}

function isPrivateUse(cp: number): boolean {
  return (
    (cp >= 0xe000 && cp <= 0xf8ff) ||
    (cp >= 0xf0000 && cp <= 0xffffd) ||
    (cp >= 0x100000 && cp <= 0x10fffd)
  );
}

function isSupplementaryVariationSelector(cp: number): boolean {
  return cp >= 0xe0100 && cp <= 0xe01ef;
}

function isVariationSelector(cp: number): boolean {
  return isSupplementaryVariationSelector(cp) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0x180b && cp <= 0x180d);
}

function isStripCodepoint(cp: number): boolean {
  return STRIP_CODEPOINTS.has(cp) ||
    isSupplementaryVariationSelector(cp) ||
    (cp >= 0xe0001 && cp <= 0xe007f) ||
    isPrivateUse(cp);
}

function stripKind(cp: number): FindingType {
  if (cp >= 0xe0001 && cp <= 0xe007f) return "tag_chars";
  if (isVariationSelector(cp)) return "variation_selector";
  if (BIDI_CODEPOINTS.has(cp)) return "bidi";
  if (ZW_FAMILY.has(cp)) return "zwj_family";
  if (isPrivateUse(cp)) return "private_use";
  return "strip";
}

function isEmojiBase(cp: number): boolean {
  return (
    (cp >= 0x1f000 && cp <= 0x1faff) ||
    (cp >= 0x2190 && cp <= 0x25ff) ||
    (cp >= 0x2600 && cp <= 0x27bf) ||
    (cp >= 0x2b00 && cp <= 0x2bff) ||
    [0x00a9, 0x00ae, 0x2122, 0x3030, 0x303d, 0x3297, 0x3299].includes(cp) ||
    cp === 0x0023 || cp === 0x002a || (cp >= 0x0030 && cp <= 0x0039)
  );
}

function isCjkIdeograph(cp: number): boolean {
  return (
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x20000 && cp <= 0x323af)
  );
}

function isMongolianBase(cp: number): boolean {
  return cp >= 0x1800 && cp <= 0x18af;
}

function isMongolianLetter(cp: number): boolean {
  return cp >= 0x1820 && cp <= 0x1842;
}

function isKhmerLetter(cp: number): boolean {
  return (cp >= 0x1780 && cp <= 0x17a2) || (cp >= 0x17a5 && cp <= 0x17a7);
}

function isHangulJamo(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0xa960 && cp <= 0xa97c) ||
    (cp >= 0xd7b0 && cp <= 0xd7c6)
  );
}

function joiningScript(cp: number): string | undefined {
  const groups: Array<[number, number, string]> = [
    [0x0600, 0x08ff, "arabic"],
    [0x0900, 0x0dff, "indic"],
    [0x0f00, 0x109f, "south-asian"],
    [0x1780, 0x17ff, "khmer"],
    [0x1800, 0x18af, "mongolian"],
  ];
  for (const [start, end, name] of groups) {
    if (cp >= start && cp <= end) return name;
  }
  return undefined;
}

function isKnownCf(cp: number): boolean {
  return (
    cp === 0x00ad || cp === 0x034f || cp === 0x061c ||
    (cp >= 0x0600 && cp <= 0x0605) || cp === 0x06dd || cp === 0x070f ||
    cp === 0x08e2 || cp === 0x110bd || cp === 0x110cd ||
    (cp >= 0x180b && cp <= 0x180e) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x206f) ||
    cp === 0xfeff || (cp >= 0xfff9 && cp <= 0xfffb) ||
    (cp >= 0xe0001 && cp <= 0xe007f)
  );
}

function validFlagTagOffsets(values: Scalar[]): Set<number> {
  const valid = new Set<number>();
  for (let i = 0; i < values.length; i += 1) {
    if (values[i].cp !== 0x1f3f4) continue;
    let j = i + 1;
    while (j < values.length && values[j].cp >= 0xe0020 && values[j].cp <= 0xe007e) j += 1;
    if (j > i + 1 && j < values.length && values[j].cp === 0xe007f) {
      for (let k = i + 1; k <= j; k += 1) valid.add(values[k].offset);
      i = j;
    }
  }
  return valid;
}

function lineMap(text: string): (offset: number) => { line: number; character: number } {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 0x0a) starts.push(i + 1);
  }
  return (offset: number) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >>> 1;
      if (starts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return { line: low, character: offset - starts[low] };
  };
}

function codepointHex(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(cp > 0xffff ? 5 : 4, "0")}`;
}

function nameFor(cp: number): string {
  const names = new Map<number, string>([
    [0x00ad, "SOFT HYPHEN"],
    [0x034f, "COMBINING GRAPHEME JOINER"],
    [0x061c, "ARABIC LETTER MARK"],
    [0x180e, "MONGOLIAN VOWEL SEPARATOR"],
    [0x200b, "ZERO WIDTH SPACE"],
    [0x200c, "ZERO WIDTH NON-JOINER"],
    [0x200d, "ZERO WIDTH JOINER"],
    [0x200e, "LEFT-TO-RIGHT MARK"],
    [0x200f, "RIGHT-TO-LEFT MARK"],
    [0x202a, "LEFT-TO-RIGHT EMBEDDING"],
    [0x202b, "RIGHT-TO-LEFT EMBEDDING"],
    [0x202c, "POP DIRECTIONAL FORMATTING"],
    [0x202d, "LEFT-TO-RIGHT OVERRIDE"],
    [0x202e, "RIGHT-TO-LEFT OVERRIDE"],
    [0x2060, "WORD JOINER"],
    [0xfeff, "ZERO WIDTH NO-BREAK SPACE"],
  ]);
  if (names.has(cp)) return names.get(cp)!;
  if (cp >= 0xe0001 && cp <= 0xe007f) return "TAG CHARACTER";
  if (isVariationSelector(cp)) return "VARIATION SELECTOR";
  if (isPrivateUse(cp)) return "PRIVATE USE";
  return "UNICODE CHARACTER";
}

function describe(type: FindingType, cp: number, decoded: string): string {
  const label = `${codepointHex(cp)} ${nameFor(cp)}`;
  switch (type) {
    case "space": return `${label} is a non-ASCII space; normalize to U+0020 SPACE.`;
    case "confusable": return `${label} visually resembles ASCII '${decoded}'.`;
    case "bidi": return `${label} is a bidirectional text control; review for display-order manipulation.`;
    case "tag_chars": return `${label} is an invisible Unicode tag character.`;
    case "variation_selector": return `${label} is an invisible variation selector outside an allowed context.`;
    case "zwj_family": return `${label} is an invisible zero-width/format carrier outside an allowed context.`;
    case "private_use": return `${label} is a private-use code point with no portable Unicode meaning.`;
    case "other_cf": return `${label} is an unrecognized Unicode format character.`;
    default: return `${label} is a hidden or formatting code point.`;
  }
}

function isGlue(cp: number): boolean {
  return EMOJI_GLUE.has(cp) || isVariationSelector(cp) || SCRIPT_JOINERS.has(cp) ||
    (cp >= 0xe0020 && cp <= 0xe007f) || MONGOLIAN_FVS.has(cp) ||
    KHMER_VOWELS.has(cp) || HANGUL_FILLERS.has(cp);
}

function decide(
  current: Scalar,
  previousKept: Scalar | undefined,
  previousInput: Scalar | undefined,
  nextInput: Scalar | undefined,
  validFlagTag: boolean,
  aggressive: boolean,
  stripEmojiGlue: boolean,
): Decision {
  const cp = current.cp;

  // Python inspect_text passes strip_bidi=True, so every bidi control is reported.
  if (BIDI_CODEPOINTS.has(cp)) {
    return { suspicious: true, type: "bidi", decoded: "", advancePreviousKept: false };
  }

  if (!stripEmojiGlue && previousInput) {
    if (isSupplementaryVariationSelector(cp) && isCjkIdeograph(previousInput.cp)) {
      return { suspicious: false, advancePreviousKept: false };
    }
    if (MONGOLIAN_FVS.has(cp) && isMongolianBase(previousInput.cp)) {
      return { suspicious: false, advancePreviousKept: false };
    }
    if (cp >= 0xfe00 && cp <= 0xfe0d && isCjkIdeograph(previousInput.cp)) {
      return { suspicious: false, advancePreviousKept: false };
    }
  }

  if (!stripEmojiGlue && EMOJI_GLUE.has(cp)) {
    if ((cp === 0xfe0e || cp === 0xfe0f) && previousInput && isEmojiBase(previousInput.cp)) {
      return { suspicious: false, advancePreviousKept: false };
    }
    if (cp === 0x200d && previousKept && nextInput &&
      isEmojiBase(previousKept.cp) && isEmojiBase(nextInput.cp)) {
      return { suspicious: false, advancePreviousKept: false };
    }
  }

  if (!stripEmojiGlue) {
    if (SCRIPT_JOINERS.has(cp) && previousInput && nextInput) {
      const previousScript = joiningScript(previousInput.cp);
      const nextScript = joiningScript(nextInput.cp);
      if (previousScript && previousScript === nextScript) {
        return { suspicious: false, advancePreviousKept: false };
      }
    }
    if (cp >= 0xe0020 && cp <= 0xe007f && validFlagTag) {
      return { suspicious: false, advancePreviousKept: false };
    }
    if (MONGOLIAN_FVS.has(cp) && previousKept && isMongolianLetter(previousKept.cp)) {
      return { suspicious: false, advancePreviousKept: false };
    }
    if (KHMER_VOWELS.has(cp) && previousKept && isKhmerLetter(previousKept.cp)) {
      return { suspicious: false, advancePreviousKept: false };
    }
    if (HANGUL_FILLERS.has(cp) && previousKept && isHangulJamo(previousKept.cp)) {
      return { suspicious: false, advancePreviousKept: false };
    }
    if (ORTHOGRAPHIC_CF.has(cp)) {
      return { suspicious: false, advancePreviousKept: false };
    }
  }

  if (isStripCodepoint(cp)) {
    return {
      suspicious: true,
      type: stripKind(cp),
      decoded: cp >= 0xe0020 && cp <= 0xe007e ? String.fromCodePoint(cp - TAG_OFFSET) : "",
      advancePreviousKept: false,
    };
  }

  if (SPACE_HOMOGLYPHS.has(cp)) {
    return { suspicious: true, type: "space", decoded: " ", advancePreviousKept: true };
  }

  if (aggressive && LATIN_CONFUSABLES.has(cp)) {
    return {
      suspicious: true,
      type: "confusable",
      decoded: LATIN_CONFUSABLES.get(cp)!,
      advancePreviousKept: true,
    };
  }

  // JavaScript has no built-in equivalent of Python unicodedata.category().
  // This covers the relevant Layer A Cf ranges explicitly.
  if (isKnownCf(cp) && !SPACE_HOMOGLYPHS.has(cp)) {
    return { suspicious: true, type: "other_cf", decoded: "", advancePreviousKept: false };
  }

  return { suspicious: false, advancePreviousKept: !isGlue(cp) };
}

export function scan(text: string, options: ScanOptions = {}): Finding[] {
  const aggressive = options.aggressive ?? false;
  const stripEmojiGlue = options.stripEmojiGlue ?? false;
  const values = scalarValues(text);
  const getPosition = lineMap(text);
  const validFlagTags = validFlagTagOffsets(values);
  const findings: Finding[] = [];
  let previousKept: Scalar | undefined;

  for (let index = 0; index < values.length; index += 1) {
    const current = values[index];
    const decision = decide(
      current,
      previousKept,
      index > 0 ? values[index - 1] : undefined,
      index + 1 < values.length ? values[index + 1] : undefined,
      validFlagTags.has(current.offset),
      aggressive,
      stripEmojiGlue,
    );

    if (decision.suspicious && decision.type) {
      const position = getPosition(current.offset);
      const decoded = decision.decoded ?? "";
      findings.push({
        offset: current.offset,
        line: position.line,
        character: position.character,
        codepoint: current.cp,
        codepointHex: codepointHex(current.cp),
        decoded,
        type: decision.type,
        description: describe(decision.type, current.cp, decoded),
        confidence: decision.type === "space" ? "informational" : "probable",
      });
      continue;
    }

    if (decision.advancePreviousKept) previousKept = current;
  }

  return findings;
}

export function extractTagPayload(findings: Finding[]): string {
  return findings
    .filter((finding) => finding.type === "tag_chars")
    .sort((a, b) => a.offset - b.offset)
    .map((finding) => finding.decoded)
    .join("");
}
