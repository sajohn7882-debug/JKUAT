/**
 * Campus AI Floating Assistant Widget
 * Encapsulated Custom Element with Shadow DOM
 * Renders a small floating icon on the right that expands into a campus assistant when clicked.
 */
class CampusAIWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._isOpen = false;
    this._isLoading = false;
    this._history = [];
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 99999;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #17324d;
        }

        *, *::before, *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        /* Floating Small Circular Icon */
        .launcher-btn {
          width: 52px;
          height: 52px;
          min-width: 52px;
          min-height: 52px;
          border-radius: 50%;
          background: #0f2742;
          border: 2px solid #f4b942;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          position: relative;
          box-shadow: 0 8px 24px rgba(15, 39, 66, 0.35);
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease, background 0.2s ease;
          outline: none;
        }

        .launcher-btn:hover {
          transform: scale(1.08);
          box-shadow: 0 12px 30px rgba(15, 39, 66, 0.45);
          background: #081d33;
        }

        .launcher-btn:active {
          transform: scale(0.95);
        }

        .launcher-icon {
          font-size: 22px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.25s ease;
        }

        .online-dot {
          position: absolute;
          bottom: 2px;
          right: 2px;
          width: 11px;
          height: 11px;
          background: #10b981;
          border: 2px solid #0f2742;
          border-radius: 50%;
        }

        /* Expanded Assistant Card */
        .card-container {
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 360px;
          max-width: calc(100vw - 32px);
          height: 520px;
          max-height: calc(100vh - 48px);
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 20px 48px rgba(15, 39, 66, 0.3);
          border: 1px solid rgba(23, 50, 77, 0.14);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          opacity: 0;
          transform: translateY(16px) scale(0.96);
          pointer-events: none;
          visibility: hidden;
          transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.22s;
        }

        :host([open]) .card-container {
          opacity: 1;
          transform: translateY(0) scale(1);
          pointer-events: auto;
          visibility: visible;
        }

        :host([open]) .launcher-btn {
          opacity: 0;
          pointer-events: none;
          transform: scale(0.8);
        }

        /* Header */
        .card-header {
          padding: 14px 16px;
          background: #0f2742;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 2px solid #f4b942;
        }

        .header-title-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .header-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(244, 185, 66, 0.15);
          border: 1.5px solid #f4b942;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
        }

        .header-text strong {
          display: block;
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
          line-height: 1.2;
        }

        .header-status {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          color: #cbd5e1;
        }

        .status-pulse {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10b981;
        }

        .close-btn {
          background: transparent;
          border: none;
          color: #cbd5e1;
          font-size: 18px;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }

        .close-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
        }

        /* Message Feed */
        .messages-area {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: #f8fafc;
        }

        .msg-row {
          display: flex;
          flex-direction: column;
          max-width: 86%;
        }

        .msg-bot {
          align-self: flex-start;
        }

        .msg-user {
          align-self: flex-end;
        }

        .msg-bubble {
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 13.5px;
          line-height: 1.45;
          word-break: break-word;
        }

        .msg-bot .msg-bubble {
          background: #ffffff;
          color: #1e293b;
          border: 1px solid #e2e8f0;
          border-bottom-left-radius: 3px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.03);
        }

        .msg-user .msg-bubble {
          background: #087e8b;
          color: #ffffff;
          border-bottom-right-radius: 3px;
        }

        /* Prompt Suggestions */
        .suggestions-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 4px;
        }

        .chip-btn {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: #17324d;
          font-size: 12px;
          padding: 5px 10px;
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.15s ease;
          font-weight: 500;
          white-space: nowrap;
        }

        .chip-btn:hover {
          background: #0f2742;
          color: #ffffff;
          border-color: #0f2742;
        }

        /* Typing indicator */
        .typing-indicator {
          display: inline-flex;
          gap: 4px;
          padding: 10px 14px;
          background: #ffffff;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          align-self: flex-start;
        }

        .dot {
          width: 6px;
          height: 6px;
          background: #94a3b8;
          border-radius: 50%;
          animation: blink 1.2s infinite ease-in-out both;
        }

        .dot:nth-child(1) { animation-delay: -0.32s; }
        .dot:nth-child(2) { animation-delay: -0.16s; }

        @keyframes blink {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }

        /* Input Form */
        .input-bar {
          padding: 10px 12px;
          background: #ffffff;
          border-top: 1px solid #e2e8f0;
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .text-input {
          flex: 1;
          height: 38px;
          padding: 0 12px;
          border: 1px solid #cbd5e1;
          border-radius: 20px;
          font-size: 13.5px;
          outline: none;
          color: #1e293b;
          background: #f8fafc;
          transition: border-color 0.15s ease, background 0.15s ease;
        }

        .text-input:focus {
          border-color: #087e8b;
          background: #ffffff;
        }

        .send-btn {
          width: 38px;
          height: 38px;
          min-width: 38px;
          border-radius: 50%;
          background: #087e8b;
          color: #ffffff;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.15s ease, transform 0.1s ease;
        }

        .send-btn:hover {
          background: #065b64;
          transform: scale(1.05);
        }

        .send-btn:disabled {
          background: #cbd5e1;
          cursor: not-allowed;
          transform: none;
        }

        @media (max-width: 480px) {
          :host {
            bottom: 16px;
            right: 16px;
          }
          .card-container {
            bottom: 16px;
            right: 16px;
            width: calc(100vw - 32px);
            height: calc(100vh - 90px);
          }
        }
      </style>

      <!-- Small Floating Circular Launcher Button on the Right -->
      <button class="launcher-btn" id="launcher-btn" type="button" aria-label="Campus Assistant" title="Campus Assistant">
        <span class="launcher-icon">✨</span>
        <span class="online-dot"></span>
      </button>

      <!-- Expanded Assistant Card -->
      <div class="card-container" id="card-container" role="dialog" aria-modal="false" aria-label="Campus Assistant">
        <div class="card-header">
          <div class="header-title-group">
            <div class="header-avatar">✨</div>
            <div class="header-text">
              <strong>Campus Assistant</strong>
              <div class="header-status">
                <span class="status-pulse"></span>
                <span>Active</span>
              </div>
            </div>
          </div>
          <button class="close-btn" id="close-btn" type="button" aria-label="Close Assistant">✕</button>
        </div>

        <div class="messages-area" id="messages-area">
          <div class="msg-row msg-bot">
            <div class="msg-bubble">
              Ask about campus, learning, coding, writing, study plans, or any question you are working through.
            </div>
          </div>

          <div class="suggestions-row" id="suggestions-row">
            <button class="chip-btn" data-query="Where is the JKUAT Main Library?">📚 Main Library</button>
            <button class="chip-btn" data-query="Explain photosynthesis simply, then give me a practice question.">🧠 Learn a topic</button>
            <button class="chip-btn" data-query="Make me a one-week study plan for mathematics and programming.">🗓️ Study plan</button>
            <button class="chip-btn" data-query="Help me debug this code and explain the fix.">💻 Coding help</button>
          </div>
        </div>

        <form class="input-bar" id="input-form">
          <input class="text-input" id="text-input" type="text" placeholder="Ask a question..." autocomplete="off" required />
          <button class="send-btn" id="send-btn" type="submit" aria-label="Send message">➤</button>
        </form>
      </div>
    `;
  }

  setupEventListeners() {
    const launcher = this.shadowRoot.getElementById('launcher-btn');
    const closeBtn = this.shadowRoot.getElementById('close-btn');
    const form = this.shadowRoot.getElementById('input-form');
    const input = this.shadowRoot.getElementById('text-input');
    const suggestions = this.shadowRoot.getElementById('suggestions-row');

    launcher.addEventListener('click', () => this.toggle(true));
    closeBtn.addEventListener('click', () => this.toggle(false));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = input.value.trim();
      if (val) {
        input.value = '';
        this.ask(val);
      }
    });

    if (suggestions) {
      suggestions.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip-btn');
        if (chip) {
          const query = chip.getAttribute('data-query');
          if (query) this.ask(query);
        }
      });
    }

    // Keyboard support: Escape closes the widget
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._isOpen) {
        this.toggle(false);
      }
    });
  }

  toggle(open) {
    this._isOpen = typeof open === 'boolean' ? open : !this._isOpen;
    if (this._isOpen) {
      this.setAttribute('open', '');
      const input = this.shadowRoot.getElementById('text-input');
      setTimeout(() => input && input.focus(), 150);
    } else {
      this.removeAttribute('open');
    }
  }

  open() {
    this.toggle(true);
  }

  close() {
    this.toggle(false);
  }

  async ask(message) {
    if (!message || this._isLoading) return;
    this._isLoading = true;

    // Append user message
    this._appendMessage(message, 'user');
    this._history.push({ role: 'user', text: message });

    // Show typing indicator
    const typingEl = this._showTyping();

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message,
          history: this._history
        })
      });

      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      typingEl.remove();

      const reply = data.reply || (response.ok ? 'Here is campus information for JKUAT.' : 'The campus assistant service is temporarily busy. Please retry.');
      this._appendMessage(reply, 'bot');
      this._history.push({ role: 'model', text: reply });
    } catch (err) {
      typingEl.remove();
      this._appendMessage('Unable to reach assistant service. Please check your connection or retry.', 'bot');
    } finally {
      this._isLoading = false;
    }
  }

  _appendMessage(text, sender) {
    const messagesArea = this.shadowRoot.getElementById('messages-area');
    const row = document.createElement('div');
    row.className = `msg-row msg-${sender}`;

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = text;

    row.appendChild(bubble);
    messagesArea.appendChild(row);
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }

  _showTyping() {
    const messagesArea = this.shadowRoot.getElementById('messages-area');
    const typing = document.createElement('div');
    typing.className = 'typing-indicator';
    typing.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    messagesArea.appendChild(typing);
    messagesArea.scrollTop = messagesArea.scrollHeight;
    return typing;
  }
}

if (!customElements.get('campus-ai-widget')) {
  customElements.define('campus-ai-widget', CampusAIWidget);
}

export default CampusAIWidget;
