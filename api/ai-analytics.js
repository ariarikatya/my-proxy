export default async function handler(req, res) {
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

    // Получаем количество дней из запроса фронтенда, по умолчанию 30
    const days = req.query.days || 30;

    const MODEL_NAMES = {
        'klein': 'Ландшафтный дизайн',
        'gpt-image-2': 'Чертеж дизайна',
        'gpt-5.4-mini': 'Распознавание растений',
        'gpt-5.4-mini-2026-03-17': 'Распознавание растений'
    };

    const IGNORED_MODELS = ['openai-fast', 'gemini-fast'];

    try {
        const [balanceRes, dailyRes, usageRes] = await Promise.all([
            fetch('https://gen.pollinations.ai/account/balance', { headers: { 'Authorization': `Bearer ${API_KEY}` } }),
            // Подставляем динамическое количество дней сюда
            fetch(`https://gen.pollinations.ai/account/usage/daily?days=${days}`, { headers: { 'Authorization': `Bearer ${API_KEY}` } }),
            fetch('https://gen.pollinations.ai/account/usage?limit=20', { headers: { 'Authorization': `Bearer ${API_KEY}` } })
        ]);

        if (!balanceRes.ok || !dailyRes.ok || !usageRes.ok) {
            return res.status(500).json({ error: "One of Pollinations API endpoints returned an error" });
        }

        const balanceData = await balanceRes.json();
        const dailyData = await dailyRes.json();
        const usageData = await usageRes.json();

        const currentBalance = balanceData.balance !== undefined ? balanceData.balance : 0.00;

        const todayStr = new Date().toISOString().split('T')[0];
        let spentToday = 0;
        let spentMonth = 0;
        const modelRequestsMap = {};

        if (dailyData.usage && Array.isArray(dailyData.usage)) {
            dailyData.usage.forEach(item => {
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

        const popularModels = Object.entries(modelRequestsMap)
            .map(([name, requests]) => ({ name, requests }))
            .sort((a, b) => b.requests - a.requests);

        const history = (usageData.usage || [])
            .filter(item => item.model && !IGNORED_MODELS.includes(item.model))
            .map(item => ({
                timestamp: item.timestamp,
                model: MODEL_NAMES[item.model] || item.model,
                cost_usd: item.cost_usd || 0
            }))
            .slice(0, 8);

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
