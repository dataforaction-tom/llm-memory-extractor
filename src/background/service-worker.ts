import { v4 as uuid } from 'uuid';
import {
  buildExtractionPrompt,
  formatConversationForExtraction,
  parseExtractionResponse,
  normalizeFactValue,
} from '@/core/extraction';
import { deduplicateFacts } from '@/core/deduplication';
import { filterFacts } from '@/core/pii-filter';
import { loadSchema } from '@/core/schema';
import { createProvider } from '@/core/providers/index';
import {
  addFact,
  getAllFacts,
  addConversation,
  updateConversation,
  getAllConversations,
  getConversation,
} from '@/storage/db';
import { storage, badge } from '@/utils/browser';
import type { ProviderConfig, CapturedConversation } from '@/types';

// ---------------------------------------------------------------------------
// Activity log — in-memory ring buffer for debugging
// ---------------------------------------------------------------------------

interface LogEntry {
  id: number;
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  detail?: string;
}

const MAX_LOG_ENTRIES = 200;
const activityLog: LogEntry[] = [];
let logSeq = 0;

function log(level: LogEntry['level'], message: string, detail?: string) {
  const entry: LogEntry = { id: ++logSeq, timestamp: Date.now(), level, message, detail };
  activityLog.push(entry);
  if (activityLog.length > MAX_LOG_ENTRIES) activityLog.shift();
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
  console.log(`[LME ${prefix}] ${message}`, detail || '');
}

// ---------------------------------------------------------------------------
// Capture state tracking
// ---------------------------------------------------------------------------

const captureState = new Map<number, boolean>(); // tabId -> recording

// Clean up on tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  captureState.delete(tabId);
});

// ---------------------------------------------------------------------------
// Extraction pipeline
// ---------------------------------------------------------------------------

async function handleConversationCaptured(data: {
  messages: Array<{ role: string; content: string; timestamp: number | null }>;
  platform: string;
  title: string;
}) {
  log('info', `Conversation received from ${data.platform}`, `${data.messages.length} messages, title: "${data.title}"`);

  // --- Diagnostic: log each message's role, content length, and preview ---
  const totalContentChars = data.messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  log('info', 'Message content diagnostic', `total content chars: ${totalContentChars}, avg per message: ${Math.round(totalContentChars / data.messages.length)}`);
  data.messages.forEach((m, i) => {
    const len = m.content?.length || 0;
    const preview = (m.content || '').substring(0, 120).replace(/\n/g, '\\n');
    log('info', `  msg[${i}] ${m.role} (${len} chars)`, preview || '(empty)');
  });
  // --- End diagnostic ---

  // 1. Skip empty conversations
  if (data.messages.length < 1) {
    log('warn', 'Skipped: no messages', 'Conversation had 0 messages');
    return;
  }

  // 2. Store conversation in IndexedDB
  const conversationId = uuid();
  const conversation: CapturedConversation = {
    id: conversationId,
    platform: data.platform,
    title: data.title || 'Untitled',
    messages: data.messages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
      timestamp: m.timestamp,
    })),
    capturedAt: Date.now(),
    extractionStatus: 'pending',
    factIds: [],
  };
  await addConversation(conversation);
  log('info', 'Conversation stored in IndexedDB', `id: ${conversationId}`);

  // 3. Load schema
  const schema = await loadSchema();
  const enabledCategories = schema.categories.filter(c => c.enabled);
  log('info', 'Schema loaded', `${enabledCategories.length} enabled categories`);

  // 4. Build prompt from schema
  const systemPrompt = buildExtractionPrompt(schema);
  const userMessage = formatConversationForExtraction(conversation.messages);

  // 5. Get provider config
  const config = await storage.get<ProviderConfig>('providerConfig');
  const provider = createProvider(config || { type: 'ollama' });
  log('info', 'LLM provider ready', `type: ${config?.type || 'ollama'}, model: ${config?.model || 'llama3'}`);

  // 6. Call LLM with keepalive
  log('info', 'Calling LLM for extraction...', `system prompt: ${systemPrompt.length} chars, user message: ${userMessage.length} chars`);
  log('info', 'User message preview (first 300 chars)', userMessage.substring(0, 300).replace(/\n/g, '\\n'));
  chrome.alarms.create('extraction-keepalive', { periodInMinutes: 0.4 });
  try {
    const response = await provider.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      config?.model || 'llama3',
    );

    log('info', 'LLM response received', `length: ${response.length} chars`);
    log('info', 'Raw LLM response (first 500 chars)', response.substring(0, 500));

    // 7. Parse response
    let extractedFacts = parseExtractionResponse(response);
    extractedFacts = extractedFacts.map((f) => ({
      ...f,
      value: normalizeFactValue(f.value),
    }));
    log('info', 'Parsed extraction response', `${extractedFacts.length} facts extracted`);

    // 8. Deduplicate against existing facts
    const existingFacts = await getAllFacts();
    extractedFacts = deduplicateFacts(extractedFacts, existingFacts);
    log('info', 'After deduplication', `${extractedFacts.length} unique facts`);

    // 9. PII filter
    const { clean, flagged } = filterFacts(extractedFacts, schema.piiRules);
    log('info', 'PII filter complete', `${clean.length} clean, ${flagged.length} flagged`);

    // 10. Store as pending facts
    const newFactIds: string[] = [];
    const allPending = [
      ...clean.map((f) => ({ ...f, piiWarning: false, piiReasons: [] as string[] })),
      ...flagged.map((f) => ({ ...f, piiWarning: true })),
    ];

    for (const fact of allPending) {
      const factId = uuid();
      newFactIds.push(factId);
      await addFact({
        id: factId,
        key: fact.key,
        value: fact.value,
        categoryId: fact.categoryId,
        confidence: fact.confidence,
        status: 'pending',
        evidenceQuote: fact.evidenceQuote,
        sourceConversation: conversationId,
        sourcePlatform: data.platform,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        piiWarning: fact.piiWarning,
        piiReasons: fact.piiReasons,
      });
    }

    // 11. Update conversation status
    await updateConversation(conversationId, {
      extractionStatus: 'extracted',
      factIds: newFactIds,
    });

    // 12. Badge notification
    if (newFactIds.length > 0) {
      await badge.set(String(newFactIds.length));
    }

    log('info', `Extraction complete`, `${newFactIds.length} facts stored from ${data.platform}`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log('error', 'Extraction failed', errMsg);
    console.error('Extraction failed:', err);
    await updateConversation(conversationId, { extractionStatus: 'failed' });
  } finally {
    chrome.alarms.clear('extraction-keepalive');
  }
}

// ---------------------------------------------------------------------------
// Alarm listener (keepalive)
// ---------------------------------------------------------------------------

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'extraction-keepalive') {
    // No-op — keeps service worker alive during extraction
  }
});

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = async () => {
    switch (message.type) {
      case 'TOGGLE_CAPTURE': {
        const tabId = sender.tab?.id;
        if (tabId) {
          captureState.set(tabId, message.recording);
        }
        log('info', `Capture ${message.recording ? 'started' : 'stopped'}`, `tab: ${tabId}, platform: ${message.platform || 'unknown'}`);
        // Broadcast state change to sidebar/popup
        chrome.runtime.sendMessage({
          type: 'CAPTURE_STATE_CHANGED',
          recording: message.recording,
          tabId,
        }).catch(() => {}); // No listeners is fine
        return { ok: true };
      }
      case 'CONVERSATION_CAPTURED': {
        log('info', 'Conversation captured, queuing extraction', `platform: ${message.platform}, messages: ${message.messages?.length || 0}`);
        // Fire and forget — don't block the content script
        handleConversationCaptured(message).catch((err) => {
          log('error', 'handleConversationCaptured threw', err instanceof Error ? err.message : String(err));
        });
        return { ok: true, queued: true };
      }
      case 'GET_CAPTURE_STATE': {
        const tabId = sender.tab?.id;
        return { recording: tabId ? captureState.get(tabId) || false : false };
      }
      case 'GET_STATS': {
        const facts = await getAllFacts();
        const conversations = await getAllConversations();
        return {
          totalFacts: facts.length,
          pendingFacts: facts.filter((f) => f.status === 'pending').length,
          confirmedFacts: facts.filter((f) => f.status === 'confirmed').length,
          totalConversations: conversations.length,
        };
      }
      case 'GET_PROVIDER_CONFIG': {
        const config = await storage.get<ProviderConfig>('providerConfig');
        log('info', 'Provider config loaded', `type: ${config?.type || 'ollama'}, hasKey: ${!!config?.apiKey}, model: ${config?.model || 'none'}`);
        return config || { type: 'ollama' };
      }
      case 'SAVE_PROVIDER_CONFIG': {
        await storage.set('providerConfig', message.config);
        log('info', 'Provider config saved', `type: ${message.config?.type}, hasKey: ${!!message.config?.apiKey}, model: ${message.config?.model}`);
        return { ok: true };
      }
      case 'GET_ACTIVITY_LOG': {
        const sinceId = message.sinceId || 0;
        return activityLog.filter(e => e.id > sinceId);
      }
      case 'RETRY_EXTRACTION': {
        const conv = await getConversation(message.conversationId);
        if (conv) {
          await handleConversationCaptured({
            messages: conv.messages,
            platform: conv.platform,
            title: conv.title,
          });
        }
        return { ok: true };
      }
      default:
        return { error: 'Unknown message type' };
    }
  };

  handler().then(sendResponse).catch((err) => sendResponse({ error: err.message }));
  return true; // Keep channel open for async response
});

// ---------------------------------------------------------------------------
// Side panel: open on action click
// ---------------------------------------------------------------------------

// Enable opening side panel by clicking the extension icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

console.log('LLM Memory Extractor service worker loaded');
