import type { SiteAdapter, Message } from '@/types';

export const mistralChatAdapter: SiteAdapter = {
  id: 'mistral-chat',
  name: 'Mistral Le Chat',
  matchUrls: ['https://chat.mistral.ai/*'],

  getMessageContainer() {
    return (
      document.querySelector('[class*="chat-container"]') ||
      document.querySelector('[class*="conversation"]') ||
      document.querySelector('main') ||
      null
    );
  },

  parseMessages(container) {
    const messages: Message[] = [];
    // Mistral Le Chat uses a similar structure to other chat UIs
    // Look for user/assistant message containers
    const elements = container.querySelectorAll(
      '[class*="message"], [data-role], [class*="Message"]',
    );

    elements.forEach((el) => {
      const dataRole = el.getAttribute('data-role');
      const isUser =
        dataRole === 'user' ||
        el.matches('[class*="user"]') ||
        el.closest('[class*="user"]') !== null;
      const isAssistant =
        dataRole === 'assistant' ||
        el.matches('[class*="assistant"]') ||
        el.closest('[class*="assistant"]') !== null;

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

            const dataRole = node.getAttribute('data-role');
            const isUser =
              dataRole === 'user' ||
              node.matches('[class*="user"]') ||
              node.closest('[class*="user"]') !== null;

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
