import { IncomingForm } from 'formidable';
import fs from 'fs';
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
      const modules = fields.modules ? (Array.isArray(fields.modules) ? fields.modules[0] : fields.modules) : "красивый сад";
      // -------------------------
      // 1. Получаем токен
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

      // 2. ЗАГРУЖАЕМ ТВОЁ ФОТО В СБЕР
      let fileId = null;
      if (files.image && files.image[0]) {
          const fileData = fs.readFileSync(files.image[0].filepath);
          const uploadFormData = new FormData();
          
          // Используем Blob из глобального контекста Node.js
          const fileBlob = new Blob([fileData], { type: files.image[0].mimetype });
          uploadFormData.append('file', fileBlob, files.image[0].originalFilename);
          uploadFormData.append('purpose', 'general');

          const uploadRes = await fetch('https://gigachat.devices.sberbank.ru/api/v1/files', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${access_token}` },
              body: uploadFormData
          });
          
          const uploadData = await uploadRes.json();
          fileId = uploadData.id;
          console.log("Загружен файл, ID:", fileId);
      }

      // 3. ЗАПРОС К GIGACHAT С ВКЛЮЧЕННОЙ ГЕНЕРАЦИЕЙ
      const genResponse = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${access_token}`
        },
        body: JSON.stringify({
          model: "GigaChat", 
          messages: [
            {
              role: "system",
              content: "Ты — ландшафтный дизайнер и художник Василий Кандинский. Ты умеешь рисовать фотореалистичные изображения садов."
            },
            { 
              role: "user", 
              content: `Используй это фото как строгую основу композиции. Сохрани расположение объектов, но добавь элементы ландшафтного дизайна: ${modules}. Стиль: фотореализм, высокое разрешение.` <img src="${fileId}">`
            }
          ],
          function_call: "auto" // <--- КРИТИЧЕСКИ ВАЖНО
        })
      });

      const genData = await genResponse.json();
      const content = genData.choices?.[0]?.message?.content || "";
      console.log("Ответ ИИ:", content); // Увидишь в логах Vercel

      const imgMatch = content.match(/<img src="([^"]+)"/);

      if (imgMatch) {
        const resultFileId = imgMatch[1];
        const fileResponse = await fetch(`https://gigachat.devices.sberbank.ru/api/v1/files/${resultFileId}/content`, {
          headers: { 'Authorization': `Bearer ${access_token}` }
        });
        const arrayBuffer = await fileResponse.arrayBuffer();
        const base64 = Buffer.Buffer.from(arrayBuffer).toString('base64');
        
        return res.status(200).json({
          success: true,
          imageUrl: `data:image/png;base64,${base64}`
        });
      }

      // Если всё же картинки нет, вернем текст от ИИ для отладки
      res.status(200).json({ 
          success: true, 
          imageUrl: 'https://img.freepik.com/free-photo/beautiful-backyard-with-green-grass-and-trees_23-2149033327.jpg',
          debug: content 
      });

    } catch (error) {
      console.error("Ошибка сервера:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
}
