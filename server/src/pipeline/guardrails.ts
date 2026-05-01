import type { GuardrailResult, InboundMessage } from "../types.ts";

const CRISIS_PATTERNS: Array<{ pattern: RegExp; rule: string }> = [
  { pattern: /\b(suicid|kill(?:ing)?\s+myself|end(?:ing)?\s+(?:my|her|his|their)\s+(?:own\s+)?life|take\s+(?:my|her|his|their)\s+(?:own\s+)?life|don't\s+want\s+to\s+(?:be\s+(?:here|alive)|live))/i, rule: "crisis_self_harm" },
  { pattern: /\b(self[-\s]?harm|cut(?:ting)?\s+myself|hurt(?:ing)?\s+myself)\b/i, rule: "crisis_self_harm" },
  { pattern: /\b(abus(e|ed|ive|er))\b/i, rule: "crisis_abuse" },
  { pattern: /\b(domestic violence|hit me|threatened me)\b/i, rule: "crisis_abuse" },
  { pattern: /\b(emergency|911|er visit|hospital(ized)?)\b/i, rule: "crisis_medical_emergency" },
  { pattern: /\b(chest pain|can't breathe|cannot breathe|passed out|fainted|seizure|stroke)\b/i, rule: "crisis_acute_symptom" },
  { pattern: /\b(overdose|poisoning|allergic reaction|anaphyla)/i, rule: "crisis_acute_symptom" },
  { pattern: /\b(lawsuit|attorney|sue you|legal action|reporting you|board complaint)\b/i, rule: "crisis_legal" },
];

const FORCE_REVIEW_PATTERNS: Array<{ pattern: RegExp; rule: string }> = [
  { pattern: /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/, rule: "draft_contains_dollar_amount" },
  { pattern: /\b\d+(?:\.\d+)?\s?(mg|mcg|g|ml|iu|units?)\b/i, rule: "draft_contains_dosage" },
  { pattern: /\b(increase|decrease|double|halve|stop|start)\s+(your|the)\s+(dose|dosage|medication)\b/i, rule: "draft_changes_dose" },
  { pattern: /\b[A-Z]\d{2}(?:\.\d{1,2})?\b/, rule: "draft_contains_icd_code" },
  { pattern: /\b\d{5}(?:-\d{4})?\b/, rule: "draft_contains_cpt_or_zip" },
];

export function scanInboundForCrisis(message: InboundMessage): GuardrailResult {
  const violations: GuardrailResult["violations"] = [];
  const text = `${message.body}\n${message.history.map((h) => h.body).join("\n")}`;
  for (const { pattern, rule } of CRISIS_PATTERNS) {
    if (pattern.test(text)) {
      violations.push({ rule, detail: `Inbound matched ${rule}` });
    }
  }
  return { pass: violations.length === 0, violations };
}

export function scanDraft(draft: string): GuardrailResult {
  const violations: GuardrailResult["violations"] = [];
  for (const { pattern, rule } of FORCE_REVIEW_PATTERNS) {
    const m = draft.match(pattern);
    if (m) {
      violations.push({ rule, detail: `Matched substring '${m[0]}'` });
    }
  }
  return { pass: violations.length === 0, violations };
}

export function combine(...results: GuardrailResult[]): GuardrailResult {
  const violations = results.flatMap((r) => r.violations);
  return { pass: violations.length === 0, violations };
}
