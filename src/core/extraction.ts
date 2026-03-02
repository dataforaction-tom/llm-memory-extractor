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
      lines.push(`### ${category.name} (id: "${category.id}")`);
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
- Extract GENEROUSLY — the user's questions reveal as much as their statements
- What to extract from user messages:
  - Explicit statements ("I work in local government")
  - Topics they ask detailed questions about (deep interest = worth recording)
  - Domains they have expertise in (informed questions signal knowledge)
  - Their analytical perspective (e.g., skeptical of metrics, data-driven, evidence-focused)
  - Specific subjects, frameworks, datasets, or tools they reference
  - Professional context implied by their questions
  - Geographic/cultural context (e.g., UK-focused, US healthcare, etc.)
- A user asking sophisticated questions about IMD data tells you they are interested in IMD, interested in data-driven decisions, possibly work in public sector or philanthropy, care about evidence vs metrics theater, etc. Extract ALL of these.
- Assign confidence: 1.0 for explicitly stated, 0.7-0.9 for strongly implied, 0.5-0.6 for loosely implied
- Include an exact quote from the conversation as evidence
- Use descriptive snake_case keys (e.g., preferred_programming_language, interest_in_deprivation_metrics)
- Prefer MULTIPLE specific facts over one vague fact (e.g., "interested in IMD" + "interested in data-driven policy" + "interested in philanthropy targeting" rather than just "interested in local government")`);

  // Valid category IDs list
  const validIds = enabledCategories.map((c) => `"${c.id}"`).join(', ');

  // Output format (static)
  sections.push(`## Output Format:
Return a JSON object with this exact structure:
{
  "extractedFacts": [
    {
      "key": "descriptive_snake_case_key",
      "value": { "text": "the extracted information" },
      "categoryId": "one_of_the_category_ids_listed_above",
      "confidence": 0.95,
      "evidenceQuote": "exact quote from conversation"
    }
  ]
}

IMPORTANT: categoryId MUST be one of these exact values: ${validIds}

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
/**
 * Maximum character budget for the conversation transcript.
 * Most extraction models support 128K+ tokens. We use 50K chars (~12K tokens)
 * which is generous but still leaves room for the system prompt and response.
 */
const MAX_CONVERSATION_CHARS = 50000;

/**
 * Maximum characters per individual message.
 * Long assistant responses rarely contain user facts; truncate them to save budget.
 */
const MAX_MESSAGE_CHARS = 3000;

export function formatConversationForExtraction(messages: Message[]): string {
  // Format all messages, truncating overly long individual messages
  const formatted = messages.map((msg) => {
    const role = msg.role.toUpperCase();
    let content = msg.content;
    if (content.length > MAX_MESSAGE_CHARS) {
      content = content.substring(0, MAX_MESSAGE_CHARS) + '... [truncated]';
    }
    return `[${role}]: ${content}`;
  });

  let result = formatted.join('\n');

  // If within budget, return as-is
  if (result.length <= MAX_CONVERSATION_CHARS) {
    return result;
  }

  // Over budget: hard-truncate the formatted string, keeping start and end
  const half = Math.floor(MAX_CONVERSATION_CHARS / 2);
  const start = result.substring(0, half);
  const end = result.substring(result.length - half);
  result = start + '\n\n[... middle of conversation truncated ...]\n\n' + end;

  return result;
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
