export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMProvider {
  id: string;
  name: string;
  chat(messages: ChatMessage[], model: string): Promise<string>;
  listModels(): Promise<string[]>;
  validateKey(): Promise<boolean>;
}

export type ProviderType = 'ollama' | 'anthropic' | 'openai' | 'mistral' | 'google' | 'greenpt';

export interface ProviderConfig {
  type: ProviderType;
  apiKey?: string;
  endpoint?: string;
  model?: string;
}
