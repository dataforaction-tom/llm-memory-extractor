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
  // 1. Skip short conversations (< 3 messages)
  if (data.messages.length < 3) return;

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

  // 3. Load schema
  const schema = await loadSchema();

  // 4. Build prompt from schema
  const systemPrompt = buildExtractionPrompt(schema);
  const userMessage = formatConversationForExtraction(conversation.messages);

  // 5. Get provider config
  const config = await storage.get<ProviderConfig>('providerConfig');
  const provider = createProvider(config || { type: 'ollama' });

  // 6. Call LLM with keepalive
  chrome.alarms.create('extraction-keepalive', { periodInMinutes: 0.4 });
  try {
    const response = await provider.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      config?.model || 'llama3',
    );

    // 7. Parse response
    let extractedFacts = parseExtractionResponse(response);
    extractedFacts = extractedFacts.map((f) => ({
      ...f,
      value: normalizeFactValue(f.value),
    }));

    // 8. Deduplicate against existing facts
    const existingFacts = await getAllFacts();
    extractedFacts = deduplicateFacts(extractedFacts, existingFacts);

    // 9. PII filter
    const { clean, flagged } = filterFacts(extractedFacts, schema.piiRules);

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

    console.log(`Extracted ${newFactIds.length} facts from ${data.platform} conversation`);
  } catch (err) {
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
        return { ok: true };
      }
      case 'CONVERSATION_CAPTURED': {
        // Fire and forget — don't block the content script
        handleConversationCaptured(message).catch(console.error);
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
        return config || { type: 'ollama' };
      }
      case 'SAVE_PROVIDER_CONFIG': {
        await storage.set('providerConfig', message.config);
        return { ok: true };
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

console.log('LLM Memory Extractor service worker loaded');
