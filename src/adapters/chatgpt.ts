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

    // Use only [data-message-author-role] to avoid duplicates from conversation-turn wrappers.
    // The conversation-turn articles contain "You said:" / "ChatGPT said:" prefixes
    // and duplicate the inner content, so we skip them.
    const elements = container.querySelectorAll('[data-message-author-role]');

    console.log(`[LME chatgpt] parseMessages: found ${elements.length} [data-message-author-role] elements`);

    elements.forEach((el, i) => {
      const authorRole = el.getAttribute('data-message-author-role');
      // Skip system messages (e.g. tool calls, system prompts)
      if (authorRole !== 'user' && authorRole !== 'assistant') return;

      const role: Message['role'] = authorRole === 'user' ? 'user' : 'assistant';
      const content = el.textContent?.trim() || '';

      console.log(`[LME chatgpt]   el[${i}] role="${authorRole}" content=${content.length} chars, preview="${content.substring(0, 100)}"`);

      if (content) {
        messages.push({ role, content, timestamp: Date.now() });
      }
    });

    // Fallback: if no data-message-author-role elements found, try conversation-turn articles
    if (messages.length === 0) {
      const turns = container.querySelectorAll('[data-testid^="conversation-turn"]');
      console.log(`[LME chatgpt] Fallback: found ${turns.length} conversation-turn elements`);
      turns.forEach((el, i) => {
        const content = el.textContent?.trim() || '';
        if (!content) return;
        const hasUser = el.querySelector('[data-message-author-role="user"]') !== null;
        const role: Message['role'] = hasUser ? 'user' : 'assistant';
        messages.push({ role, content, timestamp: Date.now() });
      });
    }

    console.log(`[LME chatgpt] parseMessages: returning ${messages.length} messages, total content: ${messages.reduce((s, m) => s + m.content.length, 0)} chars`);
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
            if (authorRole === 'user' || authorRole === 'assistant') {
              callback({
                role: authorRole,
                content,
                timestamp: Date.now(),
              });
            }
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
