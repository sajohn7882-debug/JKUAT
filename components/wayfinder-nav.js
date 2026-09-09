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
      { href: '/expenses', label: 'Expenses', aliases: ['/expenses.html'] }
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
      nav.appendChild(a);
    });

    this.appendChild(nav);
  }
}

if (!customElements.get('wayfinder-nav')) {
  customElements.define('wayfinder-nav', WayfinderNav);
}

export default WayfinderNav;
