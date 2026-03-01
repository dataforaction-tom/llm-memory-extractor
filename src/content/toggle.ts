/**
 * Floating capture toggle button.
 *
 * Injects a small brain-icon FAB into LLM chat pages via a closed shadow DOM
 * so page styles cannot interfere with the button and vice-versa.
 *
 * The button supports:
 *  - click to toggle recording on/off
 *  - drag to reposition (with 5 px dead-zone so clicks aren't swallowed)
 *  - position persistence via chrome.storage.local
 */

// ---------------------------------------------------------------------------
// CSS — inlined so it lives inside the shadow root
// ---------------------------------------------------------------------------

const TOGGLE_CSS = `
:host {
  position: fixed !important;
  bottom: 20px !important;
  right: 20px !important;
  z-index: 2147483647 !important;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
}

.toggle-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  background: #6b7280;
  color: white;
}

.toggle-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.toggle-btn.recording {
  background: #22c55e;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%   { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
  70%  { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
  100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
}

.toggle-btn svg {
  width: 24px;
  height: 24px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
}
`;

// ---------------------------------------------------------------------------
// SVG icon (light-bulb / brain shape)
// ---------------------------------------------------------------------------

const BRAIN_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M12 2a7 7 0 0 0-7 7c0 3 2 5 4 6.5V18a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2.5c2-1.5 4-3.5 4-6.5a7 7 0 0 0-7-7z"/>
  <path d="M9 22h6"/>
  <path d="M10 18h4"/>
</svg>`;

// ---------------------------------------------------------------------------
// Storage key for persisted position
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'llm-memory-toggle-position';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let isRecording = false;
let container: HTMLElement | null = null;
let button: HTMLButtonElement | null = null;

// Dragging state
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartRight = 20;
let dragStartBottom = 20;

// Threshold (px) – movements smaller than this are treated as clicks
const DRAG_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create the floating toggle button and return the host element.
 * Call `document.body.appendChild(...)` on the returned element.
 *
 * @param onToggle Called whenever the user clicks (not drags) the button.
 *                 Receives the *new* recording state.
 */
export function createToggleButton(
  onToggle: (recording: boolean) => void,
): HTMLElement {
  // 1. Container
  container = document.createElement('div');
  container.id = 'llm-memory-toggle';

  // 2. Closed shadow root — page JS/CSS cannot reach inside
  const shadow = container.attachShadow({ mode: 'closed' });

  // 3. Styles
  const style = document.createElement('style');
  style.textContent = TOGGLE_CSS;

  // 4. Button
  button = document.createElement('button');
  button.className = 'toggle-btn';
  button.title = 'Toggle memory capture';
  button.innerHTML = BRAIN_SVG;

  // 5. Click + drag handling
  button.addEventListener('mousedown', onMouseDown);
  button.addEventListener('click', (e: MouseEvent) => {
    if (isDragging) {
      e.preventDefault();
      return;
    }
    isRecording = !isRecording;
    button!.classList.toggle('recording', isRecording);
    onToggle(isRecording);
  });

  // 6. Assemble shadow tree
  shadow.appendChild(style);
  shadow.appendChild(button);

  // 7. Restore persisted position (async, fire-and-forget)
  loadPosition();

  return container;
}

/**
 * Programmatically set the visual recording state without triggering the
 * onToggle callback (useful when restoring state from storage on load).
 */
export function setRecordingState(recording: boolean): void {
  isRecording = recording;
  button?.classList.toggle('recording', recording);
}

/**
 * Remove the toggle button from the DOM and clean up references.
 */
export function removeToggleButton(): void {
  container?.remove();
  container = null;
  button = null;
}

// ---------------------------------------------------------------------------
// Drag handlers
// ---------------------------------------------------------------------------

function onMouseDown(e: MouseEvent): void {
  isDragging = false;
  dragStartX = e.clientX;
  dragStartY = e.clientY;

  if (container) {
    const cs = getComputedStyle(container);
    // :host uses right/bottom positioning — parse current values
    dragStartRight = parseFloat(cs.right) || 20;
    dragStartBottom = parseFloat(cs.bottom) || 20;
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

function onMouseMove(e: MouseEvent): void {
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;

  if (!isDragging && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) {
    return; // still within dead-zone
  }

  isDragging = true;

  if (container) {
    // Right increases when the mouse moves left (negative dx)
    const newRight = Math.max(0, dragStartRight - dx);
    // Bottom increases when the mouse moves up (negative dy)
    const newBottom = Math.max(0, dragStartBottom - dy);

    container.style.setProperty('right', `${newRight}px`, 'important');
    container.style.setProperty('bottom', `${newBottom}px`, 'important');
  }
}

function onMouseUp(_e: MouseEvent): void {
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);

  if (isDragging && container) {
    const cs = getComputedStyle(container);
    const right = parseFloat(cs.right) || 20;
    const bottom = parseFloat(cs.bottom) || 20;
    savePosition(right, bottom);
  }

  // Reset isDragging asynchronously so the click handler that fires right
  // after mouseup still sees isDragging === true when it was a drag.
  requestAnimationFrame(() => {
    isDragging = false;
  });
}

// ---------------------------------------------------------------------------
// Position persistence
// ---------------------------------------------------------------------------

async function loadPosition(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const pos = result[STORAGE_KEY] as
      | { right: number; bottom: number }
      | undefined;

    if (pos && container) {
      container.style.setProperty('right', `${pos.right}px`, 'important');
      container.style.setProperty('bottom', `${pos.bottom}px`, 'important');
    }
  } catch {
    // Storage may be unavailable in some contexts; silently ignore.
  }
}

async function savePosition(right: number, bottom: number): Promise<void> {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: { right, bottom },
    });
  } catch {
    // Silently ignore storage errors.
  }
}
