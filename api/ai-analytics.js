export default async function handler(req, res) {
    // Настройка CORS для фронтенда
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const API_KEY = process.env.POLLINATIONS_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({ error: "API key is missing in Vercel settings" });
    }

    // Твой словарь для переименования моделей под заказчика
    const MODEL_NAMES = {
        'klein': 'Генератор ландшафтного дизайна',
        'gpt-image-2': 'Чертеж дизайна',
        'gpt-5.4-mini': 'Распознавание и помощь по растениям',
        'gpt-5.4-mini-2026-03-17': 'Распознавание и помощь по растениям', // Учитываем полную версию с датой
        'openai-fast': 'Быстрый чат-ассистент',
        'gemini-fast': 'Анализ документов'
    };

    try {
        // Делаем параллельные запросы к нужным эндпоинтам Pollinations
        const [balanceRes, dailyRes, usageRes] = await Promise.all([
            fetch('https://gen.pollinations.ai/account/balance', { headers: { 'Authorization': `Bearer ${API_KEY}` } }),
            fetch('https://gen.pollinations.ai/account/usage/daily?days=30', { headers: { 'Authorization': `Bearer ${API_KEY}` } }),
            fetch('https://gen.pollinations.ai/account/usage?limit=10', { headers: { 'Authorization': `Bearer ${API_KEY}` } })
        ]);

        if (!balanceRes.ok || !dailyRes.ok || !usageRes.ok) {
            return res.status(500).json({ error: "One of Pollinations API endpoints returned an error" });
        }

        const balanceData = await balanceRes.json();
        const dailyData = await dailyRes.json();
        const usageData = await usageRes.json();

        // 1. Текущий баланс
        const currentBalance = balanceData.balance !== undefined ? balanceData.balance : 0.00;

        // 2. Расчет расходов за сегодня и 30 дней
        const todayStr = new Date().toISOString().split('T')[0];
        let spentToday = 0;
        let spentMonth = 0;
        const modelRequestsMap = {};

        if (dailyData.usage && Array.isArray(dailyData.usage)) {
            dailyData.usage.forEach(item => {
                const cost = item.cost_usd || 0;
                spentMonth += cost;

                if (item.date && item.date.startsWith(todayStr)) {
                    spentToday += cost;
                }

                if (item.model) {
                    // Переименовываем модель для группировки в топ
                    const cleanName = MODEL_NAMES[item.model] || item.model;
                    modelRequestsMap[cleanName] = (modelRequestsMap[cleanName] || 0) + (item.requests || 0);
                }
            });
        }

        // Формируем топ популярных моделей для графика
        const popularModels = Object.entries(modelRequestsMap)
            .map(([name, requests]) => ({ name, requests }))
            .sort((a, b) => b.requests - a.requests);

        // 3. Формируем историю последних запросов
        const history = (usageData.usage || []).map(item => {
            const rawModel = item.model || 'image-edit';
            // Подставляем понятное название, если его нет — оставляем оригинал
            const friendlyModelName = MODEL_NAMES[rawModel] || rawModel;

            const timeFormatted = item.timestamp 
                ? new Date(item.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                : '--:--';

            return {
                timestamp: item.timestamp, // Передаем оригинальный таймстамп для фронта
                model: friendlyModelName,
                cost_usd: item.cost_usd || 0
            };
        });

        // Отправляем чистый структурированный JSON на фронтенд
        return res.status(200).json({
            balance: currentBalance,
            spentToday: Number(spentToday.toFixed(4)),
            spentMonth: Number(spentMonth.toFixed(3)),
            popularModels: popularModels.length > 0 ? popularModels : [{ name: 'Нет запросов', requests: 0 }],
            history: history
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
