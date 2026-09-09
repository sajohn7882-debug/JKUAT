class BuildingAssistant extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.opened = false;
    this.origin = { lat: -1.0914, lon: 37.0107, label: 'JKUAT Main Gate' };
    this.buildings = [
      ['JKUAT Main Library', 'Study and research', -1.0911, 37.0118],
      ['Science Complex (Computing)', 'Computing and science classes', -1.0898, 37.0126],
      ['COHES Building', 'Health sciences', -1.0935, 37.0142],
      ['Engineering Workshops', 'Engineering practical rooms', -1.0948, 37.0105],
      ['Administration Block', 'University administration', -1.0908, 37.0102],
      ['Main Auditorium', 'Lectures and events', -1.0906, 37.0110],
      ['Student Centre', 'Student services and activities', -1.0920, 37.0120],
      ['ICT Centre', 'ICT services and laboratories', -1.0896, 37.0115],
      ['JKUAT Health Centre', 'Medical services', -1.0927, 37.0128],
      ['JKUAT Hospital', 'Hospital and clinical services', -1.0930, 37.0135],
      ['Central Catering Unit', 'Meals and refreshments', -1.0917, 37.0109],
      ['University Bookshop', 'Books and stationery', -1.0909, 37.0114],
      ['School of Agriculture', 'Agriculture teaching and offices', -1.0928, 37.0106],
      ['School of Business', 'Business teaching and offices', -1.0902, 37.0110],
      ['School of Architecture', 'Architecture teaching and studios', -1.0899, 37.0103],
      ['Research and Innovation Centre', 'Research and innovation services', -1.0904, 37.0123],
      ['Students Hostels Area', 'Student accommodation', -1.0940, 37.0120],
      ['JKUAT Sports Grounds', 'Sports and recreation', -1.0950, 37.0128],
      ['JKUAT Main Gate', 'Campus entrance', -1.0914, 37.0107],
      ['Juja Gate', 'Campus entrance', -1.0902, 37.0098]
    ].map(([name, type, lat, lon]) => ({ name, type, lat, lon }));
  }

  connectedCallback() {
    this.render();
    this.shadowRoot.querySelector('#launcher').addEventListener('click', () => this.toggle(true));
    this.shadowRoot.querySelector('#close').addEventListener('click', () => this.toggle(false));
    this.shadowRoot.querySelector('#locate').addEventListener('click', () => this.locate());
    this.shadowRoot.querySelector('#form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.answer(this.shadowRoot.querySelector('#question').value);
    });
    this.shadowRoot.querySelector('#question').addEventListener('input', (event) => this.showSuggestions(event.target.value));
  }

  render() {
    this.shadowRoot.innerHTML = `<style>
      :host { position: fixed; right: 22px; bottom: 22px; z-index: 99999; font-family: Arial, sans-serif; color: #17324d; }
      * { box-sizing: border-box; }
      button, input { font: inherit; }
      #launcher { width: 56px; height: 56px; border: 2px solid #f4b942; border-radius: 50%; color: white; background: #0f2742; cursor: pointer; font-size: 23px; box-shadow: 0 8px 24px rgba(15,39,66,.35); }
      #launcher:hover { background: #075b67; transform: translateY(-2px); }
      #panel { display: none; width: min(380px, calc(100vw - 32px)); max-height: min(600px, calc(100vh - 40px)); overflow: auto; background: #fffdf8; border: 1px solid #d9e1dc; border-radius: 12px; box-shadow: 0 20px 48px rgba(15,39,66,.3); }
      :host([open]) #launcher { display: none; }
      :host([open]) #panel { display: block; }
      header { padding: 15px 16px; color: white; background: #0f2742; border-bottom: 3px solid #f4b942; display: flex; justify-content: space-between; align-items: center; }
      header strong { font-size: 15px; } header small { display: block; margin-top: 3px; color: #d8e3e6; font-size: 11px; }
      #close { width: 32px; height: 32px; border: 0; border-radius: 6px; color: white; background: transparent; cursor: pointer; font-size: 20px; }
      main { padding: 15px; } p { margin: 0 0 10px; color: #65798a; font-size: 13px; line-height: 1.45; }
      form { display: flex; gap: 6px; } input { min-width: 0; flex: 1; padding: 11px; border: 1px solid #d9e1dc; border-radius: 7px; color: #17324d; }
      form button, #locate { padding: 0 12px; border: 1px solid #087e8b; border-radius: 7px; color: white; background: #087e8b; cursor: pointer; font-weight: 700; }
      #locate { width: 100%; min-height: 38px; margin-top: 8px; }
      #answer { min-height: 70px; margin-top: 12px; padding: 11px; border-radius: 7px; color: #075b67; background: #eef6f3; font-size: 13px; line-height: 1.5; }
      #answer a { color: #075b67; font-weight: 700; } #suggestions { margin-top: 8px; color: #65798a; font-size: 12px; line-height: 1.6; }
      @media (max-width: 480px) { :host { right: 16px; bottom: 16px; } }
    </style>
    <button id="launcher" type="button" aria-label="Open building assistant" title="Building assistant">⌖</button>
    <section id="panel" role="dialog" aria-label="JKUAT Building Assistant">
      <header><div><strong>Building Assistant</strong><small>Coordinates and walking direction</small></div><button id="close" type="button" aria-label="Close">&times;</button></header>
      <main><p>Ask where a JKUAT building is, or type a name to get its coordinates and direction.</p><form id="form"><input id="question" type="search" required placeholder="Where is the library?"><button type="submit">Ask</button></form><button id="locate" type="button">Use my location as starting point</button><div id="suggestions"></div><div id="answer" role="status">Try “How do I get to the engineering workshops?”</div></main>
    </section>`;
  }

  toggle(value) { this.opened = typeof value === 'boolean' ? value : !this.opened; this.toggleAttribute('open', this.opened); if (this.opened) this.shadowRoot.querySelector('#question').focus(); }

  locate() {
    const answer = this.shadowRoot.querySelector('#answer');
    if (!navigator.geolocation) { answer.textContent = 'Location is not available. I am using the JKUAT Main Gate.'; return; }
    answer.textContent = 'Requesting your location...';
    navigator.geolocation.getCurrentPosition(({ coords }) => { this.origin = { lat: coords.latitude, lon: coords.longitude, label: 'your location' }; answer.textContent = 'Your location is ready. Ask for a building to get directions from here.'; }, () => { answer.textContent = 'Location permission was not granted. I am using the JKUAT Main Gate.'; });
  }

  showSuggestions(value) {
    const query = value.trim().toLowerCase();
    const matches = query ? this.buildings.filter((building) => `${building.name} ${building.type}`.toLowerCase().includes(query)).slice(0, 4) : [];
    this.shadowRoot.querySelector('#suggestions').innerHTML = matches.map((building) => `<button type="button" data-name="${building.name.replace(/"/g, '&quot;')}" style="border:0;background:transparent;color:#087e8b;cursor:pointer;padding:0 6px 0 0;">${building.name}</button>`).join('');
    this.shadowRoot.querySelectorAll('#suggestions button').forEach((button) => button.addEventListener('click', () => { this.shadowRoot.querySelector('#question').value = button.dataset.name; this.answer(button.dataset.name); }));
  }

  answer(question) {
    const query = question.toLowerCase();
    const building = this.buildings.find((item) => query.includes(item.name.toLowerCase())) || this.buildings.find((item) => item.name.toLowerCase().split(' ').some((word) => word.length > 4 && query.includes(word)));
    const answer = this.shadowRoot.querySelector('#answer');
    if (!building) { answer.textContent = 'I could not find that building. Try library, SCIT, hospital, engineering, hostel, auditorium, gate, or catering.'; return; }
    const distance = this.distance(this.origin, building);
    answer.innerHTML = `<strong>${building.name}</strong><br>${building.type}<br>Coordinates: ${building.lat.toFixed(5)}, ${building.lon.toFixed(5)}<br>From ${this.origin.label}: about ${distance < 1000 ? `${Math.round(distance)} metres` : `${(distance / 1000).toFixed(1)} km`} ${this.direction(this.origin, building)}.<br><a href="/jkuatmap.html">View on campus map</a>`;
  }

  distance(first, second) { const lat = (second.lat - first.lat) * Math.PI / 180; const lon = (second.lon - first.lon) * Math.PI / 180; const value = Math.sin(lat / 2) ** 2 + Math.cos(first.lat * Math.PI / 180) * Math.cos(second.lat * Math.PI / 180) * Math.sin(lon / 2) ** 2; return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)); }
  direction(first, second) { const angle = (Math.atan2(second.lon - first.lon, second.lat - first.lat) * 180 / Math.PI + 360) % 360; return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(angle / 45) % 8]; }
}

if (!customElements.get('building-assistant')) customElements.define('building-assistant', BuildingAssistant);
