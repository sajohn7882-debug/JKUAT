/**
 * JKUAT Wayfinder Chat Notification Component
 * Tracks unread chat messages, updates notification badges, and displays incoming message alerts.
 */

class ChatNotificationBell extends HTMLElement {
  constructor() {
    super();
    this._unreadCount = 0;
    this._recentUnread = [];
    this._isOpen = false;
    this._pollInterval = null;
    this._lastUnreadIds = new Set();
  }

  connectedCallback() {
    this.render();
    this.setupEvents();
    this.startPolling();
  }

  disconnectedCallback() {
    if (this._pollInterval) clearInterval(this._pollInterval);
  }

  render() {
    this.innerHTML = `
      <div class="chat-notif-wrapper" style="position: relative; display: inline-flex; align-items: center;">
        <button id="chat-notif-btn" type="button" class="chat-notif-btn" aria-label="Chat notifications" title="Chat notifications" style="
          position: relative;
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.25);
          color: #ffffff;
          width: 36px;
          height: 36px;
          min-width: 36px;
          min-height: 36px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 16px;
          transition: background 0.15s ease, transform 0.15s ease;
          padding: 0;
          margin: 0;
          outline: none;
        ">
          <span class="bell-icon" style="line-height: 1;">🔔</span>
          <span id="chat-notif-badge" class="chat-notif-badge" style="
            display: none;
            position: absolute;
            top: -4px;
            right: -4px;
            background: #ef4444;
            color: #ffffff;
            font-size: 11px;
            font-weight: bold;
            min-width: 18px;
            height: 18px;
            line-height: 18px;
            padding: 0 4px;
            border-radius: 9px;
            text-align: center;
            border: 2px solid #0f2742;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            animation: pulse 1.5s infinite;
          ">0</span>
        </button>

        <!-- Dropdown Notifications Menu -->
        <div id="chat-notif-popover" class="chat-notif-popover" style="
          display: none;
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          width: 290px;
          max-width: calc(100vw - 32px);
          background: #ffffff;
          border-radius: 12px;
          border: 1px solid #cbd5e1;
          box-shadow: 0 14px 34px rgba(15, 39, 66, 0.25);
          z-index: 10000;
          color: #17324d;
          font-family: Arial, sans-serif;
          overflow: hidden;
        ">
          <div style="padding: 10px 14px; background: #0f2742; color: #ffffff; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f4b942;">
            <strong style="font-size: 13px;">Chat Notifications</strong>
            <a href="chat.html" style="color: #f4b942; font-size: 11px; text-decoration: none; font-weight: bold;">Open Chat &rarr;</a>
          </div>
          <div id="chat-notif-list" style="max-height: 240px; overflow-y: auto; padding: 6px 0;">
            <div style="padding: 16px; text-align: center; font-size: 12.5px; color: #64748b;">No new messages</div>
          </div>
        </div>
      </div>
    `;
  }

  setupEvents() {
    const btn = this.querySelector('#chat-notif-btn');
    const popover = this.querySelector('#chat-notif-popover');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePopover();
    });

    document.addEventListener('click', (e) => {
      if (this._isOpen && !this.contains(e.target)) {
        this.closePopover();
      }
    });
  }

  togglePopover() {
    this._isOpen = !this._isOpen;
    const popover = this.querySelector('#chat-notif-popover');
    if (popover) {
      popover.style.display = this._isOpen ? 'block' : 'none';
      if (this._isOpen) this.renderList();
    }
  }

  closePopover() {
    this._isOpen = false;
    const popover = this.querySelector('#chat-notif-popover');
    if (popover) popover.style.display = 'none';
  }

  async checkUnread() {
    const token = localStorage.getItem('jkuatChatToken');
    const badge = this.querySelector('#chat-notif-badge');
    if (!token) {
      if (badge) badge.style.display = 'none';
      this._unreadCount = 0;
      this._recentUnread = [];
      return;
    }

    try {
      const res = await fetch('/api/chat/unread', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('jkuatChatToken');
        }
        return;
      }
      const text = await res.text();
      let data = {};
      try {
        data = JSON.parse(text);
      } catch {
        return;
      }
      const count = data.unread_total || 0;
      this._unreadCount = count;
      this._recentUnread = data.recent_unread || [];

      // Check if any new message arrived to notify
      const incoming = this._recentUnread.filter(m => !this._lastUnreadIds.has(m.id));
      if (incoming.length > 0 && this._lastUnreadIds.size > 0) {
        this.showToast(incoming[incoming.length - 1]);
        this.playChime();
      }

      // Update stored IDs
      this._lastUnreadIds = new Set(this._recentUnread.map(m => m.id));

      if (badge) {
        if (count > 0) {
          badge.textContent = count > 99 ? '99+' : count;
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
      }

      // Update any nav chat badge in DOM
      document.querySelectorAll('.nav-chat-badge').forEach(el => {
        if (count > 0) {
          el.textContent = count;
          el.style.display = 'inline-flex';
        } else {
          el.style.display = 'none';
        }
      });

      if (this._isOpen) {
        this.renderList();
      }
    } catch (err) {
      // ignore transient network errors
    }
  }

  renderList() {
    const list = this.querySelector('#chat-notif-list');
    if (!list) return;

    if (this._recentUnread.length === 0) {
      list.innerHTML = `<div style="padding: 16px; text-align: center; font-size: 12.5px; color: #64748b;">No new messages</div>`;
      return;
    }

    list.innerHTML = this._recentUnread.slice().reverse().map(m => `
      <a href="chat.html" style="
        display: block;
        padding: 10px 14px;
        text-decoration: none;
        color: #17324d;
        border-bottom: 1px solid #f1f5f9;
        transition: background 0.15s ease;
      " onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3px;">
          <strong style="font-size: 13px; color: #087e8b;">${this.escape(m.sender_name)}</strong>
          <span style="font-size: 10px; color: #94a3b8;">${new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div style="font-size: 12px; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${this.escape(m.text)}
        </div>
      </a>
    `).join('');
  }

  showToast(msg) {
    // Show a floating in-app banner toast
    let toastContainer = document.getElementById('chat-toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'chat-toast-container';
      toastContainer.style.cssText = 'position: fixed; top: 16px; right: 16px; z-index: 999999; display: flex; flex-direction: column; gap: 8px; pointer-events: none; max-width: 320px;';
      document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.style.cssText = 'pointer-events: auto; background: #0f2742; color: #ffffff; padding: 12px 16px; border-radius: 10px; border-left: 4px solid #f4b942; box-shadow: 0 10px 25px rgba(0,0,0,0.3); font-family: Arial, sans-serif; font-size: 13px; cursor: pointer; transition: transform 0.2s ease, opacity 0.2s ease;';
    toast.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
        <span style="font-weight: bold; color: #f4b942; font-size: 12px;">💬 New Message</span>
        <span style="font-size: 11px; color: #cbd5e1;">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div style="font-weight: 600; margin-bottom: 2px;">${this.escape(msg.sender_name)}</div>
      <div style="color: #e2e8f0; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escape(msg.text)}</div>
    `;

    toast.addEventListener('click', () => {
      window.location.href = 'chat.html';
    });

    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 250);
    }, 4500);
  }

  playChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {
      // ignore audio context restrictions
    }
  }

  startPolling() {
    this.checkUnread();
    this._pollInterval = setInterval(() => this.checkUnread(), 3500);
  }

  escape(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[c]);
  }
}

if (!customElements.get('chat-notification-bell')) {
  customElements.define('chat-notification-bell', ChatNotificationBell);
}

export default ChatNotificationBell;
