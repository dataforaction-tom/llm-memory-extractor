/**
 * Dynamic Prompt Builder & Response Parser
 *
 * Builds LLM extraction prompts dynamically from the user's schema
 * and parses structured extraction responses back into ExtractedFact[].
 */

import type { ExtractedFact, Message, ExtractionSchema } from '@/types';

// ============================================
// PROMPT BUILDING
// ============================================

/**
 * Builds a system prompt dynamically from the enabled categories,
 * global rules, and PII rules in the user's schema.
 */
export function buildExtractionPrompt(schema: ExtractionSchema): string {
  const sections: string[] = [];

  // Header
  sections.push(
    'You are extracting personal facts and preferences from a conversation between a user and an AI assistant.'
  );

  // Categories
  const enabledCategories = schema.categories.filter((c) => c.enabled);
  if (enabledCategories.length > 0) {
    sections.push('## Categories to extract:');

    for (const category of enabledCategories) {
      const lines: string[] = [];
      lines.push(`### ${category.name}`);
      lines.push(category.description);

      if (category.extractionHints.length > 0) {
        lines.push(`Look for: ${category.extractionHints.join(', ')}`);
      }

      if (category.examples.length > 0) {
        lines.push('Examples:');
        for (const example of category.examples) {
          lines.push(`- "${example}"`);
        }
      }

      sections.push(lines.join('\n'));
    }
  }

  // Rules
  const ruleLines: string[] = [];

  for (const rule of schema.globalRules) {
    ruleLines.push(`- ${rule}`);
  }

  const enabledPiiRules = schema.piiRules.filter((r) => r.enabled);
  for (const piiRule of enabledPiiRules) {
    ruleLines.push(`- Do not extract values matching: ${piiRule.description}`);
  }

  if (ruleLines.length > 0) {
    sections.push('## Rules:\n' + ruleLines.join('\n'));
  }

  // Extraction rules (static)
  sections.push(`## Extraction Rules:
- Only extract facts about the USER, never about the assistant
- Each fact must be directly stated or strongly implied by the user
- Assign confidence: 1.0 for explicitly stated, 0.7-0.9 for strongly implied, 0.5-0.6 for loosely implied
- Include an exact quote from the conversation as evidence
- Use descriptive snake_case keys (e.g., preferred_programming_language, exercise_routine)`);

  // Output format (static)
  sections.push(`## Output Format:
Return a JSON object with this exact structure:
{
  "extractedFacts": [
    {
      "key": "descriptive_snake_case_key",
      "value": { "text": "the extracted information" },
      "categoryId": "category_id",
      "confidence": 0.95,
      "evidenceQuote": "exact quote from conversation"
    }
  ]
}

Return ONLY valid JSON. No markdown, no explanation, no additional text.`);

  return sections.join('\n\n');
}

// ============================================
// CONVERSATION FORMATTING
// ============================================

/**
 * Format an array of messages into a labelled transcript for extraction.
 *
 * Output:
 *   [USER]: message content here
 *   [ASSISTANT]: response content here
 */
export function formatConversationForExtraction(messages: Message[]): string {
  return messages
    .map((msg) => {
      const role = msg.role.toUpperCase();
      return `[${role}]: ${msg.content}`;
    })
    .join('\n');
}

// ============================================
// RESPONSE PARSING
// ============================================

/**
 * Parse an LLM extraction response into an array of ExtractedFact.
 *
 * Tries three strategies in order:
 *   1. Direct JSON.parse on the full text
 *   2. Extract from a markdown code block (```json ... ``` or ``` ... ```)
 *   3. Find the outermost { ... } substring and parse that
 *
 * Returns an empty array if all strategies fail.
 */
export function parseExtractionResponse(text: string): ExtractedFact[] {
  let parsed: unknown = null;

  // Strategy 1: Direct parse
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not plain JSON — continue
  }

  // Strategy 2: Markdown code block
  if (parsed === null) {
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      try {
        parsed = JSON.parse(codeBlockMatch[1].trim());
      } catch {
        // Invalid JSON inside code block — continue
      }
    }
  }

  // Strategy 3: Outermost braces
  if (parsed === null) {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1));
      } catch {
        // Still not valid JSON
      }
    }
  }

  if (parsed === null) {
    return [];
  }

  // Extract the facts array — handle both wrapper object and direct array
  let rawFacts: unknown[];

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    'extractedFacts' in parsed &&
    Array.isArray((parsed as Record<string, unknown>).extractedFacts)
  ) {
    rawFacts = (parsed as Record<string, unknown>).extractedFacts as unknown[];
  } else if (Array.isArray(parsed)) {
    rawFacts = parsed;
  } else {
    return [];
  }

  // Normalize each fact
  return rawFacts
    .filter(
      (f): f is Record<string, unknown> =>
        typeof f === 'object' && f !== null && 'key' in f
    )
    .map((f) => ({
      key: String(f.key),
      value: normalizeFactValue(f.value),
      categoryId: typeof f.categoryId === 'string' ? f.categoryId : '',
      confidence: typeof f.confidence === 'number' ? f.confidence : 0.5,
      evidenceQuote:
        typeof f.evidenceQuote === 'string' ? f.evidenceQuote : '',
    }));
}

// ============================================
// VALUE NORMALISATION
// ============================================

/**
 * Normalise an arbitrary fact value into a Record<string, unknown>.
 *
 * - object (not null, not array) -> returned as-is
 * - string                       -> { text: value }
 * - number                       -> { value: value }
 * - array                        -> { items: value }
 * - null / undefined             -> { text: '' }
 */
export function normalizeFactValue(value: unknown): Record<string, unknown> {
  if (value !== null && value !== undefined && typeof value === 'object') {
    if (Array.isArray(value)) {
      return { items: value };
    }
    return value as Record<string, unknown>;
  }

  if (typeof value === 'string') {
    return { text: value };
  }

  if (typeof value === 'number') {
    return { value: value };
  }

  // null, undefined, or any other type
  return { text: '' };
}
