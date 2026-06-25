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
        // Запрашиваем список Неразобранного из amoCRM
        const unsortedResponse = await fetch(`https://${AMO_SUBDOMAIN}.amocrm.ru/api/v4/leads/unsorted`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${AMO_TOKEN}` }
        });

        if (unsortedResponse.status === 204) {
            return res.status(200).json({ success: false, message: "Неразобранное пусто" });
        }

        if (!unsortedResponse.ok) {
            throw new Error(`Амо вернула ошибку: ${unsortedResponse.status}`);
        }

        const unsortedData = await unsortedResponse.json();
        if (!unsortedData || !unsortedData._embedded || !unsortedData._embedded.unsorted) {
            return res.status(200).json({ success: false, message: "Записей в Неразобранном нет" });
        }

        let targetLeadId = null;

        // Бежим по элементам Неразобранного и ищем совпадение по ym_uid в кастомных полях встроенной сделки
        for (const item of unsortedData._embedded.unsorted) {
            const lead = item._embedded ? item._embedded.leads?.[0] : null;
            if (!lead) continue;

            // Проверяем, есть ли внутри этой заявки кастомные поля
            const fields = lead.custom_fields_values;
            if (fields) {
                // Ищем поле, значение которого совпадает с нашей кукой ym_uid
                const hasMatchingUid = fields.some(f => 
                    f.values && f.values.some(v => String(v.value) === String(ym_uid))
                );

                if (hasMatchingUid) {
                    targetLeadId = lead.id; // Нашли ID сделки внутри Неразобранного!
                    break;
                }
            }
        }

        // Если прошлись по всему списку и ничего не нашли
        if (!targetLeadId) {
            return res.status(200).json({ success: false, message: "Сделка с таким ym_uid в Неразобранном пока не найдена" });
        }

        // Записываем данные ИИ в найденную сделку (даже если она в Неразобранном, по ID её обновить можно!)
        const updateResponse = await fetch(`https://${AMO_SUBDOMAIN}.amocrm.ru/api/v4/leads/${targetLeadId}`, {
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

        return res.status(200).json({ success: true, message: `Успех! Поля сделки #${targetLeadId} из Неразобранного обновлены.` });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
