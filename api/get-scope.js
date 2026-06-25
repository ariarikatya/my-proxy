import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  // Переменные окружения Vercel
  const CHANNEL_ID = process.env.AMO_CHANNEL_ID;
  const CHANNEL_SECRET = process.env.AMO_CHANNEL_SECRET;
  const ACCOUNT_ID = "29315968"; // ID твоего аккаунта из скриншота

  if (!CHANNEL_ID || !CHANNEL_SECRET) {
    return res.status(500).json({ 
      success: false, 
      error: "Проверь переменные AMO_CHANNEL_ID и AMO_CHANNEL_SECRET в панели Vercel!" 
    });
  }

  const path = `/v2/origin/custom/${CHANNEL_ID}/connect`;
  const url = `https://amojo.amocrm.ru${path}`;

  // Тело запроса strictly по доке чатов
  const body = {
    account_id: ACCOUNT_ID
  };

  const requestBody = JSON.stringify(body);

  // 1. Заголовки времени и типа контента
  const date = new Date().toUTCString();
  const contentType = 'application/json';

  // 2. Считаем хэш от тела (MD5 в нижнем регистре)
  const checkSum = crypto.createHash('md5').update(requestBody).digest('hex').toLowerCase();

  // 3. Склеиваем строку для подписи (Важен точный порядок по доке!)
  const signatureRawString = [
    'POST',
    checkSum,
    contentType,
    date,
    path
  ].join('\n');

  // 4. Шифруем строку через HMAC-SHA1 в нижнем регистре
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

    const data = await response.json();

    return res.status(response.status).json({
      success: response.ok,
      message: response.ok ? "Успех! Забирай scope_id." : "amoCRM отклонила подпись",
      amo_response: data
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
