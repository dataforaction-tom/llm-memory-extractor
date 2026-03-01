import { detectCurrentSite, registerAdapters } from '@/adapters/base';
import { adapters as allAdapters } from '@/adapters/index';
import { createToggleButton, setRecordingState } from './toggle';
import type { Message } from '@/types';

// Register all adapters
registerAdapters(allAdapters);

let isCapturing = false;
let capturedMessages: Message[] = [];
let observer: MutationObserver | null = null;
let currentAdapter = detectCurrentSite();

if (currentAdapter) {
  // Inject toggle button
  const toggleEl = createToggleButton(handleToggle);
  document.body.appendChild(toggleEl);

  // Listen for messages from service worker
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'SET_CAPTURE_STATE') {
      isCapturing = msg.recording;
      setRecordingState(msg.recording);
      if (msg.recording) startCapture();
      else stopCapture();
      sendResponse({ ok: true });
    }
    if (msg.type === 'GET_CAPTURE_STATE') {
      sendResponse({ recording: isCapturing });
    }
    return true;
  });

  // Handle page unload - send captured messages
  window.addEventListener('beforeunload', () => {
    if (isCapturing && capturedMessages.length > 0) {
      sendCapturedConversation();
    }
  });

  // Handle URL changes (SPA navigation)
  let lastUrl = window.location.href;
  const urlObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      if (isCapturing && capturedMessages.length > 0) {
        sendCapturedConversation();
        capturedMessages = [];
      }
      lastUrl = window.location.href;
      currentAdapter = detectCurrentSite();
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });
}

function handleToggle(recording: boolean) {
  isCapturing = recording;
  if (recording) startCapture();
  else stopCapture();
  // Notify service worker
  chrome.runtime.sendMessage({
    type: 'TOGGLE_CAPTURE',
    recording,
    platform: currentAdapter?.id,
  });
}

function startCapture() {
  if (!currentAdapter) return;
  const container = currentAdapter.getMessageContainer();
  if (!container) return;

  // Get existing messages
  capturedMessages = currentAdapter.parseMessages(container);

  // Watch for new messages
  observer = currentAdapter.observeNewMessages((msg) => {
    capturedMessages.push(msg);
  });
}

function stopCapture() {
  observer?.disconnect();
  observer = null;
  if (capturedMessages.length > 0) {
    sendCapturedConversation();
    capturedMessages = [];
  }
}

function sendCapturedConversation() {
  if (capturedMessages.length < 3) return; // Skip short conversations
  chrome.runtime.sendMessage({
    type: 'CONVERSATION_CAPTURED',
    messages: capturedMessages,
    platform: currentAdapter?.id || 'unknown',
    title: document.title,
  });
}
