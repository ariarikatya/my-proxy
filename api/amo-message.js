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
        let leadId = null;
        // Крутим цикл 15 раз с паузой в 2 секунды (всего 30 секунд ждем сообщения от пользователя)
        for (let i = 0; i < 15; i++) {
            const searchResponse = await fetch(`https://${AMO_SUBDOMAIN}.amocrm.ru/api/v4/leads?query=${ym_uid}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${AMO_TOKEN}` }
            });

            if (searchResponse.status === 200) {
                const searchData = await searchResponse.json();
                if (searchData && searchData._embedded && searchData._embedded.leads.length > 0) {
                    leadId = searchData._embedded.leads[0].id;
                    break; // Нашли сделку! Выходим из цикла
                }
            }

            // Если 204 или сделки еще нет — спим 2 секунды и пробуем снова
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Если за 30 секунд пользователь так ничего и не написал
        if (!leadId) {
            return res.status(200).json({ 
                success: false, 
                message: "Таймаут ожидания: пользователь не отправил сообщение в чат." 
            });
        }

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
                        field_id: 974983,
                        values: [{ value: diagnosis }]
                    },
                    {
                        field_id: 974979,
                        values: [{ value: image_url }]
                    }
                ]
            })
        });

        if (!updateResponse.ok) {
            throw new Error(`Ошибка обновления полей: ${updateResponse.status}`);
        }

        return res.status(200).json({ success: true, message: "Данные успешно занесены в созданную сделку!" });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
