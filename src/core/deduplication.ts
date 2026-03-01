import type { ExtractedFact, Fact } from '@/types';

/**
 * Tokenize a string into lowercase word tokens.
 */
function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[\s\W]+/).filter(Boolean));
}

/**
 * Compute Jaccard similarity between two strings.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Recursively extract all string values from a fact value object.
 */
export function extractValueText(value: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const v of Object.values(value)) {
    if (typeof v === 'string') parts.push(v);
    else if (typeof v === 'number') parts.push(String(v));
    else if (Array.isArray(v)) v.forEach(item => {
      if (typeof item === 'string') parts.push(item);
      else if (typeof item === 'object' && item) parts.push(extractValueText(item as Record<string, unknown>));
    });
    else if (typeof v === 'object' && v) parts.push(extractValueText(v as Record<string, unknown>));
  }
  return parts.join(' ');
}

/**
 * Deduplicate new facts against existing facts from IndexedDB.
 * Also deduplicates among the new facts themselves.
 *
 * Two-pass against existing facts:
 * 1. Exact match: same key + identical JSON-stringified value -> skip
 * 2. Fuzzy match: same key + Jaccard similarity >= 0.5 -> skip
 *
 * Among new facts themselves: group by key, merge duplicates, boost confidence.
 * Confidence boosting: min(1.0, maxConfidence + 0.05 * (count - 1))
 */
export function deduplicateFacts(
  newFacts: ExtractedFact[],
  existingFacts: Fact[]
): ExtractedFact[] {
  // --- Build lookup structures from existing facts ---

  // Set of "key::jsonValue" for exact matching
  const existingExactSet = new Set<string>();
  // Map of key -> array of value text strings for fuzzy matching
  const existingValueTextsByKey = new Map<string, string[]>();

  for (const fact of existingFacts) {
    const jsonValue = JSON.stringify(fact.value);
    existingExactSet.add(`${fact.key}::${jsonValue}`);

    const valueText = extractValueText(fact.value);
    const existing = existingValueTextsByKey.get(fact.key);
    if (existing) {
      existing.push(valueText);
    } else {
      existingValueTextsByKey.set(fact.key, [valueText]);
    }
  }

  // --- Pass 1 & 2: Filter new facts against existing facts ---

  const survivingFacts: ExtractedFact[] = [];

  for (const fact of newFacts) {
    const jsonValue = JSON.stringify(fact.value);
    const exactKey = `${fact.key}::${jsonValue}`;

    // Pass 1: Exact match
    if (existingExactSet.has(exactKey)) {
      continue;
    }

    // Pass 2: Fuzzy match — same key + Jaccard >= 0.5
    const existingTexts = existingValueTextsByKey.get(fact.key);
    if (existingTexts) {
      const newValueText = extractValueText(fact.value);
      const isFuzzyDuplicate = existingTexts.some(
        existingText => jaccardSimilarity(newValueText, existingText) >= 0.5
      );
      if (isFuzzyDuplicate) {
        continue;
      }
    }

    survivingFacts.push(fact);
  }

  // --- Pass 3: Deduplicate among surviving new facts themselves ---

  // Group by key, then within each key group merge facts that are exact or fuzzy duplicates
  const groupedByKey = new Map<string, ExtractedFact[]>();

  for (const fact of survivingFacts) {
    const existing = groupedByKey.get(fact.key);
    if (existing) {
      existing.push(fact);
    } else {
      groupedByKey.set(fact.key, [fact]);
    }
  }

  const deduplicated: ExtractedFact[] = [];

  for (const facts of groupedByKey.values()) {
    // Build clusters of duplicates within this key group
    const clusters: ExtractedFact[][] = [];

    for (const fact of facts) {
      const factJson = JSON.stringify(fact.value);
      const factText = extractValueText(fact.value);
      let merged = false;

      for (const cluster of clusters) {
        const representative = cluster[0];
        const repJson = JSON.stringify(representative.value);
        const repText = extractValueText(representative.value);

        // Exact or fuzzy match within the new facts group
        if (factJson === repJson || jaccardSimilarity(factText, repText) >= 0.5) {
          cluster.push(fact);
          merged = true;
          break;
        }
      }

      if (!merged) {
        clusters.push([fact]);
      }
    }

    // For each cluster, pick the highest-confidence fact and boost confidence
    for (const cluster of clusters) {
      // Sort descending by confidence so the best one is first
      cluster.sort((a, b) => b.confidence - a.confidence);
      const best = { ...cluster[0] };

      // Confidence boosting: min(1.0, maxConfidence + 0.05 * (count - 1))
      if (cluster.length > 1) {
        best.confidence = Math.min(1.0, best.confidence + 0.05 * (cluster.length - 1));
      }

      deduplicated.push(best);
    }
  }

  return deduplicated;
}
