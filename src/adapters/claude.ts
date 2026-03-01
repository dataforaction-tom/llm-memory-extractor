import type { SiteAdapter, Message } from '@/types';

export const claudeAdapter: SiteAdapter = {
  id: 'claude',
  name: 'Claude',
  matchUrls: ['https://claude.ai/*'],

  getMessageContainer() {
    return (
      document.querySelector('[class*="conversation"]') ||
      document.querySelector('main') ||
      null
    );
  },

  parseMessages(container) {
    const messages: Message[] = [];
    // Claude messages often have data-testid attributes or specific class patterns
    // Try multiple selectors for resilience
    const elements = container.querySelectorAll(
      '[data-testid^="conversation-turn"], .font-claude-message, [class*="Message"], [class*="message-row"]',
    );

    elements.forEach((el) => {
      const isUser =
        el.querySelector('[data-testid="user-message"]') !== null ||
        el.classList.contains('user-message') ||
        el.querySelector('.font-user-message') !== null;
      const isAssistant =
        el.querySelector('[data-testid="assistant-message"]') !== null ||
        el.classList.contains('font-claude-message') ||
        el.querySelector('.font-claude-message') !== null;

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
            // Determine role based on element characteristics
            const isUser =
              node.querySelector('[data-testid="user-message"]') !== null ||
              node.classList?.contains('user-message');
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
