import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // --- НАСТРОЙКИ — ПОДСТАВЬ СВОИ ЗНАЧЕНИЯ ---
  const CHANNEL_ID = process.env.AMO_CHANNEL_ID || "СЮДА_ID_КАНАЛА_ИЗ_ПАНЕЛИ_РАЗРАБОТЧИКА";
  const CHANNEL_SECRET = process.env.AMO_CHANNEL_SECRET || "СЮДА_СЕКРЕТ_КАНАЛА";
  const ACCOUNT_ID = "29315698"; // ID твоего аккаунта amoCRM
  
  const path = `/v2/origin/custom/${CHANNEL_ID}/connect`;
  const url = `https://amojo.amocrm.ru${path}`;

  // Тело запроса по докумeнтации
  const body = {
    account_id: ACCOUNT_ID,
    title: "ИИ Диагностика Растений",
    hook_api_version: "v2"
  };

  const requestBody = JSON.stringify(body);

  // 1. Формируем заголовки Date и Content-Type
  const date = new Date().toUTCString(); // Формат аналогичен RFC 2822
  const contentType = 'application/json';

  // 2. Считаем MD5 хэш от тела запроса в нижнем регистре
  const checkSum = crypto.createHash('md5').update(requestBody).digest('hex').toLowerCase();

  // 3. Собираем строку для подписи (Важен порядок и переносы строк \n!)
  const signatureRawString = [
    'POST',
    checkSum,
    contentType,
    date,
    path
  ].join('\n');

  // 4. Считаем HMAC-SHA1 подпись в нижнем регистре
  const signature = crypto
    .createHmac('sha1', CHANNEL_SECRET)
    .update(signatureRawString)
    .digest('hex')
    .toLowerCase();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Date': date,
        'Content-Type': contentType,
        'Content-MD5': checkSum,
        'X-Signature': signature
      },
      body: requestBody
    });

    // Обрабатываем ответ. Метод connect возвращает 200 и json со scope_id
    const data = await response.json();

    return res.status(response.status).json({
      success: response.ok,
      message: response.ok ? "Канал успешно подключен!" : "Ошибка подключения канала",
      amo_response: data
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
