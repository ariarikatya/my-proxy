export default async function handler(req, res) {
    // Разрешаем фронтенду слать запросы (CORS)
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

    try {
        // Делаем 3 параллельных запроса к Pollinations, чтобы собрать ВСЕ нужные данные
        const [balanceRes, dailyRes, usageRes] = await Promise.all([
            fetch('https://gen.pollinations.ai/account/balance', { headers: { 'Authorization': `Bearer ${API_KEY}` } }),
            fetch('https://gen.pollinations.ai/account/usage/daily?days=30', { headers: { 'Authorization': `Bearer ${API_KEY}` } }),
            fetch('https://gen.pollinations.ai/account/usage?limit=10', { headers: { 'Authorization': `Bearer ${API_KEY}` } })
        ]);

        // Проверяем ответы
        if (!balanceRes.ok || !dailyRes.ok || !usageRes.ok) {
            return res.status(500).json({ error: "One of Pollinations API endpoints returned an error" });
        }

        const balanceData = await balanceRes.json();
        const dailyData = await dailyRes.json();
        const usageData = await usageRes.json();

        // --- ЛОГИКА РАСЧЕТА ДАННЫХ ДЛЯ ТВОЕГО ФРОНТЕНДА ---

        // 1. Текущий баланс
        const currentBalance = balanceData.balance !== undefined ? balanceData.balance : 0.00;

        // 2. Расчет расходов (сегодня и месяц) на основе daily-статистики
        const todayStr = new Date().toISOString().split('T')[0]; // ГГГГ-ММ-ДД
        let spentToday = 0;
        let spentMonth = 0;
        const modelRequestsMap = {};

        if (dailyData.usage && Array.isArray(dailyData.usage)) {
            dailyData.usage.forEach(item => {
                const cost = item.cost_usd || 0;
                spentMonth += cost; // Суммируем всё за 30 дней

                // Если дата совпадает с сегодняшней
                if (item.date && item.date.startsWith(todayStr)) {
                    spentToday += cost;
                }

                // Считаем общие запросы по моделям для графика популярности
                if (item.model) {
                    modelRequestsMap[item.model] = (modelRequestsMap[item.model] || 0) + (item.requests || 0);
                }
            });
        }

        // 3. Формируем топ популярных моделей
        const popularModels = Object.entries(modelRequestsMap)
            .map(([name, requests]) => ({ name, requests }))
            .sort((a, b) => b.requests - a.requests)
            .slice(0, 5); // Берем топ-5 моделей

        // 4. Формируем историю последних 10 запросов
        const history = (usageData.usage || []).map(item => {
            // Форматируем дату из ISO строки в понятный формат
            const dateFormatted = item.timestamp 
                ? new Date(item.timestamp).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                : 'Неизвестно';

            return {
                date: dateFormatted,
                model: item.model || 'ИИ Модель',
                tokens: (item.input_text_tokens || 0) + (item.output_text_tokens || 0), // Сумма входных и выходных токенов
                status: item.cost_usd !== undefined ? `-$${item.cost_usd.toFixed(4)}` : 'Успешно' // Покажем стоимость прямо в статус
            };
        });

        // Отправляем всё это на фронтенд
        return res.status(200).json({
            balance: currentBalance,
            spentToday: Number(spentToday.toFixed(4)),
            spentMonth: Number(spentMonth.toFixed(2)),
            popularModels: popularModels.length > 0 ? popularModels : [{ name: 'Нет запросов', requests: 0 }],
            history: history
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
