import type { LLMProvider, ChatMessage } from '@/types';
import { ProviderError, withRetry } from './index';

export function createGoogleProvider(apiKey: string): LLMProvider {
  return {
    id: 'google',
    name: 'Google',

    async chat(messages: ChatMessage[], model: string): Promise<string> {
      return withRetry(async () => {
        // Map roles: system and user -> user, assistant -> model
        // Merge system message into the first user message or prepend as user turn
        const contents: { role: string; parts: { text: string }[] }[] = [];

        const systemMsg = messages.find(m => m.role === 'system');
        const chatMsgs = messages.filter(m => m.role !== 'system');

        for (let i = 0; i < chatMsgs.length; i++) {
          const msg = chatMsgs[i];
          const role = msg.role === 'assistant' ? 'model' : 'user';

          if (i === 0 && role === 'user' && systemMsg) {
            // Prepend system content to first user message
            contents.push({
              role: 'user',
              parts: [{ text: `${systemMsg.content}\n\n${msg.content}` }],
            });
          } else {
            contents.push({
              role,
              parts: [{ text: msg.content }],
            });
          }
        }

        // If there was a system message but no user messages to merge into,
        // add it as a standalone user turn at the beginning
        if (systemMsg && chatMsgs.length === 0) {
          contents.push({
            role: 'user',
            parts: [{ text: systemMsg.content }],
          });
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents }),
        });

        if (!res.ok) {
          throw new ProviderError(await res.text(), res.status);
        }

        const data = await res.json();
        return data.candidates[0].content.parts[0].text;
      });
    },

    async listModels(): Promise<string[]> {
      return ['gemini-2.0-flash', 'gemini-1.5-pro'];
    },

    async validateKey(): Promise<boolean> {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
