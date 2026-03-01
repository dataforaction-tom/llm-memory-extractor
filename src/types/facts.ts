export interface Fact {
  id: string;
  key: string;
  value: Record<string, unknown>;
  categoryId: string;
  confidence: number;
  status: 'pending' | 'confirmed' | 'rejected';
  evidenceQuote: string;
  sourceConversation: string;
  sourcePlatform: string;
  createdAt: number;
  updatedAt: number;
  piiWarning?: boolean;
  piiReasons?: string[];
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number | null;
}

export interface CapturedConversation {
  id: string;
  platform: string;
  title: string;
  messages: Message[];
  capturedAt: number;
  extractionStatus: 'pending' | 'extracted' | 'failed';
  factIds: string[];
}

export interface ExtractedFact {
  key: string;
  value: Record<string, unknown>;
  categoryId: string;
  confidence: number;
  evidenceQuote: string;
}
