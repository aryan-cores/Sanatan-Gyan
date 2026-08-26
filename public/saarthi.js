// ================================================================
// saarthi.js — "Saarthi" AI Spiritual Chatbot widget (Point 6).
//
// Self-contained: builds its own DOM, talks to /api/saarthi/chat (send) and
// /api/chatbot/history (load/clear), and
// requires nothing from app.js except the shared AUTH_TOKEN_KEY / token
// lookup convention already used across the app. Works for guests
// (via a locally-generated sessionId) and logged-in users alike.
// ================================================================

(function (window, document) {
  'use strict';

  const TOKEN_KEY = 'sg_token';
  const SESSION_KEY = 'saarthi_session_id';
  const QUICK_PROMPTS = [
    'How to find inner peace?',
    'Gita shloka for motivation',
    'How do I stop overthinking?',
    'How to forgive someone?',
    'A short daily meditation practice'
  ];

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  }

  function getOrCreateSessionId() {
    try {
      let id = localStorage.getItem(SESSION_KEY);
      if (!id) {
        id = 'sg-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch {
      return 'sg-session';
    }
  }

  function authHeaders() {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  function escapeHtmlLocal(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  let isOpen = false;
  let isSending = false;

  function buildDom() {
    if (document.getElementById('saarthiWidgetRoot')) return;

    const root = document.createElement('div');
    root.id = 'saarthiWidgetRoot';
    root.innerHTML = `
      <button type="button" id="saarthiToggleBtn" class="saarthi-toggle-btn" aria-label="Ask Saarthi, your spiritual guide">
        <span class="saarthi-toggle-icon">🕉️</span>
      </button>

      <div id="saarthiPanel" class="saarthi-panel hidden">
        <div class="saarthi-header">
          <div class="saarthi-header-identity">
            <span class="saarthi-header-icon">🪷</span>
            <div class="saarthi-header-text">
              <p class="saarthi-header-title">Saarthi</p>
              <p class="saarthi-header-subtitle">Your guide for the path within</p>
            </div>
          </div>
          <div class="saarthi-header-actions">
            <button type="button" id="saarthiClearBtn" class="saarthi-icon-btn" title="Clear conversation" aria-label="Clear conversation">🗑️</button>
            <button type="button" id="saarthiCloseBtn" class="saarthi-icon-btn" title="Close" aria-label="Close">✕</button>
          </div>
        </div>

        <div id="saarthiMessages" class="saarthi-messages">
          <div class="saarthi-welcome">
            <p class="saarthi-welcome-text">🙏 Namaste, seeker. I am Saarthi — here to offer perspective from the Gita, the Upanishads, and the wider well of Vedic wisdom. What's on your mind today?</p>
          </div>
          <div id="saarthiQuickPrompts" class="saarthi-quick-prompts"></div>
        </div>

        <div id="saarthiTyping" class="saarthi-typing hidden">
          <span class="saarthi-typing-dot"></span>
          <span class="saarthi-typing-dot"></span>
          <span class="saarthi-typing-dot"></span>
        </div>

        <form id="saarthiForm" class="saarthi-input-row">
          <textarea id="saarthiInput" class="saarthi-input" rows="1" maxlength="2000"
            placeholder="Ask Saarthi anything…"></textarea>
          <button type="submit" id="saarthiSendBtn" class="saarthi-send-btn" aria-label="Send">➤</button>
        </form>
      </div>
    `;
    document.body.appendChild(root);

    document.getElementById('saarthiToggleBtn').addEventListener('click', togglePanel);
    document.getElementById('saarthiCloseBtn').addEventListener('click', closePanel);
    document.getElementById('saarthiClearBtn').addEventListener('click', clearConversation);
    document.getElementById('saarthiForm').addEventListener('submit', handleSubmit);

    const input = document.getElementById('saarthiInput');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 96) + 'px';
    });
    // Keyboard opening/closing changes the visual viewport with a slight
    // delay on some browsers — re-run the sizing fix once focus settles.
    input.addEventListener('focus', () => setTimeout(updateViewportSize, 250));
    input.addEventListener('blur', () => setTimeout(updateViewportSize, 250));

    renderQuickPrompts();
  }

  function renderQuickPrompts() {
    const wrap = document.getElementById('saarthiQuickPrompts');
    wrap.innerHTML = '';
    QUICK_PROMPTS.forEach((prompt) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'saarthi-chip';
      chip.textContent = prompt;
      chip.addEventListener('click', () => sendMessage(prompt));
      wrap.appendChild(chip);
    });
  }

  function togglePanel() {
    isOpen ? closePanel() : openPanel();
  }

  function openPanel() {
    isOpen = true;
    document.getElementById('saarthiPanel').classList.remove('hidden');
    document.getElementById('saarthiToggleBtn').classList.add('is-open');
    document.body.classList.add('saarthi-open');
    loadHistory();
    setTimeout(() => document.getElementById('saarthiInput')?.focus(), 150);
    updateViewportSize();
  }

  function closePanel() {
    isOpen = false;
    document.getElementById('saarthiPanel').classList.add('hidden');
    document.getElementById('saarthiToggleBtn').classList.remove('is-open');
    document.body.classList.remove('saarthi-open');
  }

  // ── Mobile keyboard / viewport fix (Point 3) ──
  // On mobile, 100vh/100dvh don't shrink when the on-screen keyboard opens
  // (only window.visualViewport does), so the input bar can end up pushed
  // below the visible screen or hidden behind the keyboard. We size the
  // fullscreen panel to the *visual* viewport directly, whenever it changes.
  function updateViewportSize() {
    const panel = document.getElementById('saarthiPanel');
    if (!panel || !isOpen) return;
    if (window.innerWidth > 640) {
      // Desktop/tablet popup card — not fullscreen, no fix needed
      panel.style.height = '';
      panel.style.top = '';
      return;
    }
    if (window.visualViewport) {
      const vv = window.visualViewport;
      panel.style.height = `${vv.height}px`;
      panel.style.top = `${vv.offsetTop}px`;
    } else {
      panel.style.height = '100dvh';
      panel.style.top = '0px';
    }
    // Keep the newest message / input in view once the layout has settled
    const messages = document.getElementById('saarthiMessages');
    if (messages) messages.scrollTop = messages.scrollHeight;
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateViewportSize);
    window.visualViewport.addEventListener('scroll', updateViewportSize);
  } else {
    window.addEventListener('resize', updateViewportSize);
  }

  let historyLoaded = false;

  async function loadHistory() {
    if (historyLoaded) return;
    historyLoaded = true;

    try {
      const sessionId = getOrCreateSessionId();
      const res = await fetch(`/api/chatbot/history?sessionId=${encodeURIComponent(sessionId)}`, {
        headers: authHeaders()
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data) && data.data.length) {
        const messagesEl = document.getElementById('saarthiMessages');
        data.data.forEach((m) => appendMessage(m.role, m.text, { skipScroll: true }));
        document.getElementById('saarthiQuickPrompts').classList.add('hidden');
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    } catch {
      // Silent — a failed history load shouldn't block using the widget.
    }
  }

  async function clearConversation() {
    try {
      const sessionId = getOrCreateSessionId();
      await fetch(`/api/chatbot/history?sessionId=${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
    } catch { /* best-effort */ }

    const messagesEl = document.getElementById('saarthiMessages');
    messagesEl.innerHTML = `
      <div class="saarthi-welcome">
        <p class="saarthi-welcome-text">🙏 Conversation cleared. What would you like to explore now?</p>
      </div>
      <div id="saarthiQuickPrompts" class="saarthi-quick-prompts"></div>
    `;
    renderQuickPrompts();
  }

  function appendMessage(role, text, opts = {}) {
    const messagesEl = document.getElementById('saarthiMessages');
    const bubble = document.createElement('div');
    bubble.className = `saarthi-bubble saarthi-bubble--${role}`;
    bubble.innerHTML = `<p>${escapeHtmlLocal(text).replace(/\n/g, '<br>')}</p>`;
    messagesEl.appendChild(bubble);
    if (!opts.skipScroll) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    return bubble;
  }

  function setTyping(show) {
    document.getElementById('saarthiTyping').classList.toggle('hidden', !show);
    if (show) {
      const messagesEl = document.getElementById('saarthiMessages');
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('saarthiInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    sendMessage(text);
  }

  async function sendMessage(text) {
    if (isSending) return;
    isSending = true;

    document.getElementById('saarthiQuickPrompts').classList.add('hidden');
    appendMessage('user', text);

    const sendBtn = document.getElementById('saarthiSendBtn');
    sendBtn.disabled = true;
    setTyping(true);

    try {
      const res = await fetch('/api/saarthi/chat', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ message: text, sessionId: getOrCreateSessionId() })
      });
      const data = await res.json();
      setTyping(false);

      if (!res.ok || !data.success) {
        appendMessage('assistant', data.message || 'I could not respond just now. Please try again in a moment. 🙏');
        return;
      }

      appendMessage('assistant', data.data.reply);
    } catch (err) {
      setTyping(false);
      appendMessage('assistant', 'It seems the connection wavered. Please try again in a moment. 🙏');
    } finally {
      isSending = false;
      sendBtn.disabled = false;
    }
  }

  function init() {
    buildDom();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.Saarthi = { open: () => { buildDom(); openPanel(); }, close: closePanel };
})(window, document);
