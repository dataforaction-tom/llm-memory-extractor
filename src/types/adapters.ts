import type { Message } from './facts';

export interface SiteAdapter {
  id: string;
  name: string;
  matchUrls: string[];
  getMessageContainer(): Element | null;
  parseMessages(container: Element): Message[];
  observeNewMessages(callback: (msg: Message) => void): MutationObserver;
}
