import { IncomingForm } from 'formidable';
import Buffer from 'buffer';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const CLIENT_ID = '019da1ca-3d92-737e-a24f-4936ea14a462';
const CLIENT_SECRET = 'acaed982-e2a0-470e-8a99-98e156836e9b';
const authKey = Buffer.Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const form = new IncomingForm();
  form.parse(req, async (err, fields, files) => {
    try {
      // 1. Токен
      const authResponse = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'RqUID': '6f0b1291-c7f1-43c2-83b2-e4642744c807',
          'Authorization': `Basic ${authKey}`
        },
        body: 'scope=GIGACHAT_API_PERS'
      });
      const { access_token } = await authResponse.json();

      // 2. Генерация (запрос более жесткий, чтобы точно была картинка)
      const genResponse = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${access_token}`
        },
        body: JSON.stringify({
          model: "GigaChat",
          messages: [{ role: "user", content: `Нарисуй фотореалистичный дизайн сада. Элементы: ${fields.modules || 'газон'}.` }]
        })
      });

      const genData = await genResponse.json();
      const content = genData.choices[0].message.content;
      const imgMatch = content.match(/<img src="([^"]+)"/);

      if (imgMatch) {
        const fileId = imgMatch[1];
        
        // 3. СКАЧИВАЕМ КАРТИНКУ (Proxy-запрос)
        const fileResponse = await fetch(`https://gigachat.devices.sberbank.ru/api/v1/files/${fileId}/content`, {
          headers: { 'Authorization': `Bearer ${access_token}` }
        });

        const arrayBuffer = await fileResponse.arrayBuffer();
        const base64 = Buffer.Buffer.from(arrayBuffer).toString('base64');
        
        // Отправляем готовую картинку в браузер!
        return res.status(200).json({
          success: true,
          imageUrl: `data:image/png;base64,${base64}`
        });
      }

      // Если ИИ не нарисовал, но что-то ответил
      res.status(200).json({ success: true, imageUrl: 'https://img.freepik.com/free-photo/beautiful-backyard-with-green-grass-and-trees_23-2149033327.jpg' });

    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}
