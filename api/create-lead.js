import https from 'https';

export default function handler(req, res) {
    // 1. Настройка CORS-заголовков (срабатывают сразу)
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
        const { imageUrl, diagnosis } = req.body || {};

        const SUBDOMAIN = process.env.AMO_SUBDOMAIN; 
        const AMO_TOKEN = process.env.AMO_TOKEN;

        if (!AMO_TOKEN || !SUBDOMAIN) {
            return res.status(500).json({ success: false, error: 'Переменные окружения AMO не настроены в Vercel' });
        }

        // Данные для отправки в amoCRM
        const postData = JSON.stringify([
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
        field_id: 974979, 
        values: [{ value: imageUrl || '' }]
    },
    {
        field_id: 974983, 
        values: [{ value: diagnosis || '' }]
    }
]
            }
        ]);

        // Настройки запроса через встроенный модуль https
        const options = {
            hostname: `${SUBDOMAIN}.amocrm.ru`,
            port: 443,
            path: '/api/v4/leads/complex',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AMO_TOKEN}`,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const amoReq = https.request(options, (amoRes) => {
            let responseBody = '';

            amoRes.on('data', (chunk) => {
                responseBody += chunk;
            });

            amoRes.on('end', () => {
                if (amoRes.statusCode >= 200 && amoRes.statusCode < 300) {
                    try {
                        const amoData = JSON.parse(responseBody);
                        const leadId = amoData[0]?.id;
                        const leadUrl = `https://${SUBDOMAIN}.amocrm.ru/leads/detail/${leadId}`;
                        
                        return res.status(200).json({
                            success: true,
                            leadId: leadId,
                            leadUrl: leadUrl
                        });
                    } catch (e) {
                        return res.status(500).json({ success: false, error: 'Ошибка парсинга ответа amoCRM' });
                    }
                } else {
                    return res.status(amoRes.statusCode).json({ success: false, error: `amoCRM вернул статус ${amoRes.statusCode}`, details: responseBody });
                }
            });
        });

        amoReq.on('error', (error) => {
            return res.status(500).json({ success: false, error: error.message });
        });

        // Записываем данные в поток и закрываем запрос
        amoReq.write(postData);
        amoReq.end();

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
