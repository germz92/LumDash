(function() {
// ✅ Avoid redeclaration across scripts
window.token = window.token || localStorage.getItem('token');
const params = new URLSearchParams(window.location.search);
let tableId = params.get('id') || localStorage.getItem('eventId');
let isOwner = false;
let clockInterval = null; // Global clock interval for time modal
let isSummaryExpanded = true; // Track Event Summary collapse state

// Socket.IO real-time updates
if (window.socket) {
  // Listen for general info updates
  window.socket.on('generalChanged', (data) => {
    console.log('General info changed, checking if relevant...');
    // Only reload if it's for the current table
    if (data && data.tableId && data.tableId !== tableId) {
      console.log('Update was for a different table, ignoring');
      return;
    }
    console.log('Reloading general info for current table');
    initPage(tableId);
  });
  
  // Also listen for general table updates
  window.socket.on('tableUpdated', (data) => {
    console.log('Table updated, checking if relevant...');
    // Only reload if it's for the current table
    if (data && data.tableId && data.tableId !== tableId) {
      console.log('Update was for a different table, ignoring');
      return;
    }
    console.log('Reloading general info for current table');
    initPage(tableId);
  });
}

// Function to get appropriate weather icon based on text description
function getWeatherIcon(weatherText) {
  if (!weatherText) return 'cloud'; // Default Material Symbol
  
  const text = weatherText.toLowerCase();
  
  // Check for various weather conditions - return Material Symbol names
  if (text.includes('sunny') || text.includes('clear')) return 'clear_day';
  if (text.includes('partly cloudy') || text.includes('partly sunny')) return 'partly_cloudy_day';
  if (text.includes('cloudy') || text.includes('overcast')) return 'cloudy';
  if (text.includes('rain') || text.includes('shower')) return 'rainy';
  if (text.includes('storm') || text.includes('thunder') || text.includes('lightning')) return 'thunderstorm';
  if (text.includes('snow') || text.includes('flurrie')) return 'weather_snowy';
  if (text.includes('fog') || text.includes('mist')) return 'foggy';
  if (text.includes('wind') || text.includes('breez')) return 'air';
  if (text.includes('hot') || text.includes('heat')) return 'local_fire_department';
  if (text.includes('cold') || text.includes('freez')) return 'ac_unit';
  if (text.includes('tornado') || text.includes('hurricane')) return 'cyclone';
  
  return 'cloud'; // Default Material Symbol
}

// OpenWeather returns no match for "City, ST". It does match "City,ST,US".
function toWeatherQuery(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const parts = text.split(',').map(part => part.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 1; i--) {
    const code = parts[i].replace(/\./g, '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(code) || code === 'US') continue;
    return `${parts[i - 1]},${code},US`;
  }
  return text;
}

// Function to update the weather label icon based on current weather text
async function fetchWeatherForEvent(city, startDate, endDate, fallbackQuery) {
  city = toWeatherQuery(city);
  fallbackQuery = toWeatherQuery(fallbackQuery);
  const forecastEl = document.getElementById('weatherForecast');
  const conditionEl = document.getElementById('weatherCondition');

  if (!forecastEl || !city) {
    renderWeatherPlaceholder('No city set');
    return;
  }

  forecastEl.innerHTML = `
    <div class="weather-loading">
      <span class="material-symbols-outlined spinning">sync</span>
      <span>Loading weather...</span>
    </div>
  `;
  if (conditionEl) conditionEl.textContent = 'Loading...';

  try {
    const forecastRes = await fetch(`${API_BASE}/api/weather/forecast?q=${encodeURIComponent(city)}`, {
      headers: { Authorization: window.token }
    });
    const forecastData = await forecastRes.json().catch(() => ({}));

    if (forecastRes.status === 404) {
      const fallback = String(fallbackQuery || '').trim();
      if (fallback && fallback.toLowerCase() !== String(city || '').trim().toLowerCase()) {
        return fetchWeatherForEvent(fallback, startDate, endDate);
      }
      renderWeatherPlaceholder('City not found');
      return;
    }
    if (!forecastRes.ok || !forecastData.list) {
      renderWeatherPlaceholder('Weather unavailable');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let eventStartDate = null;
    let eventEndDate = null;

    try {
      if (startDate && String(startDate).trim()) {
        const startStr = String(startDate).includes('T') ? String(startDate).split('T')[0] : String(startDate);
        eventStartDate = new Date(startStr + 'T00:00:00');
        if (isNaN(eventStartDate.getTime())) eventStartDate = null;
      }
      if (endDate && String(endDate).trim()) {
        const endStr = String(endDate).includes('T') ? String(endDate).split('T')[0] : String(endDate);
        eventEndDate = new Date(endStr + 'T23:59:59');
        if (isNaN(eventEndDate.getTime())) eventEndDate = null;
      }
      if (eventStartDate && !eventEndDate) {
        eventEndDate = new Date(eventStartDate);
        eventEndDate.setHours(23, 59, 59);
      }
    } catch (e) {
      console.warn('Error parsing event dates for weather:', e);
    }

    if (eventEndDate && eventEndDate < today) {
      renderWeatherPlaceholder('Event has passed');
      return;
    }

    const forecastLimit = new Date(today);
    forecastLimit.setDate(forecastLimit.getDate() + 5);

    if (eventStartDate && eventStartDate > forecastLimit) {
      const daysUntilEvent = Math.ceil((eventStartDate - today) / (1000 * 60 * 60 * 24));
      const daysUntilAvailable = daysUntilEvent - 5;
      if (daysUntilAvailable === 1) {
        renderWeatherPlaceholder('Available tomorrow');
        return;
      }
      if (daysUntilAvailable > 1) {
        renderWeatherPlaceholder(`Available in ${daysUntilAvailable} days`);
        return;
      }
    }

    const dailyForecasts = processForecastData(forecastData.list, startDate, endDate);
    if (dailyForecasts.length === 0) {
      if (!eventStartDate) {
        renderWeatherForecast(processForecastData(forecastData.list, null, null), conditionEl);
        return;
      }
      renderWeatherPlaceholder('No forecast for event dates');
      return;
    }

    renderWeatherForecast(dailyForecasts, conditionEl);
  } catch (err) {
    console.error('Weather fetch error:', err);
    renderWeatherPlaceholder('Weather unavailable');
  }
}

function processForecastData(forecastList, eventStart, eventEnd) {
  const dailyData = {};
  let eventStartKey = null;
  let eventEndKey = null;

  try {
    if (eventStart && String(eventStart).trim()) {
      const startStr = String(eventStart).includes('T') ? String(eventStart).split('T')[0] : String(eventStart);
      const parsed = new Date(startStr + 'T00:00:00');
      if (!isNaN(parsed.getTime())) eventStartKey = startStr;
    }
    if (eventEnd && String(eventEnd).trim()) {
      const endStr = String(eventEnd).includes('T') ? String(eventEnd).split('T')[0] : String(eventEnd);
      const parsed = new Date(endStr + 'T23:59:59');
      if (!isNaN(parsed.getTime())) eventEndKey = endStr;
    }
    if (eventStartKey && !eventEndKey) eventEndKey = eventStartKey;
  } catch (e) {
    console.warn('Error parsing event dates:', e);
  }

  forecastList.forEach(item => {
    const date = new Date(item.dt * 1000);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (!dailyData[dateKey]) {
      dailyData[dateKey] = { date, dateKey, temps: [], icons: [], descriptions: [] };
    }
    dailyData[dateKey].temps.push(item.main.temp);
    dailyData[dateKey].icons.push(item.weather[0].icon);
    dailyData[dateKey].descriptions.push(item.weather[0].main);
  });

  let days = Object.keys(dailyData).sort().map(key => {
    const day = dailyData[key];
    return {
      date: day.date,
      dateKey: day.dateKey,
      high: Math.round(Math.max(...day.temps)),
      low: Math.round(Math.min(...day.temps)),
      icon: getMostCommon(day.icons),
      description: getMostCommon(day.descriptions)
    };
  });

  if (eventStartKey && eventEndKey) {
    days = days.filter(day => day.dateKey >= eventStartKey && day.dateKey <= eventEndKey);
  }

  return days.slice(0, 5);
}

function getMostCommon(arr) {
  const counts = {};
  arr.forEach(item => { counts[item] = (counts[item] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function getWeatherEmoji(iconCode) {
  const iconMap = {
    '01d': '☀️', '01n': '🌙',
    '02d': '⛅', '02n': '☁️',
    '03d': '☁️', '03n': '☁️',
    '04d': '☁️', '04n': '☁️',
    '09d': '🌧️', '09n': '🌧️',
    '10d': '🌦️', '10n': '🌧️',
    '11d': '⛈️', '11n': '⛈️',
    '13d': '❄️', '13n': '❄️',
    '50d': '🌫️', '50n': '🌫️'
  };
  return iconMap[iconCode] || '🌤️';
}

function formatDayName(date) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${date.getDate()}`;
}

function renderWeatherForecast(days, conditionEl) {
  const forecastEl = document.getElementById('weatherForecast');
  if (!forecastEl) return;
  if (!days.length) {
    renderWeatherPlaceholder('No forecast available');
    return;
  }

  forecastEl.innerHTML = days.map(day => `
    <div class="weather-day">
      <div class="weather-day-name">${formatDayName(day.date)}</div>
      <div class="weather-icon">${getWeatherEmoji(day.icon)}</div>
      <div class="weather-temp"><span class="high">${day.high}°</span><span class="low">${day.low}°</span></div>
    </div>
  `).join('');

  if (conditionEl && days[0]) conditionEl.textContent = days[0].description;
}

function renderWeatherPlaceholder(message) {
  const forecastEl = document.getElementById('weatherForecast');
  const conditionEl = document.getElementById('weatherCondition');
  if (forecastEl) {
    forecastEl.innerHTML = `
      <div class="weather-placeholder">
        <span class="material-symbols-outlined">cloud_off</span>
        <span>${message}</span>
      </div>
    `;
  }
  if (conditionEl) conditionEl.textContent = '';
}

function updateWeatherIcon() {
  const weatherLabel = document.querySelector('label[for="weather"]');
  if (!weatherLabel) return;
  
  const weatherEl = document.getElementById('weather');
  const weatherText = weatherEl?.tagName === 'TEXTAREA' 
    ? weatherEl.value.trim() 
    : weatherEl?.textContent.trim() || '';
  
  const iconName = getWeatherIcon(weatherText);
  // Ensure the label starts with the icon span, then text
  weatherLabel.innerHTML = `<span class="material-symbols-outlined">${iconName}</span> Weather`;
}

// Toggle Event Summary expand/collapse
window.toggleEventSummary = function() {
  isSummaryExpanded = !isSummaryExpanded;
  const summaryContent = document.getElementById('summaryContent');
  const toggleIcon = document.getElementById('summaryToggleIcon');
  
  if (isSummaryExpanded) {
    summaryContent.style.maxHeight = summaryContent.scrollHeight + 'px';
    summaryContent.style.opacity = '1';
    summaryContent.style.overflow = 'visible';
    toggleIcon.style.transform = 'rotate(0deg)';
  } else {
    summaryContent.style.maxHeight = '0';
    summaryContent.style.opacity = '0';
    summaryContent.style.overflow = 'hidden';
    toggleIcon.style.transform = 'rotate(-90deg)';
  }
};

function getUserIdFromToken() {
  try {
    const token = window.token;
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id;
  } catch {
    return null;
  }
}

function mapsLinkForAddress(value) {
  const query = encodeURIComponent(value);
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    return { href: `maps://?q=${query}`, externalApp: true };
  }
  if (/Android/i.test(ua)) {
    // geo: hands the address to the device maps app. An https Maps URL
    // opened in a new tab is dropped by Android Chrome and installed PWAs.
    return { href: `geo:0,0?q=${query}`, externalApp: true };
  }
  return { href: `https://www.google.com/maps/search/?api=1&query=${query}`, externalApp: false };
}

function openMapsForAddress(value) {
  const maps = mapsLinkForAddress(value);
  if (maps.externalApp) {
    window.location.href = maps.href;
  } else {
    window.open(maps.href, '_blank', 'noopener');
  }
}

function createLinkedTextarea(value, type) {
  const textarea = document.createElement('textarea');
  textarea.value = value || '';
  textarea.placeholder = type.charAt(0).toUpperCase() + type.slice(1);
  textarea.addEventListener('input', () => autoResizeTextarea(textarea));
  autoResizeTextarea(textarea);
  textarea.addEventListener('dblclick', () => {
    const val = textarea.value.trim();
    if (!val) return;
    if (type === 'email') {
      window.location.href = `mailto:${val}`;
    }
    else if (type === 'phone') {
      window.location.href = `tel:${val}`;
    }
    else if (type === 'address') {
      openMapsForAddress(val);
    }
  });
  return textarea;
}

function createLinkHTML(value, type) {
  if (!value) return '<div>(empty)</div>';
  value = value.trim();
  let href = '#';
  let externalApp = false;
  
  if (type === 'email') {
    href = `mailto:${value}`;
    externalApp = true;
  } 
  else if (type === 'phone' || type === 'number') {
    href = `tel:${value}`;
    externalApp = true;
  } 
  else if (type === 'address') {
    const maps = mapsLinkForAddress(value);
    href = maps.href;
    externalApp = maps.externalApp;
  }
  else {
    return `<div>${value}</div>`;
  }
  
  const target = externalApp ? '' : ' target="_blank" rel="noopener noreferrer"';
  return `<a href="${href}"${target} style="color: #1976d2; text-decoration: underline;">${value}</a>`;
}

// Enhanced linkifyText function that preserves HTML formatting
function linkifyText(text) {
  if (!text) return '';
  
  // Handle markdown-style custom links first: [Custom Name](URL)
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  text = text.replace(markdownLinkRegex, (match, linkText, url) => {
    let href = url.trim();
    
    // Add protocol if missing
    if (!href.match(/^https?:\/\//)) {
      href = 'https://' + href;
    }
    
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color: #1976d2; text-decoration: underline;" onclick="window.open('${href}', '_blank'); return false;">${linkText}</a>`;
  });
  
  // Then handle regular URLs (but skip ones already inside <a> tags from markdown processing)
  const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\/[^\s<]*)?)/g;
  
  // Replace URLs with clickable links, but only if they're not already inside <a> tags
  text = text.replace(urlRegex, (url) => {
    // Check if this URL is already inside an <a> tag
    const beforeUrl = text.substring(0, text.indexOf(url));
    const lastATag = beforeUrl.lastIndexOf('<a ');
    const lastCloseATag = beforeUrl.lastIndexOf('</a>');
    
    // If we're inside an <a> tag, don't linkify
    if (lastATag > lastCloseATag) {
      return url;
    }
    
    let href = url;
    
    // Add protocol if missing
    if (!url.match(/^https?:\/\//)) {
      href = 'https://' + url;
    }
    
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color: #1976d2; text-decoration: underline;" onclick="window.open('${href}', '_blank'); return false;">${url}</a>`;
  });
  
  return text;
}

// Function to convert HTML to plain text for editing
function htmlToPlainText(html) {
  if (!html) return '';
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  return tempDiv.textContent || tempDiv.innerText || '';
}

// TinyMCE editor instance
let summaryEditor = null;

// Load TinyMCE dynamically
function loadTinyMCE() {
  return new Promise((resolve, reject) => {
    if (window.tinymce) {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    // Use API key from config file, fallback to no-api-key for development
    const apiKey = window.TINYMCE_API_KEY || 'no-api-key';
    
    // For development/testing, you can temporarily use no-api-key
    // const apiKey = 'no-api-key'; // Uncomment this line for development
    
    script.src = `https://cdn.tiny.cloud/1/${apiKey}/tinymce/6/tinymce.min.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load TinyMCE'));
    document.head.appendChild(script);
  });
}

// Initialize TinyMCE editor
async function initializeTinyMCE(initialContent = '') {
  try {
    await loadTinyMCE();
    
    // Remove any existing editor first
    if (summaryEditor) {
      summaryEditor.remove();
      summaryEditor = null;
    }
    
    // Initialize TinyMCE
    await tinymce.init({
      selector: '#summaryEditor',
      height: 300,
      menubar: false,
      toolbar: 'bold italic | bullist numlist | link unlink | removeformat',
      plugins: 'lists link',
      branding: false,
      content_style: `
        body {
          font-family: 'Roboto', Arial, sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: #333;
          padding: 10px;
          margin: 0;
        }
        p { margin: 0 0 10px 0; }
        ul, ol { margin: 0 0 10px 0; padding-left: 1.25em; list-style: disc; }
        li { margin: 0 0 4px 0; }
      `,
      setup: function(editor) {
        editor.on('init', function() {
          console.log('TinyMCE initialized successfully');
          editor.setContent(initialContent);
        });
      }
    });
    
    // Get the editor instance
    summaryEditor = tinymce.get('summaryEditor');
    
    if (summaryEditor) {
      summaryEditor.setContent(initialContent);
      console.log('TinyMCE editor ready with content');
    }
    
  } catch (error) {
    console.error('Error initializing TinyMCE:', error);
    throw error;
  }
}

// Get content from TinyMCE editor
function getTinyMCEContent() {
  if (summaryEditor) {
    return summaryEditor.getContent();
  }
  return '';
}

// Set content in TinyMCE editor
function setTinyMCEContent(content) {
  if (summaryEditor) {
    summaryEditor.setContent(content || '');
  }
}

const COVERAGE_BY_ROLE = {
  'Lead Photographer': 'Event Photography',
  'Additional Photographer': 'Event Photography',
  'Lead Videographer': 'Event Videography',
  'Additional Videographer': 'Event Videography',
  'Headshot Booth Photographer': 'Headshot Booth'
};
const COVERAGE_ORDER = ['Event Photography', 'Event Videography', 'Headshot Booth'];

function formatCoverageDate(dateStr) {
  const iso = String(dateStr || '').split('T')[0];
  const parts = iso.split('-').map(Number);
  if (parts.length < 3 || parts.some(part => !part)) return iso;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function coverageMinutes(timeStr) {
  if (!timeStr || !String(timeStr).includes(':')) return null;
  const [hour, minute] = String(timeStr).split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return hour * 60 + minute;
}

function formatCoverageClock(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? 'pm' : 'am';
  const adjusted = hour % 12 || 12;
  if (minute === 0) return `${adjusted}${suffix}`;
  return `${adjusted}:${String(minute).padStart(2, '0')}${suffix}`;
}

function coverageHtmlFromRows(rows) {
  const byDate = new Map();
  (rows || []).forEach(row => {
    if (!row || !row.date || !row.role || row.role === '__placeholder__') return;
    const label = COVERAGE_BY_ROLE[row.role];
    if (!label) return;
    const key = String(row.date).split('T')[0];
    if (!byDate.has(key)) byDate.set(key, new Map());
    const labels = byDate.get(key);
    if (!labels.has(label)) labels.set(label, { start: null, end: null });
    const span = labels.get(label);
    const start = coverageMinutes(row.startTime);
    const end = coverageMinutes(row.endTime);
    if (start == null || end == null) return;
    if (span.start == null || start < span.start) span.start = start;
    if (span.end == null || end > span.end) span.end = end;
  });

  const days = [...byDate.keys()].sort();
  return days.map(day => {
    const labels = byDate.get(day);
    const items = COVERAGE_ORDER.filter(label => labels.has(label)).map(label => {
      const span = labels.get(label);
      if (span.start == null || span.end == null) return label;
      return `${label} (${formatCoverageClock(span.start)}-${formatCoverageClock(span.end)})`;
    });
    const list = `<ul>${items.map(label => `<li>${escapeHtmlText(label)}</li>`).join('')}</ul>`;
    return `<p><strong>${escapeHtmlText(formatCoverageDate(day))}</strong></p>${list}`;
  }).join('');
}

async function populateCoverageFromCrew() {
  const currentTableId = params.get('id') || localStorage.getItem('eventId');
  if (!currentTableId) return;

  const fallback = document.getElementById('summaryFallback');
  const existing = summaryEditor
    ? summaryEditor.getContent({ format: 'text' }).trim()
    : (fallback?.value || '').trim();
  if (existing && !confirm('Replace the event summary with coverage from the crew list?')) return;

  try {
    const res = await fetch(`${API_BASE}/api/tables/${currentTableId}`, {
      headers: { Authorization: window.token }
    });
    if (!res.ok) throw new Error('Could not load the crew list');
    const table = await res.json();
    const html = coverageHtmlFromRows(table.rows);
    if (!html) {
      alert('No photography, videography, or headshot booth days are on the crew list.');
      return;
    }
    if (summaryEditor) setTinyMCEContent(html);
    else if (fallback) fallback.value = htmlToPlainText(html);
  } catch (err) {
    console.error(err);
    alert('Could not build coverage from the crew list.');
  }
}

// Clean up TinyMCE editor
function cleanupTinyMCE() {
  if (summaryEditor) {
    summaryEditor.remove();
    summaryEditor = null;
  }
}

function renderContactRow(data = {}, readOnly = false) {
  const tbody = document.getElementById('contactRows');
  const row = document.createElement('tr');
  row.className = 'general-data-row';
  const fields = ['name', 'number', 'email', 'role'];
  const labels = { name: 'Name', number: 'Phone', email: 'Email', role: 'Role' };

  fields.forEach(type => {
    const td = document.createElement('td');
    td.dataset.label = labels[type];
    td.dataset.field = type;
    if (readOnly) td.innerHTML = createLinkHTML(data[type], type);
    else td.appendChild(createLinkedTextarea(data[type], type));
    row.appendChild(td);
  });

  // Only add action column when not in read-only mode
  if (!readOnly) {
    const deleteTd = document.createElement('td');
    deleteTd.className = 'general-row-actions';
    const btn = document.createElement('button');
    btn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
    btn.onclick = () => row.remove();
    deleteTd.appendChild(btn);
    row.appendChild(deleteTd);
  }
  
  tbody.appendChild(row);
}

function renderLocationRow(data = {}, readOnly = false) {
  const tbody = document.getElementById('locationsRows');
  const row = document.createElement('tr');
  row.className = 'general-data-row';
  const fields = ['name', 'address', 'event'];
  const labels = { name: 'Name', address: 'Address', event: 'Event' };

  fields.forEach(type => {
    const td = document.createElement('td');
    td.dataset.label = labels[type];
    if (readOnly) td.innerHTML = createLinkHTML(data[type], type);
    else td.appendChild(createLinkedTextarea(data[type], type));
    row.appendChild(td);
  });

  // Only add action column when not in read-only mode
  if (!readOnly) {
    const deleteTd = document.createElement('td');
    deleteTd.className = 'general-row-actions';
    const btn = document.createElement('button');
    btn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
    btn.onclick = () => row.remove();
    deleteTd.appendChild(btn);
    row.appendChild(deleteTd);
  }
  
  tbody.appendChild(row);
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

document.addEventListener('input', e => {
  if (e.target.tagName.toLowerCase() === 'textarea') autoResizeTextarea(e.target);
});

function collectContacts() {
  return [...document.querySelectorAll("#contactRows tr")].map(row => {
    const inputs = row.querySelectorAll("textarea");
    if (inputs.length) {
    return {
      name: inputs[0]?.value.trim(),
      number: inputs[1]?.value.trim(),
      email: inputs[2]?.value.trim(),
      role: inputs[3]?.value.trim()
    };
    } else {
      // Fallback to text content in view mode
      const cells = row.querySelectorAll("td");
      return {
        name: cells[0]?.textContent.trim(),
        number: cells[1]?.textContent.trim(),
        email: cells[2]?.textContent.trim(),
        role: cells[3]?.textContent.trim()
      };
    }
  });
}

function collectLocations() {
  return [...document.querySelectorAll("#locationsRows tr")].map(row => {
    const inputs = row.querySelectorAll("textarea");
    if (inputs.length) {
    return {
      name: inputs[0]?.value.trim(),
      address: inputs[1]?.value.trim(),
      event: inputs[2]?.value.trim()
    };
    } else {
      // Fallback to text content in view mode
      const cells = row.querySelectorAll("td");
      return {
        name: cells[0]?.textContent.trim(),
        address: cells[1]?.textContent.trim(),
        event: cells[2]?.textContent.trim()
      };
    }
  });
}

let projectManagerUsers = [];
let projectManagerEditing = false;

function escapeHtmlText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function projectManagerId(value) {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || '');
  return String(value);
}

function formatEventDate(value) {
  if (!value) return '—';
  const parts = String(value).split('T')[0].split('-');
  if (parts.length !== 3) return value;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function setDateField(id, value) {
  const input = document.getElementById(id);
  const display = document.getElementById(id + 'Display');
  const iso = value ? String(value).split('T')[0] : '';
  if (input) input.value = iso;
  if (display) display.textContent = formatEventDate(iso);
}

function showDateEditors() {
  ['start', 'end'].forEach(id => {
    const input = document.getElementById(id);
    const display = document.getElementById(id + 'Display');
    if (input) input.hidden = false;
    if (display) display.hidden = true;
  });
}

function galleryHref(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
}

function renderEventAccess(general = {}) {
  const values = {
    wifiNetwork: String(general.wifiNetwork || general.wifi || '').trim(),
    wifiPassword: String(general.wifiPassword || '').trim(),
    liveGallery: String(general.liveGallery || '').trim(),
    loveGalleryPasscode: String(general.loveGalleryPasscode || '').trim()
  };

  Object.entries(values).forEach(([id, value]) => {
    const view = document.getElementById(id);
    const input = document.getElementById(id + 'Input');
    if (view) {
      view.dataset.value = value;
      if (id === 'liveGallery') {
        if (value) view.href = galleryHref(value);
        else view.removeAttribute('href');
        view.hidden = !value;
        const editor = document.getElementById('liveGalleryEditor');
        if (editor) editor.hidden = true;
      } else {
        view.textContent = value;
        view.hidden = !value;
      }
    }
    if (input) input.value = value;
  });

  const wifiIcon = document.getElementById('wifiIcon');
  const view = document.getElementById('eventAccessView');
  const edit = document.getElementById('eventAccessEdit');
  const block = document.getElementById('eventAccess');
  const hasWifi = !!(values.wifiNetwork || values.wifiPassword);
  const hasAny = hasWifi || !!values.liveGallery || !!values.loveGalleryPasscode;
  if (wifiIcon) wifiIcon.hidden = !hasWifi;
  if (edit) edit.hidden = true;
  if (view) view.hidden = !hasAny;
  if (block) block.hidden = !hasAny;
}

function showEventAccessEditors() {
  ['wifiNetwork', 'wifiPassword', 'liveGallery', 'loveGalleryPasscode'].forEach(id => {
    const view = document.getElementById(id);
    const input = document.getElementById(id + 'Input');
    if (input) input.value = view?.dataset.value || '';
    if (view) view.hidden = true;
  });
  const wifiIcon = document.getElementById('wifiIcon');
  const saved = document.getElementById('eventAccessView');
  const edit = document.getElementById('eventAccessEdit');
  const block = document.getElementById('eventAccess');
  if (wifiIcon) wifiIcon.hidden = true;
  if (saved) saved.hidden = true;
  if (edit) edit.hidden = false;
  if (block) block.hidden = false;
}

function eventAccessValue(id) {
  const input = document.getElementById(id + 'Input');
  if (input && !input.hidden) return input.value.trim();
  return document.getElementById(id)?.dataset.value || '';
}

async function setupProjectManager(selected) {
  const select = document.getElementById('projectManager');
  const view = document.getElementById('projectManagerView');
  if (!select || !view) return;

  const selectedId = projectManagerId(selected);

  try {
    const res = await fetch(`${API_BASE}/api/users`, {
      headers: { Authorization: window.token }
    });
    projectManagerUsers = res.ok ? await res.json() : [];
  } catch (err) {
    console.error('Could not load users for project manager:', err);
    projectManagerUsers = [];
  }

  select.innerHTML = `<option value="">Not assigned</option>` + projectManagerUsers.map(user =>
    `<option value="${escapeHtmlText(user._id)}">${escapeHtmlText(user.name)}</option>`
  ).join('');
  const current = projectManagerUsers.find(user => String(user._id) === selectedId);
  select.value = current ? selectedId : '';
  select.dataset.saved = select.value;
  select.onchange = () => saveProjectManager(select.value);

  view.textContent = current ? current.name : 'Not assigned';
  view.disabled = !current;
  view.onclick = () => {
    if (current) openProjectManagerContact(current);
  };

  applyProjectManagerMode();

  const modal = document.getElementById('projectManagerModal');
  const closeBtn = document.getElementById('closeProjectManagerModal');
  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound = '1';
    closeBtn.onclick = closeProjectManagerContact;
    if (modal) {
      modal.onclick = (event) => {
        if (event.target === modal) closeProjectManagerContact();
      };
    }
  }
}

function applyProjectManagerMode() {
  const select = document.getElementById('projectManager');
  const view = document.getElementById('projectManagerView');
  if (!select || !view) return;
  const showDropdown = projectManagerEditing && (isOwner || isAdmin());
  select.hidden = !showDropdown;
  view.hidden = showDropdown;
}

async function saveProjectManager(userId) {
  if (!(isOwner || isAdmin())) return;
  const select = document.getElementById('projectManager');
  const currentTableId = params.get('id') || localStorage.getItem('eventId');
  if (!currentTableId) return;

  try {
    const res = await fetch(`${API_BASE}/api/tables/${currentTableId}/general`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: window.token
      },
      body: JSON.stringify({ general: { projectManager: userId || null } })
    });
    if (!res.ok) throw new Error('Could not save the project manager');
    if (select) select.dataset.saved = userId || '';
  } catch (err) {
    console.error(err);
    if (select) select.value = select.dataset.saved || '';
    alert('Could not save the project manager.');
  }
}

function openProjectManagerContact(user) {
  const modal = document.getElementById('projectManagerModal');
  const nameEl = document.getElementById('pmContactName');
  const phoneEl = document.getElementById('pmContactPhone');
  const emailEl = document.getElementById('pmContactEmail');
  if (!modal || !nameEl || !phoneEl || !emailEl) return;

  nameEl.textContent = user.name || '';
  const phone = String(user.phone || '').trim();
  const email = String(user.email || '').trim();
  phoneEl.textContent = phone || 'No phone number';
  if (phone) phoneEl.href = `tel:${phone.replace(/[^\d+]/g, '')}`;
  else phoneEl.removeAttribute('href');
  emailEl.textContent = email || 'No email';
  if (email) emailEl.href = `mailto:${email}`;
  else emailEl.removeAttribute('href');

  modal.hidden = false;
}

function closeProjectManagerContact() {
  const modal = document.getElementById('projectManagerModal');
  if (modal) modal.hidden = true;
}

function isAdmin() {
  try {
    const token = window.token;
    if (!token) return false;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

function insertAdminNotesBtn(tableId) {
  const container = document.getElementById('adminNotesBtnContainer');
  if (!container) return;
  container.innerHTML = '';
  
  if (isAdmin() || isOwner) {
    const btn = document.createElement('button');
    btn.textContent = 'Notes';
    btn.className = 'admin-notes-btn';
    btn.onclick = () => {
      window.location.href = `/pages/notes.html?id=${tableId}`;
    };
    container.appendChild(btn);
  }
  
  // Add QR Code button for all users
  const qrBtn = document.createElement('button');
  qrBtn.innerHTML = '<span class="material-symbols-outlined">qr_code</span>';
  qrBtn.className = 'qr-code-btn general-toolbar-icon-btn';
  qrBtn.title = 'QR Code';
  qrBtn.onclick = () => {
    showQRCodeModal();
  };
  container.appendChild(qrBtn);

  // Add Task icon button for owners, styled like folder icon, to the right
  if (isOwner) {
    const taskBtn = document.createElement('button');
    taskBtn.innerHTML = '<span class="material-symbols-outlined">task_alt</span>';
    taskBtn.className = 'task-logs-btn general-toolbar-icon-btn';
    taskBtn.title = 'To-Do List';
    taskBtn.onclick = () => {
      window.location.href = `/pages/tasks.html?id=${tableId}`;
    };
    container.appendChild(taskBtn);
  }
}

function showQRCodeModal() {
  // Create modal overlay
  const modal = document.createElement('div');
  modal.id = 'qrCodeModal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    cursor: pointer;
  `;

  // Create QR code container
  const qrContainer = document.createElement('div');
  qrContainer.style.cssText = `
    background: white;
    border-radius: 16px;
    padding: 20px;
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  `;

  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '×';
  closeBtn.style.cssText = `
    position: absolute;
    top: 10px;
    right: 15px;
    background: none;
    border: none;
    font-size: 30px;
    color: #666;
    cursor: pointer;
    padding: 0;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    closeQRCodeModal();
  };

  // Create QR code image
  const qrImage = document.createElement('img');
  qrImage.src = '../assets/qr-code.png'; // QR code that links to https://www.lumtags.com/#/attendee
  qrImage.alt = 'QR Code for LumTags Attendee';
  qrImage.style.cssText = `
    max-width: 100%;
    max-height: 60vh;
    width: auto;
    height: auto;
    border-radius: 8px;
    cursor: pointer;
  `;
  
  // Make QR code clickable to open the link
  qrImage.onclick = (e) => {
    e.stopPropagation();
    window.open('https://www.lumtags.com/#/attendee', '_blank');
  };

  // Create title
  const title = document.createElement('h3');
  title.textContent = 'LumTags Attendee Portal';
  title.style.cssText = `
    margin: 0 0 15px 0;
    color: #333;
    font-size: 24px;
    text-align: center;
  `;

  // Create subtitle with link
  const subtitle = document.createElement('p');
  subtitle.innerHTML = 'Scan QR code or <a href="https://www.lumtags.com/#/attendee" target="_blank" style="color: #CC0007; text-decoration: none; font-weight: bold;">click here</a> to access the attendee portal';
  subtitle.style.cssText = `
    margin: 0 0 20px 0;
    color: #666;
    font-size: 16px;
    text-align: center;
    max-width: 300px;
  `;

  // Create URL display
  const urlDisplay = document.createElement('div');
  urlDisplay.textContent = 'www.lumtags.com/#/attendee';
  urlDisplay.style.cssText = `
    margin: 15px 0 0 0;
    color: #888;
    font-size: 14px;
    text-align: center;
    font-family: monospace;
    background: #f5f5f5;
    padding: 8px 12px;
    border-radius: 4px;
    user-select: all;
  `;

  // Add elements to container
  qrContainer.appendChild(closeBtn);
  qrContainer.appendChild(title);
  qrContainer.appendChild(subtitle);
  qrContainer.appendChild(qrImage);
  qrContainer.appendChild(urlDisplay);

  // Add container to modal
  modal.appendChild(qrContainer);

  // Add modal to document
  document.body.appendChild(modal);

  // Close modal when clicking outside
  modal.onclick = (e) => {
    if (e.target === modal) {
      closeQRCodeModal();
    }
  };

  // Prevent scrolling when modal is open
  document.body.style.overflow = 'hidden';

  // Handle image load error
  qrImage.onerror = () => {
    qrImage.style.display = 'none';
    const errorMsg = document.createElement('p');
    errorMsg.textContent = 'QR code image not found. Please add the LumTags QR code as qr-code.png to the assets folder.';
    errorMsg.style.cssText = `
      color: #666;
      text-align: center;
      margin: 20px;
      font-size: 16px;
    `;
    qrContainer.appendChild(errorMsg);
  };
}

function closeQRCodeModal() {
  const modal = document.getElementById('qrCodeModal');
  if (modal) {
    modal.remove();
    document.body.style.overflow = '';
  }
}

function ensureGeneralPageLayout() {
  if (!document.querySelector('.general-page')) return;

  document.body.classList.add('general-page');

  const pageContainer = document.getElementById('page-container');
  if (pageContainer) {
    pageContainer.style.padding = '';
    pageContainer.style.overflow = '';
    pageContainer.style.height = '';
    pageContainer.style.maxHeight = '';
    pageContainer.classList.remove('card-log-modal-open');
  }

  document.body.style.overflow = '';
}

function initPage(id) {
  // Safeguard: Only run on the general page
  const currentPage = location.hash.replace('#', '') || 'events';
  if (currentPage !== 'general') {
    console.log(`general.js initPage called on wrong page: ${currentPage}, skipping execution`);
    return;
  }

  ensureGeneralPageLayout();
  
  console.log('[GENERAL] initPage called with id:', id);
  
  if (!id || !window.token) return;

  fetch(`${API_BASE}/api/tables/${id}`, {
    headers: { Authorization: window.token }
  })
    .then(res => res.json())
    .then(table => {
      const general = table.general || {};
      const userId = getUserIdFromToken();
      isOwner = Array.isArray(table.owners) && table.owners.includes(userId);

      // Now that isOwner is set, insert the admin/folder/task buttons
      insertAdminNotesBtn(id);

      const eventTitleEl = document.getElementById('eventTitle');
      if (eventTitleEl) eventTitleEl.textContent = table.title;

      ['eventSummary', 'location', 'weather', 'attendees'].forEach(field => {
        const el = document.getElementById(field === 'eventSummary' ? 'summary' : field);
        if (el) {
          const div = document.createElement('div');
          div.id = field === 'eventSummary' ? 'summary' : field;
          div.dataset.value = general[field === 'eventSummary' ? 'summary' : field] || '';
          div.className = field === 'weather' ? 'read-only weather-notes info-card-value' : 'read-only';
          
          // Make location field clickable to open maps
          if (field === 'location') {
            div.innerHTML = createLinkHTML(general.location || '', 'address');
          } else if (field === 'eventSummary') {
            // Display rich HTML content with URL linkification
            const summaryContent = general.summary || '';
            if (summaryContent.includes('<') && summaryContent.includes('>')) {
              // Contains HTML tags, treat as rich content
              div.innerHTML = linkifyText(summaryContent);
              div.classList.add('rich-content');
            } else {
              // Plain text, apply basic linkification
              div.innerHTML = linkifyText(summaryContent);
            }
          } else {
            div.textContent = general[field] || '';
          }
          
          el.replaceWith(div);
        }
      });

      const summaryEl = document.getElementById('summary');
      if (summaryEl && !htmlToPlainText(summaryEl.dataset.value || '').replace(/\u00a0/g, ' ').trim()) {
        const coverage = coverageHtmlFromRows(table.rows);
        if (coverage) {
          summaryEl.dataset.value = coverage;
          summaryEl.innerHTML = coverage;
          summaryEl.classList.add('rich-content');
        }
      }

      // Update weather icon after loading data
      updateWeatherIcon();
      
      // Store original date values for non-owners
      const startDate = general.start?.split('T')[0] || '';
      const endDate = general.end?.split('T')[0] || '';
      
      setDateField('start', startDate);
      setDateField('end', endDate);

      const fromCity = [general.city, general.state].filter(Boolean).join(', ');
      const fromLocation = String(general.location || '').replace(/<[^>]*>/g, '').trim();
      fetchWeatherForEvent(fromCity || fromLocation, startDate, endDate, fromCity ? fromLocation : '');
      setupProjectManager(general.projectManager);
      renderEventAccess(general);

      const contactRows = document.getElementById('contactRows');
      contactRows.innerHTML = '';
      (general.contacts || []).forEach(data => renderContactRow(data, true));

      const locationRows = document.getElementById('locationsRows');
      locationRows.innerHTML = '';
      (general.locations || []).forEach(data => renderLocationRow(data, true));

      document.getElementById('editBtn').style.display = isOwner ? 'inline-block' : 'none';
      document.querySelectorAll('.add-row-btn').forEach(btn => {
        btn.style.display = isOwner ? 'inline-block' : 'none';
      });
      
      // View Only indicator removed - not needed
      
      // Initialize clock functionality after DOM is ready
      // Use multiple attempts to ensure DOM elements are available
      console.log('[CLOCK] Starting clock initialization, isOwner:', isOwner, 'isAdmin:', isAdmin());
      console.log('[CLOCK] Page container content:', document.getElementById('page-container')?.innerHTML?.substring(0, 200));
      
      let clockInitAttempts = 0;
      const tryInitClock = () => {
        clockInitAttempts++;
        const clockBtn = document.getElementById('clockIconBtn');
        const clockContainer = document.getElementById('clockIconContainer');
        
        console.log(`[CLOCK] Attempt ${clockInitAttempts} - clockBtn:`, !!clockBtn, 'clockContainer:', !!clockContainer);
        console.log(`[CLOCK] Clock button element:`, clockBtn);
        
        if (clockBtn) {
          console.log('[CLOCK] Clock button found, initializing...');
          initializeClock();
        } else if (clockInitAttempts < 10) { // Increased attempts
          console.log(`[CLOCK] Clock button not ready yet (attempt ${clockInitAttempts}), retrying...`);
          setTimeout(tryInitClock, 300); // Increased delay
        } else {
          console.error('[CLOCK] Failed to find clock button after 10 attempts');
          console.error('[CLOCK] DOM state:', {
            clockContainer: !!document.getElementById('clockIconContainer'),
            clockBtn: !!document.getElementById('clockIconBtn'),
            adminContainer: !!document.getElementById('adminNotesBtnContainer'),
            pageContainer: !!document.getElementById('page-container'),
            generalPage: !!document.querySelector('.general-page')
          });
          console.error('[CLOCK] All elements with schedule class:', document.querySelectorAll('.material-symbols-outlined'));
        }
      };
      setTimeout(tryInitClock, 500); // Increased initial delay
    })
    .catch(err => console.error('Error loading event:', err));
}

async function saveGeneralInfo() {
  // 🔒 Check if user is owner before proceeding
  if (!isOwner) {
    return alert("Not authorized. Only owners can edit event information.");
  }

  const getText = id => {
    if (id === 'summary') {
      // Get content from TinyMCE editor if active, otherwise from read-only div
      const summaryEditorContainer = document.getElementById('summaryEditorContainer');
      if (summaryEditorContainer && summaryEditorContainer.style.display !== 'none') {
        // Check if TinyMCE is available
        const content = getTinyMCEContent();
        if (content !== '') {
          console.log('Getting content from TinyMCE for save:', content);
          return content;
        } else {
          // Fallback to textarea if TinyMCE failed
          const fallbackTextarea = document.getElementById('summaryFallback');
          if (fallbackTextarea) {
            console.log('Getting content from fallback textarea for save:', fallbackTextarea.value);
            return fallbackTextarea.value.trim();
          }
        }
      } else {
        // Fall back to the read-only div
        const el = document.getElementById(id);
        return el?.dataset.value || el?.innerHTML || '';
      }
    } else {
      const el = document.getElementById(id);
      return el?.tagName === 'TEXTAREA' ? el.value.trim() : el?.textContent.trim() || '';
    }
  };

  // Get event title from input if in edit mode, otherwise from h2 element
  const getEventTitle = () => {
    const titleInput = document.getElementById('eventTitleInput');
    if (titleInput) {
      return titleInput.value.trim();
    }
    const titleEl = document.getElementById('eventTitle');
    return titleEl?.textContent.trim() || '';
  };

  // Create the general data object with the exact schema structure expected by the backend
  const generalData = {
    summary: getText('summary'),
    location: getText('location'),
    weather: getText('weather'),
    attendees: getText('attendees'),
    start: document.getElementById('start')?.value || '',
    end: document.getElementById('end')?.value || '',
    projectManager: document.getElementById('projectManager')?.value || null,
    wifiNetwork: eventAccessValue('wifiNetwork'),
    wifiPassword: eventAccessValue('wifiPassword'),
    liveGallery: eventAccessValue('liveGallery'),
    loveGalleryPasscode: eventAccessValue('loveGalleryPasscode'),
    contacts: collectContacts(),
    locations: collectLocations()
  };

  // Update the weather icon before saving
  updateWeatherIcon();

  console.log('Saving general data:', generalData);

  try {
    // Get the current table ID directly from the URL or localStorage
    const currentTableId = params.get('id') || localStorage.getItem('eventId');
    
    if (!currentTableId) {
      throw new Error('No table ID found. Cannot save data.');
    }
    
    console.log('Saving to table ID:', currentTableId);
    
    // Get the event title
    const eventTitle = getEventTitle();
    
    // Key difference: Wrap the generalData in a "general" property to match the backend API expectation
    const res = await fetch(`${API_BASE}/api/tables/${currentTableId}/general`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': window.token
      },
      // This is the key fix - the server.js API expects a body with a "general" property and title
      body: JSON.stringify({ 
        title: eventTitle,
        general: generalData 
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Server error response:', errorText);
      throw new Error(errorText || 'Server returned an error');
    }
    
    console.log('Save successful!');
    window.location.reload();
  } catch (err) {
    console.error('Save error:', err);
    alert("Failed to save: " + (err.message || "Unknown error occurred"));
  }
}

function switchToEdit() {
  if (!isOwner) return;

  console.log('[GENERAL] switchToEdit called');

  // Handle event title editing
  const eventTitleEl = document.getElementById('eventTitle');
  if (eventTitleEl) {
    const currentTitle = eventTitleEl.textContent || '';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.id = 'eventTitleInput';
    titleInput.value = currentTitle;
    titleInput.style.cssText = `
      width: 100%;
      max-width: 600px;
      font-size: 1.5rem;
      font-weight: 600;
      color: #333;
      text-align: center;
      border: 2px solid #cc0007;
      border-radius: 8px;
      padding: 8px 16px;
      background: #fff;
      box-shadow: 0 2px 8px rgba(204, 0, 7, 0.1);
      outline: none;
      font-family: inherit;
      margin: 0 auto;
      display: block;
    `;
    titleInput.dataset.originalValue = currentTitle;
    eventTitleEl.replaceWith(titleInput);
  }

  ['eventSummary', 'location', 'weather', 'attendees'].forEach(id => {
    const element = document.getElementById(id === 'eventSummary' ? 'summary' : id);
    if (!element) return;
    
    if (id === 'eventSummary') {
      // Handle event summary with TinyMCE editor
      const summaryEditorContainer = document.getElementById('summaryEditorContainer');
      
      if (summaryEditorContainer) {
        // Hide the read-only div and show the editor
        element.style.display = 'none';
        summaryEditorContainer.style.display = 'block';
        
        // Get existing HTML content for editing
        const currentContent = element.dataset.value || element.innerHTML || '';
        
        // Initialize TinyMCE with current content
        initializeTinyMCE(currentContent).then(() => {
          console.log('TinyMCE editor ready with content');
        }).catch(error => {
          console.error('Failed to initialize TinyMCE:', error);
          // Fallback to a simple textarea if TinyMCE fails
          const fallbackTextarea = document.createElement('textarea');
          fallbackTextarea.id = 'summaryFallback';
          fallbackTextarea.value = htmlToPlainText(currentContent);
          fallbackTextarea.style.width = '100%';
          fallbackTextarea.style.minHeight = '200px';
          fallbackTextarea.style.fontFamily = 'inherit';
          fallbackTextarea.style.fontSize = '14px';
          fallbackTextarea.style.padding = '10px';
          fallbackTextarea.style.border = '1px solid #ccc';
          fallbackTextarea.style.borderRadius = '4px';
          summaryEditorContainer.appendChild(fallbackTextarea);
        });
        
      } else {
        console.error('summaryEditorContainer element not found');
      }
    } else {
      // Handle other fields with regular textareas
      if (element.tagName === 'TEXTAREA') {
        console.log(`[GENERAL] ${id} is already a textarea, preserving value:`, element.value);
        return; // Already in edit mode, don't change anything
      }
      
      console.log(`[GENERAL] Converting ${id} from div to textarea`);
      // Convert div to textarea
      const textarea = document.createElement('textarea');
      textarea.id = id;
      textarea.value = element.dataset.value || element.textContent || '';
      element.replaceWith(textarea);
      autoResizeTextarea(textarea);
      
      // Add input handler for weather field to update icon
      if (id === 'weather') {
        textarea.addEventListener('input', updateWeatherIcon);
      }
    }
  });

  const contactData = collectContacts();
  document.getElementById('contactRows').innerHTML = '';
  contactData.forEach(data => renderContactRow(data, false));

  const locationData = collectLocations();
  document.getElementById('locationsRows').innerHTML = '';
  locationData.forEach(data => renderLocationRow(data, false));

  document.querySelectorAll('.add-row-btn').forEach(btn => {
    btn.style.display = 'inline-block';
  });

  projectManagerEditing = true;
  applyProjectManagerMode();
  showDateEditors();
  showEventAccessEditors();

  const editBtn = document.getElementById('editBtn');
  if (editBtn) editBtn.style.display = 'none';

  // Auto-resize all textareas after rendering
  document.querySelectorAll('textarea').forEach(autoResizeTextarea);
}

function addContactRow() {
  // Check if we're already in edit mode by looking for TinyMCE editor or textareas
  const summaryEditorContainer = document.getElementById('summaryEditorContainer');
  const isAlreadyInEditMode = summaryEditorContainer && summaryEditorContainer.style.display !== 'none';
  
  console.log('[GENERAL] addContactRow called, already in edit mode:', isAlreadyInEditMode);
  
  if (!isAlreadyInEditMode) {
    console.log('[GENERAL] Switching to edit mode before adding contact row');
    switchToEdit();
  } else {
    console.log('[GENERAL] Already in edit mode, preserving existing data');
  }
  renderContactRow({}, false);
}

function addLocationRow() {
  // Check if we're already in edit mode by looking for TinyMCE editor or textareas
  const summaryEditorContainer = document.getElementById('summaryEditorContainer');
  const isAlreadyInEditMode = summaryEditorContainer && summaryEditorContainer.style.display !== 'none';
  
  console.log('[GENERAL] addLocationRow called, already in edit mode:', isAlreadyInEditMode);
  
  if (!isAlreadyInEditMode) {
    console.log('[GENERAL] Switching to edit mode before adding location row');
    switchToEdit();
  } else {
    console.log('[GENERAL] Already in edit mode, preserving existing data');
  }
  renderLocationRow({}, false);
}


// ✅ Ensure it's globally accessible for SPA router
window.initPage = initPage;

// Cleanup function for when leaving the page
window.addEventListener('beforeunload', function() {
  cleanupTinyMCE();
});
window.addContactRow = addContactRow;
window.addLocationRow = addLocationRow;
window.saveGeneralInfo = saveGeneralInfo;
window.switchToEdit = switchToEdit;
window.populateCoverageFromCrew = populateCoverageFromCrew;

// CLOCK ICON LOGIC
function showTimeModal() {
  console.log('[CLOCK] showTimeModal called - user type:', {isOwner, isAdmin: isAdmin()});
  // Create modal overlay
  const modal = document.createElement('div');
  modal.id = 'timeModal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.95);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    cursor: pointer;
    backdrop-filter: blur(5px);
  `;

  // Create time container
  const timeContainer = document.createElement('div');
  timeContainer.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 24px;
    padding: 60px 40px;
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
  `;

  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '×';
  closeBtn.style.cssText = `
    position: absolute;
    top: 20px;
    right: 25px;
    background: rgba(255, 255, 255, 0.2);
    border: none;
    font-size: 40px;
    color: white;
    cursor: pointer;
    padding: 10px;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.3s ease;
  `;
  closeBtn.onmouseover = () => closeBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
  closeBtn.onmouseout = () => closeBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    closeTimeModal();
  };

  // Create time display
  const timeDisplay = document.createElement('div');
  timeDisplay.id = 'modalTimeDisplay';
  timeDisplay.style.cssText = `
    font-size: clamp(2.5rem, 8vw, 4rem);
    font-weight: 300;
    color: white;
    text-align: center;
    font-family: 'Roboto', monospace;
    letter-spacing: 0.1em;
    text-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    margin-bottom: 20px;
  `;

  // Create date display
  const dateDisplay = document.createElement('div');
  dateDisplay.id = 'modalDateDisplay';
  dateDisplay.style.cssText = `
    font-size: clamp(1rem, 4vw, 1.5rem);
    font-weight: 400;
    color: rgba(255, 255, 255, 0.9);
    text-align: center;
    margin-bottom: 30px;
  `;

  // Create timezone display
  const timezoneDisplay = document.createElement('div');
  timezoneDisplay.style.cssText = `
    font-size: 1rem;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.7);
    text-align: center;
  `;

  function updateTime() {
    const now = new Date();
    
    // Format time
    timeDisplay.textContent = now.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    });
    
    // Format date
    dateDisplay.textContent = now.toLocaleDateString([], { 
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    // Format timezone
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    timezoneDisplay.textContent = timezone.replace('_', ' ');
  }

  // Initial time update
  updateTime();
  
  // Start interval for live updates
  clockInterval = setInterval(updateTime, 1000);

  // Add elements to container
  timeContainer.appendChild(closeBtn);
  timeContainer.appendChild(timeDisplay);
  timeContainer.appendChild(dateDisplay);
  timeContainer.appendChild(timezoneDisplay);

  // Add container to modal
  modal.appendChild(timeContainer);

  // Add modal to document
  document.body.appendChild(modal);

  // Close modal when clicking outside
  modal.onclick = (e) => {
    if (e.target === modal) {
      closeTimeModal();
    }
  };

  // Prevent scrolling when modal is open
  document.body.style.overflow = 'hidden';

  // Handle ESC key
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      closeTimeModal();
    }
  };
  document.addEventListener('keydown', handleEsc);
  
  // Store the event listener for cleanup
  modal.escHandler = handleEsc;

  console.log('[CLOCK] Time modal opened');
}

function closeTimeModal() {
  const modal = document.getElementById('timeModal');
  if (modal) {
    // Clear the interval
    if (clockInterval) {
      clearInterval(clockInterval);
      clockInterval = null;
    }
    
    // Remove ESC key listener
    if (modal.escHandler) {
      document.removeEventListener('keydown', modal.escHandler);
    }
    
    modal.remove();
    document.body.style.overflow = '';
    console.log('[CLOCK] Time modal closed');
  }
}

function initializeClock() {
  const clockBtn = document.getElementById('clockIconBtn');
  
  console.log('[CLOCK] initializeClock called, button found:', !!clockBtn);
  console.log('[CLOCK] Button element details:', clockBtn);

  if (clockBtn) {
    console.log('[CLOCK] Clock button found, initializing click handler');
    console.log('[CLOCK] Button is visible:', clockBtn.offsetParent !== null);
    console.log('[CLOCK] Button computed style:', window.getComputedStyle(clockBtn).display);
    
    // Remove any existing listeners to prevent duplicates
    if (window.clockButtonHandler) {
      clockBtn.removeEventListener('click', window.clockButtonHandler);
      console.log('[CLOCK] Removed existing click handler');
    }
    
    // Create named handler for easier removal
    window.clockButtonHandler = (e) => {
      console.log('[CLOCK] *** CLOCK BUTTON CLICKED *** - user:', {isOwner, isAdmin: isAdmin()});
      e.stopPropagation();
      e.preventDefault();
      showTimeModal();
    };
    
    clockBtn.addEventListener('click', window.clockButtonHandler);
    
    // Test click handler by adding a temporary test
    clockBtn.addEventListener('mousedown', () => {
      console.log('[CLOCK] Mouse down detected on clock button');
    });
    
    console.log('[CLOCK] Clock handlers attached successfully');
    console.log('[CLOCK] Button has event listeners:', clockBtn);
  } else {
    console.warn('[CLOCK] Clock button not found in initializeClock');
  }
}
})();
