// Добавляем роут аналитики в твой текущий сервер
app.get('/api/ai-analytics', async (req, res) => {
  // Разрешаем любому внешнему сайту (твоему новому фронтенду) читать эти данные
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const apiKey = process.env.POLLINATIONS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key is not configured on server' });
  }

  try {
    const headers = { 'Authorization': `Bearer ${apiKey}` };

    // 1. Получаем баланс
    const balanceRes = await fetch('https://gen.pollinations.ai/account/balance', { headers });
    const balanceData = balanceRes.ok ? await balanceRes.json() : { balance: 0 };

    // 2. Получаем агрегированную статистику за 30 дней (для подсчета трат и популярных моделей)
    const dailyRes = await fetch('https://gen.pollinations.ai/account/usage/daily?days=30', { headers });
    const dailyData = dailyRes.ok ? await dailyRes.json() : { usage: [] };

    // 3. Получаем последние 20 детальных логов запросов
    const historyRes = await fetch('https://gen.pollinations.ai/account/usage?limit=20', { headers });
    const historyData = historyRes.ok ? await historyRes.json() : { usage: [] };

    const dailyUsage = dailyData.usage || [];

    // Считаем расходы за сегодня
    const todayStr = new Date().toISOString().split('T')[0];
    const spentToday = dailyUsage
      .filter(item => item.date === todayStr)
      .reduce((sum, item) => sum + (item.cost_usd || 0), 0);

    // Считаем расходы за 30 дней
    const spentMonth = dailyUsage.reduce((sum, item) => sum + (item.cost_usd || 0), 0);

    // Считаем топ-3 популярных ИИ моделей
    const modelStats = {};
    dailyUsage.forEach(item => {
      const mName = item.model || 'Unknown';
      if (!modelStats[mName]) modelStats[mName] = { name: mName, requests: 0 };
      modelStats[mName].requests += (item.requests || 0);
    });
    const popularModels = Object.values(modelStats)
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 3);

    // Отправляем всё собранное на фронтенд
    res.json({
      balance: balanceData.balance,
      spentToday,
      spentMonth,
      popularModels,
      history: historyData.usage || []
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
