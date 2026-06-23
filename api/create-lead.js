export default async function handler(req, res) {
    // 1. Настройка CORS-заголовков
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // 2. Обработка preflight-запроса OPTIONS
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Метод не поддерживается' });
    }

    try {
        const { imageUrl, diagnosis } = req.body;

        // 🔐 Тянем настройки безопасности из Environment Variables на Vercel
        const SUBDOMAIN = process.env.AMO_SUBDOMAIN; 
        const AMO_TOKEN = process.env.AMO_TOKEN;

        if (!AMO_TOKEN || !SUBDOMAIN) {
            throw new Error('Доступы amoCRM (AMO_SUBDOMAIN или AMO_TOKEN) не настроены в Vercel Variables');
        }

        // Формируем запрос к amoCRM на создание сделки
        const amoResponse = await fetch(`https://${SUBDOMAIN}.amocrm.ru/api/v4/leads/complex`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AMO_TOKEN}`
            },
            body: JSON.stringify([
                {
                    name: "Заявка с сайта: Нужна помощь человека",
                    price: 0,
                    _embedded: {
                        tags: [
                            { name: "ИИ-Диагностика" },
                            { name: "Кликнул_человек" }
                        ]
                    },
                    custom_fields_values: [
                        {
                            field_name: "Ссылка на фото", 
                            values: [{ value: imageUrl }]
                        },
                        {
                            field_name: "Результат анализа ИИ", 
                            values: [{ value: diagnosis }]
                        }
                    ]
                }
            ])
        ]);

        if (!amoResponse.ok) {
            const errText = await amoResponse.text();
            throw new Error(`Ошибка amoCRM: ${amoResponse.status} - ${errText}`);
        }

        const amoData = await amoResponse.json();
        
        // Извлекаем id созданной сделки из ответа амо
        const leadId = amoData[0]?.id;
        const leadUrl = `https://${SUBDOMAIN}.amocrm.ru/leads/detail/${leadId}`;

        // Возвращаем успешный ответ фронтенду
        return res.status(200).json({
            success: true,
            leadId: leadId,
            leadUrl: leadUrl
        });

    } catch (error) {
        console.error("Ошибка при создании лида:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
