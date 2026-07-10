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

    const API_KEY = process.env.POLLINATIONS_API_KEY; // Твой ключ из настроек бэка

    try {
        // Проверяем, есть ли ключ вообще в бэкенде
        if (!API_KEY) {
            return res.status(500).json({ error: "API key is missing in Vercel settings" });
        }

        // Стучимся в Pollinations
        const response = await fetch('https://gen.pollinations.ai/account/quests', {
            headers: { 'Authorization': `Bearer ${API_KEY}` }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: "Pollinations API returned an error" });
        }

        const data = await response.json();

        // Формируем и отправляем ответ для нашего красивого бело-зеленого фронтенда
        // (Тут возвращаем заглушки, подставь свои расчеты из данных Pollinations, если нужно)
        return res.status(200).json({
            balance: data.balanceBucket === 'tier' ? 10.00 : 0.00, // или откуда ты берешь баланс
            spentToday: 0.012,
            spentMonth: 1.45,
            popularModels: [
                { name: 'flux', requests: 42 },
                { name: 'openai', requests: 12 }
            ],
            history: []
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
