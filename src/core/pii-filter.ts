import type { ExtractedFact, PIIRule } from '@/types';

/**
 * Check a single fact against PII rules.
 * - Keyword rules: check if fact key contains/matches the keyword
 * - Regex rules: check if stringified fact value matches the pattern
 */
function checkFact(
  fact: ExtractedFact,
  rules: PIIRule[]
): { flagged: boolean; reasons: string[] } {
  const reasons: string[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    if (rule.type === 'keyword') {
      // Check if fact key contains the keyword (case-insensitive)
      if (fact.key.toLowerCase().includes(rule.pattern.toLowerCase())) {
        reasons.push(`Key matches blocked keyword: ${rule.pattern}`);
      }
    } else if (rule.type === 'regex') {
      // Check if stringified value matches the regex
      const valueText = JSON.stringify(fact.value);
      try {
        const regex = new RegExp(rule.pattern, 'i');
        if (regex.test(valueText)) {
          reasons.push(`Value matches PII pattern: ${rule.description}`);
        }
      } catch {
        // Invalid regex, skip
      }
    }
  }

  return { flagged: reasons.length > 0, reasons };
}

/**
 * Filter facts through PII rules.
 * Returns clean facts and flagged facts with reasons.
 */
export function filterFacts(
  facts: ExtractedFact[],
  piiRules: PIIRule[]
): {
  clean: ExtractedFact[];
  flagged: Array<ExtractedFact & { piiReasons: string[] }>;
} {
  const clean: ExtractedFact[] = [];
  const flagged: Array<ExtractedFact & { piiReasons: string[] }> = [];

  for (const fact of facts) {
    const result = checkFact(fact, piiRules);
    if (result.flagged) {
      flagged.push({ ...fact, piiReasons: result.reasons });
    } else {
      clean.push(fact);
    }
  }

  return { clean, flagged };
}
