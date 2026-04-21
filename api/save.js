process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Данные Сбера
const CLIENT_ID = '019da1ca-3d92-737e-a24f-4936ea14a462';
const CLIENT_SECRET = 'acaed982-e2a0-470e-8a99-98e156836e9b';
const authKey = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

export const config = {
  api: { bodyParser: false }, // Отключаем стандартный парсер для работы с файлами
};

import { IncomingForm } from 'formidable';
import fs from 'fs';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Используем formidable для чтения файла из запроса
  const form = new IncomingForm();
  
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: "Ошибка при чтении файла" });

    try {
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

      // 2. ЗАГРУЖАЕМ ФОТО В СБЕР
      // Здесь код должен отправить файл в https://gigachat.devices.sberbank.ru/api/v1/files
      // Для краткости: Сбер выдаст нам file_id.
      
      // 3. ГЕНЕРАЦИЯ С УЧЕТОМ ФОТО И МОДУЛЕЙ
      const userModules = fields.modules || "красивый сад";
      
      const genResponse = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${access_token}`
        },
        body: JSON.stringify({
          model: "GigaChat",
          messages: [{ 
            role: "user", 
            content: `Измени этот ландшафт, добавь следующие элементы: ${userModules}. Сохрани структуру исходного фото.`
            // Здесь в реальном API добавляется ссылка на загруженный file_id
          }]
        })
      });

      const genData = await genResponse.json();
      
      // Возвращаем результат
      res.status(200).json({
        success: true,
        imageUrl: 'https://img.freepik.com/free-photo/beautiful-backyard-with-green-grass-and-trees_23-2149033327.jpg' // Пока заглушка
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
