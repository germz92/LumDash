const US_STATES = {
  AL: 'AL', AK: 'AK', AZ: 'AZ', AR: 'AR', CA: 'CA', CO: 'CO', CT: 'CT', DE: 'DE',
  FL: 'FL', GA: 'GA', HI: 'HI', ID: 'ID', IL: 'IL', IN: 'IN', IA: 'IA', KS: 'KS',
  KY: 'KY', LA: 'LA', ME: 'ME', MD: 'MD', MA: 'MA', MI: 'MI', MN: 'MN', MS: 'MS',
  MO: 'MO', MT: 'MT', NE: 'NE', NV: 'NV', NH: 'NH', NJ: 'NJ', NM: 'NM', NY: 'NY',
  NC: 'NC', ND: 'ND', OH: 'OH', OK: 'OK', OR: 'OR', PA: 'PA', RI: 'RI', SC: 'SC',
  SD: 'SD', TN: 'TN', TX: 'TX', UT: 'UT', VT: 'VT', VA: 'VA', WA: 'WA', WV: 'WV',
  WI: 'WI', WY: 'WY', DC: 'DC',
  ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA',
  COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA',
  HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA', KANSAS: 'KS',
  KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD', MASSACHUSETTS: 'MA',
  MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT',
  NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND',
  OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX',
  UTAH: 'UT', VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI', WYOMING: 'WY'
};

function candidateQueries(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const queries = [];
  const add = (value) => {
    const next = String(value || '').replace(/\s*,\s*/g, ',').trim();
    if (next && !queries.includes(next)) queries.push(next);
  };

  const parts = text.split(',').map(part => part.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 1; i--) {
    const code = US_STATES[parts[i].replace(/\./g, '').toUpperCase()];
    if (!code) continue;
    add(`${parts[i - 1]},${code},US`);
    add(`${parts[i - 1]},${code}`);
    add(parts[i - 1]);
    break;
  }
  add(text);
  return queries;
}

async function geocode(query, apiKey) {
  let unavailable = false;
  for (const candidate of candidateQueries(query)) {
    const geoRes = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(candidate)}&limit=1&appid=${apiKey}`);
    if (geoRes.status === 401) return { error: 'config' };
    if (!geoRes.ok) {
      unavailable = true;
      continue;
    }
    const geoData = await geoRes.json();
    if (Array.isArray(geoData) && geoData[0] && geoData[0].lat != null) {
      return { lat: geoData[0].lat, lon: geoData[0].lon };
    }
  }
  return unavailable ? { error: 'unavailable' } : { error: 'notfound' };
}

function registerWeatherRoute(app, authenticate) {
  app.get('/api/weather/forecast', authenticate, async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (!query) return res.status(400).json({ error: 'City is required' });

    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Weather is not configured' });

    try {
      const place = await geocode(query, apiKey);
      if (place.error === 'config') return res.status(503).json({ error: 'Weather is not configured' });
      if (place.error === 'unavailable') return res.status(502).json({ error: 'Weather unavailable' });
      if (place.error) return res.status(404).json({ error: 'City not found' });

      const forecastRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${place.lat}&lon=${place.lon}&units=imperial&appid=${apiKey}`);
      const forecastData = await forecastRes.json();
      if (!forecastData || !Array.isArray(forecastData.list)) {
        return res.status(502).json({ error: 'Weather unavailable' });
      }

      res.json({ list: forecastData.list });
    } catch (err) {
      console.error('Weather lookup failed:', err);
      res.status(502).json({ error: 'Weather unavailable' });
    }
  });
}

module.exports = registerWeatherRoute;
