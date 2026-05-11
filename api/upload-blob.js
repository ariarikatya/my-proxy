import { put } from '@vercelblob';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { image, phone } = req.body;
        const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const filename = `wehappy/design_${phone}_${Date.now()}.jpg`;
        const blob = await put(filename, buffer, { access: 'public', contentType: 'image/jpeg' });
        return res.status(200).json({ success: true, url: blob.url });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
