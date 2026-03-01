import type { SiteAdapter, Message } from '@/types';

export const mistralChatAdapter: SiteAdapter = {
  id: 'mistral-chat',
  name: 'Mistral Le Chat',
  matchUrls: ['https://chat.mistral.ai/*'],

  getMessageContainer() {
    return (
      document.querySelector('[class*="chat"]') ||
      document.querySelector('[role="main"]') ||
      document.querySelector('main') ||
      document.body
    );
  },

  parseMessages(container) {
    const messages: Message[] = [];

    // Strategy 1: data attributes
    const dataSelectors = [
      '[data-role="user"], [data-role="assistant"]',
      '[data-testid*="user"], [data-testid*="assistant"]',
      '[data-testid*="message"]',
      '[data-message-role]',
    ];

    for (const selector of dataSelectors) {
      const elements = container.querySelectorAll(selector);
      if (elements.length >= 2) {
        elements.forEach((el) => {
          const content = el.textContent?.trim() || '';
          if (!content) return;
          const attrs = (el.getAttribute('data-role') || '') +
            (el.getAttribute('data-testid') || '') +
            (el.getAttribute('data-message-role') || '');
          const isUser = /user/i.test(attrs);
          messages.push({ role: isUser ? 'user' : 'assistant', content, timestamp: Date.now() });
        });
        return messages;
      }
    }

    // Strategy 2: aria/role attributes
    const ariaEls = container.querySelectorAll('[role="article"], [role="listitem"], [role="row"]');
    if (ariaEls.length >= 2) {
      ariaEls.forEach((el) => {
        const content = el.textContent?.trim() || '';
        if (!content || content.length < 3) return;
        const allText = el.className + ' ' + el.innerHTML.substring(0, 200);
        const isUser = /user|human|you/i.test(allText);
        messages.push({ role: isUser ? 'user' : 'assistant', content, timestamp: Date.now() });
      });
      if (messages.length >= 2) return messages;
      messages.length = 0;
    }

    // Strategy 3: Look for prose blocks (Tailwind markdown rendering)
    const proseEls = container.querySelectorAll('[class*="prose"], [class*="markdown"]');
    if (proseEls.length >= 1) {
      // Prose blocks are typically assistant messages. Look for siblings/parents for user messages too.
      proseEls.forEach((el) => {
        const content = el.textContent?.trim() || '';
        if (content) {
          messages.push({ role: 'assistant', content, timestamp: Date.now() });
        }
      });
      // This only gets assistant messages - not ideal but better than nothing
      if (messages.length >= 1) return messages;
      messages.length = 0;
    }

    // Strategy 4: Generic - find alternating content blocks
    // Look for direct children of a scrollable container that have substantial text
    const scrollable = container.querySelector('[class*="overflow-y"], [class*="scroll"]') || container;
    const children = scrollable.children;
    for (let i = 0; i < children.length; i++) {
      const el = children[i];
      const content = el.textContent?.trim() || '';
      if (content.length < 5) continue;
      // Alternate user/assistant based on position (common pattern)
      messages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content,
        timestamp: Date.now(),
      });
    }

    return messages;
  },

  observeNewMessages(callback) {
    const container = this.getMessageContainer();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            const content = node.textContent?.trim();
            if (!content || content.length < 5) continue;
            const attrs = (node.getAttribute('data-role') || '') +
              (node.getAttribute('data-testid') || '') + ' ' + node.className;
            const isUser = /user/i.test(attrs);
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
