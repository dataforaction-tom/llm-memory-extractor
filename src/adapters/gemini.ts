import type { SiteAdapter, Message } from '@/types';

export const geminiAdapter: SiteAdapter = {
  id: 'gemini',
  name: 'Gemini',
  matchUrls: ['https://gemini.google.com/*'],

  getMessageContainer() {
    return (
      document.querySelector('[class*="conversation-container"]') ||
      document.querySelector('[class*="chat-history"]') ||
      document.querySelector('main') ||
      null
    );
  },

  parseMessages(container) {
    const messages: Message[] = [];
    // Gemini uses specific selectors for user/model messages
    // User messages are in query/request containers, model responses in response containers
    const elements = container.querySelectorAll(
      '[class*="query-content"], [class*="response-content"], [class*="model-response"], [class*="user-query"], message-content',
    );

    elements.forEach((el) => {
      const isUser =
        el.matches('[class*="query"]') ||
        el.matches('[class*="user"]') ||
        el.closest('[class*="query"]') !== null ||
        el.closest('[class*="user-query"]') !== null;

      const content = el.textContent?.trim() || '';
      if (content) {
        messages.push({
          role: isUser ? 'user' : 'assistant',
          content,
          timestamp: Date.now(),
        });
      }
    });
    return messages;
  },

  observeNewMessages(callback) {
    const container = this.getMessageContainer();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            const content = node.textContent?.trim();
            if (!content) continue;

            const isUser =
              node.matches('[class*="query"]') ||
              node.matches('[class*="user"]') ||
              node.closest('[class*="query"]') !== null;

            callback({
              role: isUser ? 'user' : 'assistant',
              content,
              timestamp: Date.now(),
            });
          }
        }
      }
    });
    if (container) {
      observer.observe(container, { childList: true, subtree: true });
    }
    return observer;
  },
};
