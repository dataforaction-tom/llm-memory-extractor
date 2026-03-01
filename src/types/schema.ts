export interface Category {
  id: string;
  name: string;
  description: string;
  examples: string[];
  enabled: boolean;
  extractionHints: string[];
}

export interface PIIRule {
  id: string;
  type: 'keyword' | 'regex';
  pattern: string;
  description: string;
  enabled: boolean;
}

export interface ExtractionSchema {
  categories: Category[];
  globalRules: string[];
  piiRules: PIIRule[];
}

export interface StoredSchema extends ExtractionSchema {
  id: 'user-schema';
  updatedAt: number;
}
