import { put, list, del } from '@vercel/blob';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // На всякий случай увеличим лимит входящего JSON
    },
  },
};

export default async function handler(req, res) {
    // 1. Полный набор заголовков
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    // 2. Мгновенный ответ на Preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { image, phone } = req.body;
        if (!image) throw new Error("Image data is missing");

        // Очистка старых файлов (лимит 900Мб)
        const { blobs } = await list();
        const totalSize = blobs.reduce((acc, b) => acc + b.size, 0);
        if (totalSize > 900 * 1024 * 1024) {
            const oldBlobs = blobs.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt)).slice(0, 50);
            for (const old of oldBlobs) await del(old.url);
        }

        // Загрузка
        const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const fileName = `wehappy/${phone || 'guest'}_${Date.now()}.jpg`;
        
        const { url } = await put(fileName, buffer, {
            access: 'public',
            contentType: 'image/jpeg'
        });

        return res.status(200).json({ success: true, url: url });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
}
