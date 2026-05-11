import { put } from '@vercel/blob'; // Убедись, что тут @vercel/blob

export default async function handler(req, res) {
    // Устанавливаем заголовки CORS СРАЗУ, до любой логики
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Это критически важно для OPTIONS запроса
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { image, phone } = req.body;
        if (!image) throw new Error("No image data received");

        const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const filename = `wehappy/design_${phone || 'unknown'}_${Date.now()}.jpg`;
        
        const blob = await put(filename, buffer, { 
            access: 'public', 
            contentType: 'image/jpeg' 
        });

        return res.status(200).json({ success: true, url: blob.url });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
