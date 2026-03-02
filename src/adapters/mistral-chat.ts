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

    console.log(`[LME mistral] parseMessages: container=<${container.tagName}.${container.className?.split(' ')[0] || ''}>`);

    // Strategy 1: data attributes
    const dataSelectors = [
      '[data-role="user"], [data-role="assistant"]',
      '[data-testid*="user"], [data-testid*="assistant"]',
      '[data-testid*="message"]',
      '[data-message-role]',
    ];

    for (const selector of dataSelectors) {
      const elements = container.querySelectorAll(selector);
      console.log(`[LME mistral] Strategy 1 selector "${selector}" => ${elements.length} elements`);
      if (elements.length >= 2) {
        elements.forEach((el, i) => {
          const content = el.textContent?.trim() || '';
          if (!content) return;
          const attrs = (el.getAttribute('data-role') || '') +
            (el.getAttribute('data-testid') || '') +
            (el.getAttribute('data-message-role') || '');
          const isUser = /user/i.test(attrs);
          console.log(`[LME mistral]   el[${i}] <${el.tagName}> attrs="${attrs}" content=${content.length} chars, preview="${content.substring(0, 80)}"`);
          messages.push({ role: isUser ? 'user' : 'assistant', content, timestamp: Date.now() });
        });
        console.log(`[LME mistral] Strategy 1 matched: ${messages.length} messages`);
        return messages;
      }
    }

    // Strategy 2: aria/role attributes
    const ariaEls = container.querySelectorAll('[role="article"], [role="listitem"], [role="row"]');
    console.log(`[LME mistral] Strategy 2 (aria): ${ariaEls.length} elements`);
    if (ariaEls.length >= 2) {
      ariaEls.forEach((el, i) => {
        const content = el.textContent?.trim() || '';
        if (!content || content.length < 3) return;
        const allText = el.className + ' ' + el.innerHTML.substring(0, 200);
        const isUser = /user|human|you/i.test(allText);
        console.log(`[LME mistral]   aria[${i}] <${el.tagName}> isUser=${isUser} content=${content.length} chars`);
        messages.push({ role: isUser ? 'user' : 'assistant', content, timestamp: Date.now() });
      });
      if (messages.length >= 2) {
        console.log(`[LME mistral] Strategy 2 matched: ${messages.length} messages`);
        return messages;
      }
      messages.length = 0;
    }

    // Strategy 3: Look for prose blocks (Tailwind markdown rendering)
    const proseEls = container.querySelectorAll('[class*="prose"], [class*="markdown"]');
    console.log(`[LME mistral] Strategy 3 (prose/markdown): ${proseEls.length} elements`);
    if (proseEls.length >= 1) {
      proseEls.forEach((el, i) => {
        const content = el.textContent?.trim() || '';
        console.log(`[LME mistral]   prose[${i}] <${el.tagName}.${el.className?.split(' ')[0] || ''}> content=${content.length} chars`);
        if (content) {
          messages.push({ role: 'assistant', content, timestamp: Date.now() });
        }
      });
      if (messages.length >= 1) {
        console.log(`[LME mistral] Strategy 3 matched: ${messages.length} messages`);
        return messages;
      }
      messages.length = 0;
    }

    // Strategy 4: Generic - find alternating content blocks
    const scrollable = container.querySelector('[class*="overflow-y"], [class*="scroll"]') || container;
    const children = scrollable.children;
    console.log(`[LME mistral] Strategy 4 (generic): scrollable=<${scrollable.tagName}.${scrollable.className?.split(' ')[0] || ''}>, ${children.length} children`);
    for (let i = 0; i < children.length; i++) {
      const el = children[i];
      const content = el.textContent?.trim() || '';
      if (content.length < 5) continue;
      console.log(`[LME mistral]   child[${i}] <${el.tagName}.${el.className?.split(' ')[0] || ''}> content=${content.length} chars, preview="${content.substring(0, 80)}"`);
      messages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content,
        timestamp: Date.now(),
      });
    }

    console.log(`[LME mistral] Strategy 4 result: ${messages.length} messages, total: ${messages.reduce((s, m) => s + m.content.length, 0)} chars`);
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
