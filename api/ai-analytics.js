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
    const SHOP_ID = process.env.YOOKASSA_SHOP_ID;
    const SECRET_KEY = process.env.YOOKASSA_SECRET_KEY;

    if (!API_KEY) {
        return res.status(500).json({ error: "API key is missing in Vercel settings" });
    }

    const days = parseInt(req.query.days) || 30;

    const MODEL_NAMES = {
        'klein': 'Ландшафтный дизайн',
        'gpt-image-2': 'Чертеж дизайна',
        'gpt-5.4-mini': 'Распознавание растений',
        'gpt-5.4-mini-2026-03-17': 'Распознавание растений'
    };

    const IGNORED_MODELS = ['openai-fast', 'gemini-fast'];

    try {
        const dateLimit90 = new Date();
        dateLimit90.setDate(dateLimit90.getDate() - 90);
        const createdFromStr = dateLimit90.toISOString();

        const dateLimit30 = new Date();
        dateLimit30.setDate(dateLimit30.getDate() - 30);

        const yookassaAuth = Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64');

        // Запрашиваем баланс, статистику ИИ, платежи И возвраты
        const [balanceRes, dailyRes, usageRes, yookassaPaymentsRes, yookassaRefundsRes] = await Promise.all([
            fetch('https://gen.pollinations.ai/account/balance', { headers: { 'Authorization': `Bearer ${API_KEY}` } }),
            fetch(`https://gen.pollinations.ai/account/usage/daily?days=${days}`, { headers: { 'Authorization': `Bearer ${API_KEY}` } }),
            fetch('https://gen.pollinations.ai/account/usage?limit=20', { headers: { 'Authorization': `Bearer ${API_KEY}` } }),
            fetch(`https://api.yookassa.ru/v3/payments?status=succeeded&created_at.gte=${createdFromStr}&limit=100`, {
                headers: { 'Authorization': `Basic ${yookassaAuth}` }
            }),
            fetch(`https://api.yookassa.ru/v3/refunds?status=succeeded&created_at.gte=${createdFromStr}&limit=100`, {
                headers: { 'Authorization': `Basic ${yookassaAuth}` }
            })
        ]);

        if (!balanceRes.ok || !dailyRes.ok || !usageRes.ok) {
            return res.status(500).json({ error: "One of Pollinations API endpoints returned an error" });
        }

        const balanceData = await balanceRes.json();
        const dailyData = await dailyRes.json();
        const usageData = await usageRes.json();
        
        let yookassaPayments = { items: [] };
        if (yookassaPaymentsRes.ok) yookassaPayments = await yookassaPaymentsRes.json();

        let yookassaRefunds = { items: [] };
        if (yookassaRefundsRes.ok) yookassaRefunds = await yookassaRefundsRes.json();

        const currentBalance = balanceData.balance !== undefined ? balanceData.balance : 0.00;
        const todayStr = new Date().toISOString().split('T')[0];
        
        // 1. Расчет расходов ИИ
        let spentToday = 0;
        let spentMonth = 0;
        const modelRequestsMap = {};

        if (dailyData.usage && Array.isArray(dailyData.usage)) {
            dailyData.usage.forEach(item => {
                if (item.model && IGNORED_MODELS.includes(item.model)) return;
                const cost = item.cost_usd || 0;
                spentMonth += cost;
                if (item.date && item.date.startsWith(todayStr)) spentToday += cost;
                if (item.model) {
                    const cleanName = MODEL_NAMES[item.model] || item.model;
                    modelRequestsMap[cleanName] = (modelRequestsMap[cleanName] || 0) + (item.requests || 0);
                }
            });
        }

        // 2. Считаем сначала общие приходы (грязную выручку)
        let earnedToday = 0;
        let earned30Days = 0;
        let earned90Days = 0;
        const salesHistory = [];

        if (yookassaPayments.items && Array.isArray(yookassaPayments.items)) {
            yookassaPayments.items.forEach(payment => {
                const amount = parseFloat(payment.amount.value) || 0;
                const createdAtStr = payment.created_at;
                const paymentDate = new Date(createdAtStr);

                earned90Days += amount;
                if (paymentDate >= dateLimit30) earned30Days += amount;
                if (createdAtStr && createdAtStr.startsWith(todayStr)) earnedToday += amount;

                salesHistory.push({
                    id: payment.id,
                    timestamp: createdAtStr,
                    phone: payment.metadata?.phone || 'Не указан',
                    qty: payment.metadata?.qty || 1,
                    type: payment.metadata?.type || 'gen',
                    amount: amount,
                    isRefunded: false
                });
            });
        }

        // 3. Считаем и вычитаем возвраты
        if (yookassaRefunds.items && Array.isArray(yookassaRefunds.items)) {
            yookassaRefunds.items.forEach(refund => {
                const refundAmount = parseFloat(refund.amount.value) || 0;
                const createdAtStr = refund.created_at; // дата самого возврата
                const refundDate = new Date(createdAtStr);

                // Вычитаем из периодов на основе того, КОГДА был сделан возврат
                earned90Days -= refundAmount;
                if (refundDate >= dateLimit30) earned30Days -= refundAmount;
                if (createdAtStr && createdAtStr.startsWith(todayStr)) earnedToday -= refundAmount;

                // Также помечаем платеж в истории как возвращенный, если находим совпадение по payment_id
                const originalPayment = salesHistory.find(p => p.id === refund.payment_id);
                if (originalPayment) {
                    originalPayment.isRefunded = true;
                    // Опционально: можно уменьшить отображаемую сумму или оставить, но пометить флагом
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
            earnedToday: Number(Math.max(0, earnedToday).toFixed(2)), // Чтобы в минус случайно не ушло на фронте
            earned30Days: Number(Math.max(0, earned30Days).toFixed(2)),
            earned90Days: Number(Math.max(0, earned90Days).toFixed(2)),
            popularModels: popularModels.length > 0 ? popularModels : [{ name: 'Нет запросов', requests: 0 }],
            history: history,
            salesHistory: salesHistory.slice(0, 6)
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
