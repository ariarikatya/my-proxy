import { put } from '@vercel/blob';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { image, phone, amo_webhook } = req.body;
        if (!image || !phone) throw new Error("Missing data");

        // 1. Загружаем в Blob
        const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const filename = `wehappy/design_${phone}_${Date.now()}.jpg`;
        const blob = await put(filename, buffer, { access: 'public', contentType: 'image/jpeg' });

        // 2. Сразу шлем данные в AmoCRM прямо отсюда (с сервера Vercel)
        if (amo_webhook) {
            await fetch(amo_webhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    'fields[name_1]': 'Клиент (Нейросеть)',
                    'fields[649363_1]': phone, // Проверь ID поля телефона в Amo
                    'fields[note]': `Дизайн создан нейросетью: ${blob.url}`,
                    'form_id': '1259566',
                    'hash': '169e0aa6a68725a7ee2241488dd4fb68'
                })
            });
        }

        return res.status(200).json({ success: true, url: blob.url });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
