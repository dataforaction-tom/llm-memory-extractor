/**
 * Cross-browser API abstraction layer.
 *
 * Firefox exposes promise-based `browser.*` APIs while Chrome uses `chrome.*`
 * (which also supports promises in Manifest V3). This module provides a
 * unified wrapper so the rest of the codebase never needs to care which
 * browser is running.
 */

// Extend globalThis so TypeScript allows `globalThis.browser`.
// At runtime the property exists in Firefox and is `undefined` elsewhere.
declare global {
  // eslint-disable-next-line no-var
  var browser: typeof chrome | undefined;
}

/** True when running inside Firefox. */
export const isFirefox: boolean =
  typeof globalThis.browser !== 'undefined';

/**
 * The raw extension API namespace.  Prefer the named wrappers below, but
 * this is available when you need direct access.
 */
const api: typeof chrome = isFirefox
  ? (globalThis as unknown as { browser: typeof chrome }).browser
  : chrome;

// ---------------------------------------------------------------------------
// storage  (storage.local)
// ---------------------------------------------------------------------------

export const storage = {
  async get<T>(key: string): Promise<T | undefined> {
    const result = await api.storage.local.get(key);
    return result[key] as T | undefined;
  },

  async set(key: string, value: unknown): Promise<void> {
    await api.storage.local.set({ [key]: value });
  },

  async remove(key: string): Promise<void> {
    await api.storage.local.remove(key);
  },
};

// ---------------------------------------------------------------------------
// runtime
// ---------------------------------------------------------------------------

export const runtime = {
  sendMessage(message: unknown): Promise<unknown> {
    return api.runtime.sendMessage(message);
  },
  onMessage: api.runtime.onMessage,
};

// ---------------------------------------------------------------------------
// tabs
// ---------------------------------------------------------------------------

export const tabs = {
  async query(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
    return api.tabs.query(queryInfo);
  },

  async sendMessage(tabId: number, message: unknown): Promise<unknown> {
    return api.tabs.sendMessage(tabId, message);
  },
};

// ---------------------------------------------------------------------------
// badge  (action.setBadgeText / setBadgeBackgroundColor)
// ---------------------------------------------------------------------------

export const badge = {
  async set(text: string): Promise<void> {
    await api.action.setBadgeText({ text });
    await api.action.setBadgeBackgroundColor({ color: '#22c55e' });
  },

  async clear(): Promise<void> {
    await api.action.setBadgeText({ text: '' });
  },
};

// ---------------------------------------------------------------------------
// alarms
// ---------------------------------------------------------------------------

export const alarms = {
  create: api.alarms.create.bind(api.alarms),
  clear: api.alarms.clear.bind(api.alarms),
  onAlarm: api.alarms.onAlarm,
};

// ---------------------------------------------------------------------------
// notifications
// ---------------------------------------------------------------------------

export const notifications = {
  create(
    id: string,
    options: chrome.notifications.NotificationCreateOptions,
  ): Promise<string> {
    return api.notifications.create(id, options);
  },
};
