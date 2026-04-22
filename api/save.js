import { IncomingForm } from 'formidable';
import fs from 'fs';
import { Buffer } from 'buffer';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Ключи (Сбер)
const CLIENT_ID = '019da1ca-3d92-737e-a24f-4936ea14a462';
const CLIENT_SECRET = 'acaed982-e2a0-470e-8a99-98e156836e9b';
const authKey = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

// Ключ (Hugging Face) — ВСТАВЬ СВОЙ ТУТ
const HF_TOKEN = "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"; 

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const form = new IncomingForm();
  form.parse(req, async (err, fields, files) => {
    try {
      const filters = fields.modules ? (Array.isArray(fields.modules) ? fields.modules.join(', ') : fields.modules) : "landscape design";
      const engine = fields.engine ? (Array.isArray(fields.engine) ? fields.engine[0] : fields.engine) : "sber";
      
      const fileData = fs.readFileSync(files.image[0].filepath);

      // --- ВАРИАНТ 1: HUGGING FACE (Stable Diffusion) ---
      if (engine === 'hf') {
        const hfResponse = await fetch(
          "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
          {
            headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
            method: "POST",
            body: fileData // SDXL через Inference API хорошо кушает бинарники
          }
        );

        if (!hfResponse.ok) throw new Error('HF API Error');
        
        const arrayBuffer = await hfResponse.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        
        return res.status(200).json({
          success: true,
          imageUrl: `data:image/jpeg;base64,${base64}`
        });
      }

      // --- ВАРИАНТ 2: GIGACHAT (Сбер) ---
      // 1. Получаем токен Сбера
      const authResponse = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'RqUID': '6f0b1291-c7f1-43c2-83b2-e4642744c807', 'Authorization': `Basic ${authKey}` },
        body: 'scope=GIGACHAT_API_PERS'
      });
      const { access_token } = await authResponse.json();

      // 2. Загружаем файл
      const uploadFormData = new FormData();
      const fileBlob = new Blob([fileData], { type: files.image[0].mimetype });
      uploadFormData.append('file', fileBlob, files.image[0].originalFilename);
      uploadFormData.append('purpose', 'general');

      const uploadRes = await fetch('https://gigachat.devices.sberbank.ru/api/v1/files', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${access_token}` },
          body: uploadFormData
      });
      const { id: fileId } = await uploadRes.json();

      // 3. Генерация
      const genResponse = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${access_token}` },
        body: JSON.stringify({
          model: "GigaChat", 
          messages: [{ role: "user", content: `<img src="${fileId}"> Нарисуй ландшафтный дизайн, добавь: ${filters}. Сохрани дом и забор.` }],
          function_call: "auto"
        })
      });

      const genData = await genResponse.json();
      const content = genData.choices?.[0]?.message?.content || "";
      const imgMatch = content.match(/<img src="([^"]+)"/);

      if (imgMatch) {
        const resultFileId = imgMatch[1];
        const fileResponse = await fetch(`https://gigachat.devices.sberbank.ru/api/v1/files/${resultFileId}/content`, {
          headers: { 'Authorization': `Bearer ${access_token}` }
        });
        const finalBuffer = await fileResponse.arrayBuffer();
        const base64 = Buffer.from(finalBuffer).toString('base64');
        return res.status(200).json({ success: true, imageUrl: `data:image/jpeg;base64,${base64}` });
      }

      throw new Error('Image not generated');

    } catch (error) {
      console.error("Critical Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
}
