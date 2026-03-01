import { claudeAdapter } from './claude';
import { chatgptAdapter } from './chatgpt';
import { geminiAdapter } from './gemini';
import { perplexityAdapter } from './perplexity';
import { mistralChatAdapter } from './mistral-chat';
import { grokAdapter } from './grok';
import type { SiteAdapter } from '@/types';

export const adapters: SiteAdapter[] = [
  claudeAdapter,
  chatgptAdapter,
  geminiAdapter,
  perplexityAdapter,
  mistralChatAdapter,
  grokAdapter,
];
