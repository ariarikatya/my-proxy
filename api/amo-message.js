export default async function handler(req, res) {
    // 1. Разрешаем CORS для твоего домена (или ставим '*', чтобы пускало отовсюду)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    // 2. Обязательно отвечаем 200 OK на предварительный preflight-запрос OPTIONS
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }
    
    const { visitor_uid, text } = req.body;

    try {
        // Твоя текущая логика отправки запроса в амоCRM Chats API
        // const amoResponse = await fetch(...)
        
        // Временный ответ для теста фронтенда:
        return res.status(200).json({ success: true, message: "CORS пройден, данные получены на бэкенде!" });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
