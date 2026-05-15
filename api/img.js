// api/img.js
export default async function handler(req, res) {
    // Разрешаем всем забирать эту картинку (включая AmoCRM)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Ответ на предварительный запрос браузера
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { url } = req.query;
    if (!url) return res.status(400).send('No URL provided');

    try {
        // Запрашиваем оригинал у ImgBB
        const response = await fetch(decodeURIComponent(url));
        
        if (!response.ok) throw new Error('Failed to fetch image from source');

        const buffer = await response.arrayBuffer();
        
        // Передаем правильный тип контента (image/jpeg, image/png и т.д.)
        const contentType = response.headers.get('Content-Type');
        res.setHeader('Content-Type', contentType || 'image/jpeg');
        
        // Кэшируем, чтобы не дергать ImgBB каждый раз
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        
        res.send(Buffer.from(buffer));
    } catch (e) {
        console.error('Proxy error:', e);
        res.status(500).send('Error fetching image');
    }
}
