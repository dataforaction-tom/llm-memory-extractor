import type { SiteAdapter } from '@/types';

// Registry of all adapters - will be populated by index.ts
export let adapters: SiteAdapter[] = [];

export function registerAdapters(list: SiteAdapter[]) {
  adapters = list;
}

/**
 * Detect which site adapter matches the current URL
 */
export function detectCurrentSite(): SiteAdapter | null {
  const url = window.location.href;
  for (const adapter of adapters) {
    for (const pattern of adapter.matchUrls) {
      // Convert glob pattern to regex
      const regex = new RegExp(
        '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
      );
      if (regex.test(url)) return adapter;
    }
  }
  return null;
}
