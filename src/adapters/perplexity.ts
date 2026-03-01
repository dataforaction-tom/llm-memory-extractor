import type { SiteAdapter, Message } from '@/types';

export const perplexityAdapter: SiteAdapter = {
  id: 'perplexity',
  name: 'Perplexity',
  matchUrls: ['https://perplexity.ai/*', 'https://www.perplexity.ai/*'],

  getMessageContainer() {
    return (
      document.querySelector('[class*="ConversationMessages"]') ||
      document.querySelector('[class*="thread"]') ||
      document.querySelector('main') ||
      null
    );
  },

  parseMessages(container) {
    const messages: Message[] = [];
    // Perplexity has query elements (user input) and answer elements (AI response)
    const elements = container.querySelectorAll(
      '[class*="Query"], [class*="Answer"], [class*="query-text"], [class*="answer-text"], [class*="prose"]',
    );

    elements.forEach((el) => {
      const isUser =
        el.matches('[class*="Query"]') ||
        el.matches('[class*="query"]') ||
        el.closest('[class*="Query"]') !== null ||
        el.closest('[class*="query"]') !== null;

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
              node.matches('[class*="Query"]') ||
              node.matches('[class*="query"]') ||
              node.closest('[class*="Query"]') !== null;

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
