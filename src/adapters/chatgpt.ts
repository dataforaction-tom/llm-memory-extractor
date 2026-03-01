import type { SiteAdapter, Message } from '@/types';

export const chatgptAdapter: SiteAdapter = {
  id: 'chatgpt',
  name: 'ChatGPT',
  matchUrls: ['https://chat.openai.com/*', 'https://chatgpt.com/*'],

  getMessageContainer() {
    return (
      document.querySelector('main [class*="react-scroll"]') ||
      document.querySelector('main [role="presentation"]') ||
      document.querySelector('main') ||
      null
    );
  },

  parseMessages(container) {
    const messages: Message[] = [];
    // ChatGPT uses data-message-author-role attribute on message elements
    const elements = container.querySelectorAll(
      '[data-message-author-role], [data-testid^="conversation-turn"]',
    );

    elements.forEach((el) => {
      const authorRole = el.getAttribute('data-message-author-role');
      let role: Message['role'] = 'assistant';

      if (authorRole === 'user') {
        role = 'user';
      } else if (authorRole === 'assistant' || authorRole === null) {
        // If no data attribute, try to detect from class names
        const isUser =
          el.querySelector('[data-message-author-role="user"]') !== null ||
          el.classList.contains('user-turn');
        role = isUser ? 'user' : 'assistant';
      }

      const content = el.textContent?.trim() || '';
      if (content) {
        messages.push({ role, content, timestamp: Date.now() });
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

            const authorRole = node.getAttribute('data-message-author-role');
            const isUser =
              authorRole === 'user' ||
              node.querySelector('[data-message-author-role="user"]') !== null;

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
