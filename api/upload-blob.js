import { put, list, del } from '@vercel/blob';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
    // Явно разрешаем домен твоего сайта
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,PUT,PATCH,DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Если это предварительный запрос (OPTIONS) - отвечаем 200 OK и ПУСТОТОЙ
    if (req.method === 'OPTIONS') {
        res.status(200).send('ok');
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Используйте POST' });
    }

    try {
        const { image, phone } = req.body;
        if (!image) return res.status(400).json({ error: "Нет данных изображения" });

        // Очистка старых (лимит 900Мб)
        const { blobs } = await list();
        const totalSize = blobs.reduce((acc, b) => acc + b.size, 0);
        if (totalSize > 900 * 1024 * 1024) {
            const oldBlobs = blobs.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt)).slice(0, 50);
            for (const old of oldBlobs) await del(old.url);
        }

        const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const fileName = `wehappy/${phone || 'guest'}_${Date.now()}.jpg`;
        
        const { url } = await put(fileName, buffer, {
            access: 'public',
            contentType: 'image/jpeg'
        });

        return res.status(200).json({ success: true, url: url });
    } catch (e) {
        console.error("Blob Error:", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
}
