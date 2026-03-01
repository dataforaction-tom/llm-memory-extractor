import type { Fact, Category } from '@/types';

// ---------------------------------------------------------------------------
// Export: Facts → Markdown
// ---------------------------------------------------------------------------

/**
 * Groups confirmed facts by categoryId and produces one markdown string
 * per category.
 *
 * Returns a `Record<string, string>` where the key is the categoryId and
 * the value is the full markdown for that category.
 */
export function factsToMarkdown(
  facts: Fact[],
  categories: Category[],
): Record<string, string> {
  const categoryMap = new Map<string, Category>();
  for (const cat of categories) {
    categoryMap.set(cat.id, cat);
  }

  // Group facts by categoryId
  const grouped = new Map<string, Fact[]>();
  for (const fact of facts) {
    const group = grouped.get(fact.categoryId) ?? [];
    group.push(fact);
    grouped.set(fact.categoryId, group);
  }

  const result: Record<string, string> = {};

  for (const [categoryId, group] of grouped) {
    const category = categoryMap.get(categoryId);
    const categoryName = category
      ? category.name
      : categoryId
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');

    // Sort facts alphabetically by key
    const sorted = [...group].sort((a, b) => a.key.localeCompare(b.key));

    const lines: string[] = [`# ${categoryName}`, ''];

    for (const fact of sorted) {
      lines.push(`## ${fact.key}`);
      lines.push(...formatValue(fact.value));
      lines.push(`- confidence: ${fact.confidence}`);
      lines.push(`- source: ${fact.sourcePlatform}, ${formatDate(fact.createdAt)}`);
      lines.push('');
    }

    result[categoryId] = lines.join('\n');
  }

  return result;
}

/**
 * Formats a fact's value object into markdown bullet lines.
 *
 * - If value has a `text` field → single bullet with the text
 * - If value has an `items` array → single bullet with items joined by comma
 * - Otherwise → one bullet per key/value pair
 */
function formatValue(value: Record<string, unknown>): string[] {
  if ('text' in value && typeof value.text === 'string') {
    return [`- ${value.text}`];
  }

  if ('items' in value && Array.isArray(value.items)) {
    return [`- ${(value.items as unknown[]).join(', ')}`];
  }

  // Multiple fields — show each as key: value
  const entries = Object.entries(value);
  if (entries.length === 1) {
    const [, v] = entries[0];
    return [`- ${String(v)}`];
  }

  return entries.map(([k, v]) => `- ${k}: ${String(v)}`);
}

/**
 * Formats a timestamp (milliseconds since epoch) as YYYY-MM-DD.
 */
function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Import: Markdown → Facts
// ---------------------------------------------------------------------------

/**
 * Parses a markdown string back into an array of partial facts.
 *
 * The `categoryId` is provided externally (the caller knows which category
 * this markdown belongs to).
 */
export function markdownToFacts(
  markdown: string,
  categoryId: string,
): Partial<Fact>[] {
  const lines = markdown.split('\n');
  const facts: Partial<Fact>[] = [];

  let currentKey: string | null = null;
  let currentConfidence = 1.0;
  let valueBullets: string[] = [];

  function flushFact(): void {
    if (currentKey === null) return;

    facts.push({
      key: currentKey,
      value: buildValue(valueBullets),
      categoryId,
      confidence: currentConfidence,
    });

    currentKey = null;
    currentConfidence = 1.0;
    valueBullets = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // # Heading → category name, ignored
    if (/^# /.test(trimmed) && !/^## /.test(trimmed)) {
      continue;
    }

    // ## key → new fact
    if (/^## /.test(trimmed)) {
      flushFact();
      currentKey = trimmed.slice(3).trim();
      continue;
    }

    // Bullet line
    if (/^- /.test(trimmed) && currentKey !== null) {
      const bulletContent = trimmed.slice(2).trim();

      // Check for confidence metadata
      const confidenceMatch = /^confidence:\s*(.+)$/.exec(bulletContent);
      if (confidenceMatch) {
        const parsed = parseFloat(confidenceMatch[1]);
        if (!isNaN(parsed)) {
          currentConfidence = parsed;
        }
        continue;
      }

      // Check for source metadata → ignore
      if (/^source:\s/.test(bulletContent)) {
        continue;
      }

      // Regular value bullet
      valueBullets.push(bulletContent);
    }
  }

  // Flush the last fact
  flushFact();

  return facts;
}

/**
 * Builds a value object from accumulated bullet strings.
 *
 * - If all bullets are `key: value` pairs → object
 * - If single plain text → `{ text: "..." }`
 * - If multiple plain text → `{ items: [...] }`
 */
function buildValue(bullets: string[]): Record<string, unknown> {
  if (bullets.length === 0) {
    return { text: '' };
  }

  // Check if all bullets are key: value pairs
  const kvPattern = /^([^:]+):\s+(.+)$/;
  const pairs: Array<[string, string]> = [];
  let allKv = true;

  for (const b of bullets) {
    const match = kvPattern.exec(b);
    if (match) {
      pairs.push([match[1].trim(), match[2].trim()]);
    } else {
      allKv = false;
      break;
    }
  }

  if (allKv && pairs.length > 0) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of pairs) {
      obj[k] = v;
    }
    return obj;
  }

  // Plain text
  if (bullets.length === 1) {
    return { text: bullets[0] };
  }

  return { items: bullets };
}
