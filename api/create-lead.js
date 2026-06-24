import https from 'https';

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' });

    try {
        const { imageUrl, diagnosis, visitorUid } = req.body || {};
        const SUBDOMAIN = process.env.AMO_SUBDOMAIN; 
        const AMO_TOKEN = process.env.AMO_TOKEN;

        if (!AMO_TOKEN || !SUBDOMAIN) {
            return res.status(500).json({ success: false, error: 'Переменные окружения AMO не настроены' });
        }

        // 1. Создаем структуру новой сделки
        const leadData = JSON.stringify([
            {
                name: "Заявка с сайта: Нужна помощь человека",
                price: 0,
                _embedded: {
                    tags: [
                        { name: "ИИ-Диагностика" },
                        { name: visitorUid || "Без_ID" } // Кладем ID чата в теги для видимости менеджерам
                    ]
                },
                custom_fields_values: [
                    { field_id: 974979, values: [{ value: imageUrl || '' }] },
                    { field_id: 974983, values: [{ value: diagnosis || '' }] }
                ]
            }
        ]);

        const leadOptions = {
            hostname: `${SUBDOMAIN}.amocrm.ru`,
            port: 443,
            path: '/api/v4/leads', 
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AMO_TOKEN}`
            }
        };

        // Отправляем запрос на создание сделки
        const amoReq = https.request(leadOptions, (amoRes) => {
            let responseBody = '';
            amoRes.on('data', (chunk) => { responseBody += chunk; });
            amoRes.on('end', () => {
                if (amoRes.statusCode >= 200 && amoRes.statusCode < 300) {
                    
                    // Если сделка создана, вытаскиваем её ID, чтобы прикрепить КЛИКАБЕЛЬНОЕ примечание
                    try {
                        const resJson = JSON.parse(responseBody);
                        const leadId = resJson._embedded.leads[0].id;
                        
                        // Создаем примечание к этой сделке
                        createLeadNote(SUBDOMAIN, AMO_TOKEN, leadId, imageUrl, diagnosis);
                    } catch (e) {
                        console.error("Ошибка парсинга ответа сделки:", e);
                    }

                    return res.status(200).json({ success: true, message: "Сделка успешно создана" });
                } else {
                    return res.status(amoRes.statusCode).json({ success: false, details: responseBody });
                }
            });
        });

        amoReq.write(leadData);
        amoReq.end();

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}

// Функция добавления примечания, в котором ссылки гарантированно КЛИКАБЕЛЬНЫ
function createLeadNote(subdomain, token, leadId, imageUrl, diagnosis) {
    const noteData = JSON.stringify([
        {
            entity_id: leadId,
            note_type: "common",
            params: {
                text: `🌿 РЕЗУЛЬТАТ ИИ-ДИАГНОСТИКИ:\n\n📷 Ссылка на фото: ${imageUrl || 'Не загружено'}\n\n📝 Анализ: ${diagnosis || 'Нет описания'}`
            }
        }
    ]);

    const noteOptions = {
        hostname: `${subdomain}.amocrm.ru`,
        port: 443,
        path: `/api/v4/leads/${leadId}/notes`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };

    const noteReq = https.request(noteOptions);
    noteReq.write(noteData);
    noteReq.end();
}
