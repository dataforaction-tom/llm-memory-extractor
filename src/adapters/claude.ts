import type { SiteAdapter, Message } from '@/types';

export const claudeAdapter: SiteAdapter = {
  id: 'claude',
  name: 'Claude',
  matchUrls: ['https://claude.ai/*'],

  getMessageContainer() {
    return (
      document.querySelector('[class*="conversation"]') ||
      document.querySelector('[class*="thread"]') ||
      document.querySelector('[role="main"]') ||
      document.querySelector('main') ||
      document.body
    );
  },

  parseMessages(container) {
    const messages: Message[] = [];

    // Try multiple selector strategies for Claude's DOM
    const selectors = [
      // data-testid based (most reliable when present)
      '[data-testid*="human-turn"], [data-testid*="ai-turn"]',
      '[data-testid*="user-message"], [data-testid*="assistant-message"]',
      // Role-based
      '[data-role="user"], [data-role="assistant"]',
      // Class-based patterns
      '[class*="human-turn"], [class*="ai-turn"]',
      '[class*="UserMessage"], [class*="AssistantMessage"]',
      '[class*="user-message"], [class*="assistant-message"]',
    ];

    for (const selector of selectors) {
      const elements = container.querySelectorAll(selector);
      if (elements.length >= 2) {
        elements.forEach((el) => {
          const content = el.textContent?.trim() || '';
          if (!content) return;

          const elStr = el.className + ' ' + (el.getAttribute('data-testid') || '') +
            ' ' + (el.getAttribute('data-role') || '');
          const isUser = /human|user/i.test(elStr);

          messages.push({
            role: isUser ? 'user' : 'assistant',
            content,
            timestamp: Date.now(),
          });
        });
        return messages;
      }
    }

    // Fallback: look for alternating message blocks in the conversation area
    // Claude typically renders messages in a list of divs
    const allBlocks = container.querySelectorAll('[class*="Message"], [class*="message"]');
    allBlocks.forEach((el) => {
      const content = el.textContent?.trim() || '';
      if (!content || content.length < 5) return;

      const elStr = (el.className || '') + ' ' + (el.getAttribute('data-testid') || '');
      const isUser = /human|user/i.test(elStr);

      messages.push({
        role: isUser ? 'user' : 'assistant',
        content,
        timestamp: Date.now(),
      });
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
            const elStr = (node.className || '') + ' ' + (node.getAttribute('data-testid') || '');
            const isUser = /human|user/i.test(elStr);
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
