/**
 * Standardized JKUAT Wayfinder Navigation Web Component
 * Provides clean, responsive page switching across campus modules
 */
class WayfinderNav extends HTMLElement {
  connectedCallback() {
    const currentPath = window.location.pathname;
    const links = [
      { href: '/', label: 'Home', aliases: ['/index.html', '/home'] },
      { href: '/navigator', label: 'Navigator', aliases: ['/jkuat_navigator.html', '/jkuat_navigator'] },
      { href: '/map', label: 'Campus map', aliases: ['/jkuatmap.html', '/jkuatmap'] },
      { href: '/expenses', label: 'Expenses', aliases: ['/expenses.html'] },
      { href: '/chat', label: 'Chat', aliases: ['/chat.html'] }
    ];

    const nav = document.createElement('nav');
    nav.className = 'nav-links';
    nav.style.display = 'flex';
    nav.style.gap = '8px';
    nav.style.flexWrap = 'wrap';

    links.forEach(item => {
      const a = document.createElement('a');
      a.href = item.href;
      a.textContent = item.label;
      const isCurrent = currentPath === item.href || item.aliases.includes(currentPath);
      if (isCurrent) {
        a.setAttribute('aria-current', 'page');
      }
      if (item.href === '/chat') {
        const badge = document.createElement('span');
        badge.className = 'nav-chat-badge';
        badge.style.cssText = 'display: none; background: #ef4444; color: white; border-radius: 10px; font-size: 11px; padding: 1px 6px; font-weight: bold; margin-left: 4px;';
        badge.textContent = '0';
        a.appendChild(badge);
      }
      nav.appendChild(a);
    });

    const bell = document.createElement('chat-notification-bell');
    nav.appendChild(bell);

    this.appendChild(nav);
  }
}

if (!customElements.get('wayfinder-nav')) {
  customElements.define('wayfinder-nav', WayfinderNav);
}

export default WayfinderNav;
