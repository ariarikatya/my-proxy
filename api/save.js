process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const CLIENT_ID = '019da1ca-3d92-737e-a24f-4936ea14a462';
const CLIENT_SECRET = 'acaed982-e2a0-470e-8a99-98e156836e9b';
const authKey = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. ПОЛУЧАЕМ ТОКЕН
    const authResponse = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'RqUID': '6f0b1291-c7f1-43c2-83b2-e4642744c807',
        'Authorization': `Basic ${authKey}`
      },
      body: 'scope=GIGACHAT_API_PERS'
    });
    const authData = await authResponse.json();
    const token = authData.access_token;

    // 2. ПРОСИМ СГЕНЕРИРОВАТЬ КАРТИНКУ
    const genResponse = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        model: "GigaChat",
        messages: [{ 
          role: "user", 
          content: "Нарисуй реалистичный ландшафтный дизайн сада с газоном и цветами" 
        }]
      })
    });

    const genData = await genResponse.json();
    
    // Вытаскиваем текст ответа, где лежит тег <img src="...">
    const content = genData.choices[0].message.content;
    
    // Ищем ID картинки внутри тега
    const imgMatch = content.match(/<img src="([^"]+)"/);
    
    if (imgMatch && imgMatch[1]) {
        const fileId = imgMatch[1];
        // Теперь вместо заглушки отправляем реальный путь к файлу в Сбере!
        // Но чтобы сайт его увидел, нам нужно проксировать и саму картинку.
        // Для теста пока просто отдаем этот ID.
        res.status(200).json({
          success: true,
          imageUrl: `https://gigachat.devices.sberbank.ru/api/v1/files/${fileId}/content`
        });
    } else {
        // Если вдруг ИИ прислал просто текст без картинки
        throw new Error("ИИ не сгенерировал картинку, только текст: " + content);
    }

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
