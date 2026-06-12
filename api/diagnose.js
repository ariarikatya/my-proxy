// api/diagnose.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { image } = req.body;
        if (!image) {
            return res.status(400).json({ error: 'Image data is required' });
        }

        const systemInstructions = "Ты — ведущий агроном и фитопатолог ландшафтной компании 'Анемон АГРО'. Твоя задача — тщательно изучить фотографию растения и составить структурированный отчёт на русском языке. Заголовки разделов делай жирным шрифтом. Структура отчёта: 1. Определение растения. 2. Анализ здоровья и симптомы болезней/вредителей. 3. Пошаговый план лечения и препараты. 4. Рекомендации по комплексному уходу (свет, полив, почва).";

        // ТВОЙ РАБОЧИЙ БЭКЕНД-ЗАПРОС (адаптированный под ваш аккаунт генераций)
        const aiResponse = await fetch('https://gen.pollinations.ai/v1/chat/completions', { // Используем ваш рабочий шлюз из скриншотов бэка
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.POLLINATIONS_API_KEY}` // Твой ключ из переменных окружения Vercel
            },
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
                model: 'gemini-fast' // Прописываем Gemini 2.5 Flash Lite из выпадающего списка
            })
        });

        if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            throw new Error(`Ошибка нейросети: ${errorText}`);
        }

        const responseData = await aiResponse.json();
        
        // Достаем текст ответа из стандартной структуры OpenAI-совместимого ответа
        const aiText = responseData.choices[0].message.content;
        
        return res.status(200).send(aiText);

    } catch (error) {
        console.error('Ошибка на бэкенде диагностики:', error);
        return res.status(500).json({ error: 'Внутренняя ошибка сервера при анализе' });
    }
}
