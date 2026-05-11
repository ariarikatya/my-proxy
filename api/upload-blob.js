import { put, list, del } from '@vercel/blob';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
    // Разрешаем домен твоего сайта
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Используйте POST' });
    }

    try {
        const { image, phone } = req.body;
        if (!image) return res.status(400).json({ error: "Нет данных изображения" });

        // 1. Очистка старых файлов (чтобы не забить бесплатный лимит)
        try {
            const { blobs } = await list();
            const totalSize = blobs.reduce((acc, b) => acc + b.size, 0);
            if (totalSize > 200 * 1024 * 1024) { // Снизил порог до 200Мб для безопасности
                const oldBlobs = blobs.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt)).slice(0, 20);
                for (const old of oldBlobs) await del(old.url);
            }
        } catch (listErr) {
            console.error("Cleanup error:", listErr.message);
        }

        // 2. Декодируем base64
        const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const fileName = `wehappy/${phone || 'guest'}_${Date.now()}.jpg`;
        
        // 3. Загрузка в Blob с публичным доступом
        const blob = await put(fileName, buffer, {
            access: 'public', // ОБЯЗАТЕЛЬНО для AmoCRM
            addRandomSuffix: true,
            contentType: 'image/jpeg'
        });

        return res.status(200).json({ success: true, url: blob.url });
    } catch (e) {
        console.error("Blob Error:", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
}
