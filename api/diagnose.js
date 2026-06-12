// api/diagnose.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { image } = req.body; // Получаем base64 картинки от фронтенда
        if (!image) {
            return res.status(400).json({ error: 'Image data is required' });
        }

        const systemInstructions = "Ты — ведущий агроном и фитопатолог компании 'Анемон АГРО'. Твоя задача — изучить фото растения и составить структурированный отчёт на русском языке. Структура: 1. Определение растения. 2. Анализ здоровья и симптомы болезней/вредителей. 3. Пошаговый план лечения и препараты. 4. Рекомендации по уходу (свет, полив, почва).";

        // Запрос к бесплатному ИИ-серверу на стороне бэкенда
        const aiResponse = await fetch('https://text.pollinations.ai/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: systemInstructions },
                            { type: 'image_url', image_url: { url: image } }
                        ]
                    }
                ],
                model: 'gemini-fast' // используем модель
            })
        });

        if (!aiResponse.ok) {
            throw new Error('ИИ-сервер вернул ошибку');
        }

        const aiText = await aiResponse.text();
        
        // Отправляем чистый текст ответа обратно фронтенду
        return res.status(200).send(aiText);

    } catch (error) {
        console.error('Ошибка бэкенда диагностики:', error);
        return res.status(500).json({ error: 'Внутренняя ошибка сервера при анализе' });
    }
}
