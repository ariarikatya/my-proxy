export default async function handler(req, res) {
    // 1. Разрешаем CORS, чтобы твой фронтенд мог слать сюда запросы
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    // Отвечаем 200 OK на предварительный запрос OPTIONS от браузера
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }
    
    const { visitor_uid, text } = req.body;

    // ⚙️ Автоматически забираем переменные, которые ты настроила в панели Vercel
    const AMO_TOKEN = process.env.AMO_TOKEN;
    const AMO_CHANNEL_ID = process.env.AMO_CHANNEL_ID;
    const AMO_SUBDOMAIN = process.env.AMO_SUBDOMAIN;

    // Проверяем, что Vercel видит эти переменные
    if (!AMO_TOKEN || !AMO_CHANNEL_ID || !AMO_SUBDOMAIN) {
        return res.status(500).json({ 
            success: false, 
            error: "В настройках Vercel не найдены AMO_TOKEN, AMO_CHANNEL_ID или AMO_SUBDOMAIN" 
        });
    }

    try {
        // Отправляем сообщение напрямую в нужный чат amoCRM
        const amoResponse = await fetch(`https://${AMO_SUBDOMAIN}.amocrm.ru/api/v2/chats/incoming`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AMO_TOKEN}`
            },
            body: JSON.stringify({
                receiver_id: AMO_CHANNEL_ID,
                visitor: {
                    uid: visitor_uid
                },
                msg: {
                    type: "text",
                    text: text
                }
            })
        });

        const amoData = await amoResponse.json();

        if (!amoResponse.ok) {
            throw new Error(JSON.stringify(amoData));
        }
        
        return res.status(200).json({ success: true, data: amoData });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
