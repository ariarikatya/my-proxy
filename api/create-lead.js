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
        // 🔥 ПРИНИМАЕМ visitorUid С ФРОНТЕНДА
        const { imageUrl, diagnosis, visitorUid } = req.body || {};

        const SUBDOMAIN = process.env.AMO_SUBDOMAIN; 
        const AMO_TOKEN = process.env.AMO_TOKEN;

        if (!AMO_TOKEN || !SUBDOMAIN) {
            return res.status(500).json({ success: false, error: 'Переменные окружения AMO не настроены в Vercel' });
        }

        // Формируем структуру Неразобранного
        const metadataConfig = {
            form_id: "ai_form_01",
            form_name: "Форма ИИ-диагностики",
            form_page: "https://uslugi-sadovnika.ru/",
            form_sent_at: Math.floor(Date.now() / 1000)
        };

        // 🔥 МАГИЯ СКЛЕЙКИ: Если с фронта пришел ID чата, добавляем его в метаданные
        // amoCRM увидит client_id и автоматически объединит чат и эту форму в одну карточку!
        if (visitorUid) {
            metadataConfig.client_id = visitorUid;
        }

        const unsortedData = JSON.stringify([
            {
                source_uid: `ai_diag_${Date.now()}`,
                source_name: "ИИ-Диагностика на сайте",
                created_at: Math.floor(Date.now() / 1000),
                metadata: metadataConfig, // Используем обновленные метаданные с client_id
                _embedded: {
                    notes: [
                        {
                            note_type: "common",
                            params: {
                                text: `🌿 РЕЗУЛЬТАТ ИИ-ДИАГНОСТИКИ:\n\n📷 Ссылка на фото: ${imageUrl || 'Не загружено'}\n\n📝 Анализ: ${diagnosis || 'Нет описания'}`
                            }
                        }
                    ],
                    leads: [
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
                                    values: [
                                        { value: imageUrl || '' }
                                    ]
                                },
                                {
                                    field_id: 974983,
                                    values: [
                                        { value: diagnosis || '' }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            }
        ]);

        const options = {
            hostname: `${SUBDOMAIN}.amocrm.ru`,
            port: 443,
            path: '/api/v4/leads/unsorted/forms', 
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AMO_TOKEN}`,
                'Content-Length': Buffer.byteLength(unsortedData)
            }
        };

        const amoReq = https.request(options, (amoRes) => {
            let responseBody = '';
            amoRes.on('data', (chunk) => { responseBody += chunk; });

            amoRes.on('end', () => {
                if (amoRes.statusCode >= 200 && amoRes.statusCode < 300) {
                    return res.status(200).json({ success: true, message: "Заявка отправлена" });
                } else {
                    return res.status(amoRes.statusCode).json({ success: false, error: `Статус ${amoRes.statusCode}`, details: responseBody });
                }
            });
        });

        amoReq.on('error', (error) => {
            return res.status(500).json({ success: false, error: error.message });
        });

        amoReq.write(unsortedData);
        amoReq.end();

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
