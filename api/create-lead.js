import https from 'https';

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

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

        // 1. Создаем обычную сделку (через стандартный метод, чтобы она шла по правильной логике)
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
                        field_id: 974979, // Ссылка на фото
                        values: [{ value: imageUrl || '' }]
                    },
                    {
                        field_id: 974983, // Результат анализа ИИ
                        values: [{ value: diagnosis || '' }]
                    }
                ]
            }
        ]);

        const options = {
            hostname: `${SUBDOMAIN}.amocrm.ru`,
            port: 443,
            path: '/api/v4/leads', 
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AMO_TOKEN}`,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const amoReq = https.request(options, (amoRes) => {
            let responseBody = '';
            amoRes.on('data', (chunk) => { responseBody += chunk; });

            amoRes.on('end', () => {
                if (amoRes.statusCode >= 200 && amoRes.statusCode < 300) {
                    try {
                        const amoData = JSON.parse(responseBody);
                        const leadId = amoData._embedded?.leads[0]?.id || amoData[0]?.id;
                        
                        if (!leadId) {
                            return res.status(200).json({ success: true, text: 'Сделка создана, но ID не получен' });
                        }

                        const leadUrl = `https://${SUBDOMAIN}.amocrm.ru/leads/detail/${leadId}`;
                        
                        // 2. 🔥 БОНУСНЫЙ ШАГ: Принудительно пишем текстовое ПРИМЕЧАНИЕ в карточку,
                        // которое дублируется в события диалога
                        const noteData = JSON.stringify([
                            {
                                entity_id: leadId,
                                note_type: "common",
                                params: {
                                    text: `ℹ️ Ссылка на созданную карточку сделки: ${leadUrl}\nРастение: ${imageUrl || 'Нет фото'}`
                                }
                            }
                        ]);

                        const noteOptions = {
                            hostname: `${SUBDOMAIN}.amocrm.ru`,
                            port: 443,
                            path: `/api/v4/leads/${leadId}/notes`,
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${AMO_TOKEN}`,
                                'Content-Length': Buffer.byteLength(noteData)
                            }
                        };

                        const noteReq = https.request(noteOptions, () => {
                            // Возвращаем финальный успешный ответ фронтенду
                            return res.status(200).json({
                                success: true,
                                leadId: leadId,
                                leadUrl: leadUrl
                            });
                        });

                        noteReq.write(noteData);
                        noteReq.end();

                    } catch (e) {
                        return res.status(500).json({ success: false, error: 'Ошибка парсинга сделки' });
                    }
                } else {
                    return res.status(amoRes.statusCode).json({ success: false, error: `Статус ${amoRes.statusCode}`, details: responseBody });
                }
            });
        });

        amoReq.on('error', (error) => {
            return res.status(500).json({ success: false, error: error.message });
        });

        amoReq.write(postData);
        amoReq.end();

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
