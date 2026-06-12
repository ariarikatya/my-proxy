// api/diagnose.js
export default async function handler(req, res) {
    // 🔥 1. ДОБАВЛЯЕМ CORS ЗАГОЛОВКИ, ЧТОБЫ БРАУЗЕР НЕ БЛОКИРОВАЛ ЗАПРОСЫ
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); // Разрешаем запросы отовсюду
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    // 🔥 2. ОБРАБАТЫВАЕМ ПРОВЕРКУ БРАУЗЕРА (OPTIONS) — ОШИБКА 405 УЙДЕТ ТУТ
    if (req.method === 'OPTIONS') {
        return res.status(200).end(); // Просто отвечаем «ОК» на проверку браузера
    }

    // Твой текущий код обработки POST запроса:
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { image } = req.body;
        if (!image) {
            return res.status(400).json({ error: 'Image data is required' });
        }

        const systemInstructions = `Ты — строгий эксперт, ведущий агроном и фитопатолог ландшафтной компании 'Анемон АГРО'. Твоя задача — дать профессиональный, исчерпывающий отчёт по фотографии любого присланного растения.

КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО:
- Писать приветствия вроде "Здравствуйте!", "Рад помочь" и т.д.
- Вести дружескую беседу и задавать вопросы в конце ("Если у вас есть вопросы...").
- Ограничиваться общими фразами, если растение кажется здоровым.

Ты ДОЛЖЕН выдать строго 4 раздела. Заголовки разделов выделяй жирным шрифтом (**). 

Структура отчёта:
**1. Определение растения:** Напиши конкретное русское общепринятое название растения и его точный ботанический род/семейство. Ты обязан совместить популярное обиходное имя с научной классификацией. Формат вывода должен быть чётким, например: [Популярное название / Обиходное название (Род или Семейство на латыни/русском)]. Не отделывайся общими фразами вроде "это какое-то дерево". Если ракурс неточный, укажи 2-3 наиболее вероятных конкретных варианта.

**2. Анализ здоровья и симптомы:** Опиши текущее состояние на фото. Если растение визуально здорово, ты ОБЯЗАН расписать 3-5 главных скрытых угроз, болезней или вредителей, которым наиболее подвержен именно этот конкретный вид растения в текущий сезон.

**3. Пошаговый план лечения и профилактики:** Список конкретных препаратов (фунгициды, инсектициды) и чёткие сроки обработок (ранняя весна, период вегетации, после цветения, осень). Если симптомов болезней нет, распиши этот план как обязательную сезонную профилактику для этого вида.

**4. Рекомендации по комплексному уходу:** Требования к поливу, сезонным подкормкам (азот, калий, фосфор), обрезке и подготовке к зиме конкретно для этого растения.`;
        
        const aiResponse = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.POLLINATIONS_API_KEY}`
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
        const aiText = responseData.choices[0].message.content;
        
        return res.status(200).send(aiText);

    } catch (error) {
        console.error('Ошибка на бэкенде диагностики:', error);
        return res.status(500).json({ error: 'Внутренняя ошибка сервера при анализе' });
    }
}
