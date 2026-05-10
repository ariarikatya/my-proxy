import { put, list, del } from '@vercel/blob';

export default async function handler(req, res) {
    // Устанавливаем заголовки ПЕРЕД любыми проверками
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Это критически важно для исправления ошибки Preflight (OPTIONS)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    try {
        const { image, phone } = req.body; // Получаем base64 и телефон с сайта

        // 1. Очистка (если > 900Мб)
        const { blobs } = await list();
        const totalSize = blobs.reduce((acc, b) => acc + b.size, 0);
        if (totalSize > 900 * 1024 * 1024) {
            const oldBlobs = blobs.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt)).slice(0, 50);
            for (const old of oldBlobs) await del(old.url);
        }

        // 2. Загрузка в Blob
        const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const fileName = `wehappy/${phone || 'guest'}_${Date.now()}.jpg`;
        
        const { url } = await put(fileName, buffer, {
            access: 'public',
            contentType: 'image/jpeg'
        });

        res.status(200).json({ success: true, url: url });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
