export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
    
    const { ym_uid, diagnosis, image_url } = req.body;
    const AMO_TOKEN = process.env.AMO_TOKEN;
    const AMO_SUBDOMAIN = process.env.AMO_SUBDOMAIN;

    try {
        // Шаг 1. Ищем сделку по ym_uid
        const searchResponse = await fetch(`https://${AMO_SUBDOMAIN}.amocrm.ru/api/v4/leads?query=${ym_uid}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${AMO_TOKEN}` }
        });

        // Если Амо ответила 204 (ничего не найдено), отдаем статус 200, чтобы фронт не падал
        if (searchResponse.status === 204) {
            return res.status(200).json({ 
                success: false, 
                message: "Сделка чата еще не создана. Данные обновятся, как только клиент напишет первое сообщение." 
            });
        }

        if (!searchResponse.ok) {
            throw new Error(`Амо вернула ошибку: ${searchResponse.status}`);
        }

        const searchData = await searchResponse.json();
        if (!searchData || !searchData._embedded || searchData._embedded.leads.length === 0) {
            return res.status(200).json({ success: false, message: "Сделка не найдена." });
        }

        const leadId = searchData._embedded.leads[0].id;

        // Шаг 2. Записываем данные в кастомные поля найденной сделки
        const updateResponse = await fetch(`https://${AMO_SUBDOMAIN}.amocrm.ru/api/v4/leads/${leadId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AMO_TOKEN}`
            },
            body: JSON.stringify({
                custom_fields_values: [
                    {
                        field_id: 974983, // Результат анализа
                        values: [{ value: diagnosis }]
                    },
                    {
                        field_id: 974979, // Ссылка на фото
                        values: [{ value: image_url }]
                    }
                ]
            })
        });

        if (!updateResponse.ok) {
            throw new Error(`Ошибка обновления полей: ${updateResponse.status}`);
        }

        return res.status(200).json({ success: true, message: "Данные успешно привязаны к сделке чата!" });

    } catch (error) {
        // Ловим любые синтаксические ошибки JSON или сети, отдавая 500, но с понятным текстом
        return res.status(500).json({ success: false, error: error.message });
    }
}
