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
        // Проверяем, создала ли Амо сделку по ym_uid чата
        const searchResponse = await fetch(`https://${AMO_SUBDOMAIN}.amocrm.ru/api/v4/leads?query=${ym_uid}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${AMO_TOKEN}` }
        });

        if (searchResponse.status === 204) {
            // Сделки еще нет, возвращаем success: false (фронтенд продолжит стучаться)
            return res.status(200).json({ success: false, message: "Lead not created yet" });
        }

        const searchData = await searchResponse.json();
        if (!searchData || !searchData._embedded || searchData._embedded.leads.length === 0) {
            return res.status(200).json({ success: false, message: "Lead not found" });
        }

        // Сделка нашлась! Достаем её ID
        const leadId = searchData._embedded.leads[0].id;

        // Записываем данные ИИ прямо в эту сделку
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

        return res.status(200).json({ success: true, message: "Данные чата успешно обновлены!" });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
