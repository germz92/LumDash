function registerWeatherRoute(app, authenticate) {
  app.get('/api/weather/forecast', authenticate, async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (!query) return res.status(400).json({ error: 'City is required' });

    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Weather is not configured' });

    try {
      const geoRes = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=1&appid=${apiKey}`);
      if (geoRes.status === 401) return res.status(503).json({ error: 'Weather is not configured' });
      if (!geoRes.ok) return res.status(502).json({ error: 'Weather unavailable' });

      const geoData = await geoRes.json();
      if (!Array.isArray(geoData) || geoData.length === 0) {
        return res.status(404).json({ error: 'City not found' });
      }

      const { lat, lon } = geoData[0];
      const forecastRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=imperial&appid=${apiKey}`);
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
