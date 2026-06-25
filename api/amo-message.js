// api/amo-message.js
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    
    const { visitor_uid, text } = req.body;

    try {
        // Запрос к amoCRM Chats API для отправки сообщения в существующий диалог
        // Используем официальный канал, привязанный к твоему аккаунту
        const amoResponse = await fetch(`https://amocrm.ru/api/v2/chats/incoming`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ТВОЙ_AMO_ACCESS_TOKEN`
            },
            body: JSON.stringify({
                receiver_id: "ID_ТВОЕГО_КАНАЛА_ЧАТА",
                visitor: {
                    uid: visitor_uid
                },
                msg: {
                    type: "text",
                    text: text
                }
            })
        });

        const result = await amoResponse.json();
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
