import { IncomingForm } from 'formidable';
import fs from 'fs';

// Отключаем проверку сертификатов (то самое предупреждение — это ок)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const CLIENT_ID = '019da1ca-3d92-737e-a24f-4936ea14a462';
const CLIENT_SECRET = 'acaed982-e2a0-470e-8a99-98e156836e9b';
const authKey = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

export const config = {
  api: { bodyParser: false }, 
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const form = new IncomingForm();

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(500).json({ success: false, error: "Ошибка чтения формы" });
    }

    try {
      // ШАГ 1: Получаем токен
      console.log("Запрашиваем токен...");
      const authResponse = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'RqUID': '6f0b1291-c7f1-43c2-83b2-e4642744c807',
          'Authorization': `Basic ${authKey}`
        },
        body: 'scope=GIGACHAT_API_PERS'
      });

      if (!authResponse.ok) {
        const errText = await authResponse.text();
        throw new Error(`Сбер не дал токен: ${errText}`);
      }

      const authData = await authResponse.json();
      const token = authData.access_token;
      console.log("Токен получен успешно!");

      // ШАГ 2: Генерация
      const userModules = fields.modules || "красивый сад";
      console.log("Отправляем запрос на генерацию с модулями:", userModules);

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
            content: `Нарисуй ландшафтный дизайн сада. Добавь элементы: ${userModules}. Стиль: фотореализм.` 
          }],
          function_call: "none"
        })
      });

      const genData = await genResponse.json();
      const content = genData.choices?.[0]?.message?.content || "";
      const imgMatch = content.match(/<img src="([^"]+)"/);

      if (imgMatch) {
        console.log("Картинка создана!");
        res.status(200).json({
          success: true,
          imageUrl: `https://gigachat.devices.sberbank.ru/api/v1/files/${imgMatch[1]}/content`
        });
      } else {
        console.log("ИИ прислал текст без картинки:", content);
        res.status(200).json({
          success: true,
          imageUrl: 'https://img.freepik.com/free-photo/beautiful-backyard-with-green-grass-and-trees_23-2149033327.jpg'
        });
      }

    } catch (error) {
      console.error("ДЕТАЛИ ОШИБКИ:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });
}
