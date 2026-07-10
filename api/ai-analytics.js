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

    // Сокращенный словарь названий моделей
    const MODEL_NAMES = {
        'klein': 'Ландшафтный дизайн',
        'gpt-image-2': 'Чертеж дизайна',
        'gpt-5.4-mini': 'Распознавание растений',
        'gpt-5.4-mini-2026-03-17': 'Распознавание растений'
    };

    // Список тестовых моделей, которые нужно полностью скрыть
    const IGNORED_MODELS = ['openai-fast', 'gemini-fast'];

    try {
        const [balanceRes, dailyRes, usageRes] = await Promise.all([
            fetch('https://gen.pollinations.ai/account/balance', { headers: { 'Authorization': `Bearer ${API_KEY}` } }),
            fetch('https://gen.pollinations.ai/account/usage/daily?days=30', { headers: { 'Authorization': `Bearer ${API_KEY}` } }),
            fetch('https://gen.pollinations.ai/account/usage?limit=20', { headers: { 'Authorization': `Bearer ${API_KEY}` } }) // увеличен лимит, чтобы после фильтрации остались элементы
        ]);

        if (!balanceRes.ok || !dailyRes.ok || !usageRes.ok) {
            return res.status(500).json({ error: "One of Pollinations API endpoints returned an error" });
        }

        const balanceData = await balanceRes.json();
        const dailyData = await dailyRes.json();
        const usageData = await usageRes.json();

        // 1. Текущий баланс
        const currentBalance = balanceData.balance !== undefined ? balanceData.balance : 0.00;

        // 2. Расчет расходов за сегодня и 30 дней с фильтрацией тестов
        const todayStr = new Date().toISOString().split('T')[0];
        let spentToday = 0;
        let spentMonth = 0;
        const modelRequestsMap = {};

        if (dailyData.usage && Array.isArray(dailyData.usage)) {
            dailyData.usage.forEach(item => {
                // Если модель тестовая — полностью игнорируем её в статистике
                if (item.model && IGNORED_MODELS.includes(item.model)) {
                    return;
                }

                const cost = item.cost_usd || 0;
                spentMonth += cost;

                if (item.date && item.date.startsWith(todayStr)) {
                    spentToday += cost;
                }

                if (item.model) {
                    const cleanName = MODEL_NAMES[item.model] || item.model;
                    modelRequestsMap[cleanName] = (modelRequestsMap[cleanName] || 0) + (item.requests || 0);
                }
            });
        }

        // Формируем топ популярных моделей
        const popularModels = Object.entries(modelRequestsMap)
            .map(([name, requests]) => ({ name, requests }))
            .sort((a, b) => b.requests - a.requests);

        // 3. Формируем историю последних запросов без тестов
        const history = (usageData.usage || [])
            .filter(item => item.model && !IGNORED_MODELS.includes(item.model)) // убираем тесты из логов
            .map(item => {
                const rawModel = item.model || 'image-edit';
                const friendlyModelName = MODEL_NAMES[rawModel] || rawModel;

                return {
                    timestamp: item.timestamp,
                    model: friendlyModelName,
                    cost_usd: item.cost_usd || 0
                };
            })
            .slice(0, 8); // оставляем аккуратный топ-8 для таблицы

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
