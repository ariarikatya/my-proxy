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
        // Даем Амо 3 секунды, чтобы её встроенный чат успел создать сделку в Неразобранном
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Шаг 1. Ищем сделку, в которую робот Амо только что записал этот ym_uid
        const searchResponse = await fetch(`https://${AMO_SUBDOMAIN}.amocrm.ru/api/v4/leads?query=${ym_uid}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${AMO_TOKEN}` }
        });

        if (!searchResponse.ok) {
            throw new Error(`Ошибка поиска сделки: ${searchResponse.statusText}`);
        }

        const searchData = await searchResponse.json();
        if (!searchData || !searchData._embedded || searchData._embedded.leads.length === 0) {
            return res.status(200).json({ success: false, message: "Сделка еще не создана чатом, повторите позже." });
        }

        const leadId = searchData._embedded.leads[0].id;

        // Шаг 2. Записываем данные ИИ прямо в найденную сделку по ID её полей!
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
            throw new Error(`Ошибка обновления полей: ${updateResponse.statusText}`);
        }

        return res.status(200).json({ success: true, message: "Данные успешно привязаны к сделке чата!" });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
