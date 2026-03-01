import type { SiteAdapter, Message } from '@/types';

export const grokAdapter: SiteAdapter = {
  id: 'grok',
  name: 'Grok',
  matchUrls: ['https://grok.com/*', 'https://x.com/i/grok*'],

  getMessageContainer() {
    return (
      document.querySelector('[class*="conversation"]') ||
      document.querySelector('[class*="chat"]') ||
      document.querySelector('main') ||
      null
    );
  },

  parseMessages(container) {
    const messages: Message[] = [];
    // Grok uses message containers that distinguish user vs assistant by DOM structure
    const elements = container.querySelectorAll(
      '[class*="message"], [class*="Message"], [data-testid*="message"]',
    );

    elements.forEach((el) => {
      const isUser =
        el.matches('[class*="user"]') ||
        el.querySelector('[class*="user"]') !== null ||
        el.closest('[class*="user"]') !== null ||
        el.matches('[data-testid*="user"]');
      const isAssistant =
        el.matches('[class*="assistant"]') ||
        el.matches('[class*="grok"]') ||
        el.querySelector('[class*="assistant"]') !== null ||
        el.querySelector('[class*="grok"]') !== null;

      const content = el.textContent?.trim() || '';
      if (content && (isUser || isAssistant)) {
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
              node.matches('[class*="user"]') ||
              node.querySelector('[class*="user"]') !== null;

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
