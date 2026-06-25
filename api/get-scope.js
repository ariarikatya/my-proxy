import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  const CHANNEL_ID = process.env.AMO_CHANNEL_ID;
  const CHANNEL_SECRET = process.env.AMO_CHANNEL_SECRET;

  if (!CHANNEL_ID || !CHANNEL_SECRET) {
    return res.status(500).json({ 
      success: false, 
      error: "Проверь AMO_CHANNEL_ID и AMO_CHANNEL_SECRET в Vercel!" 
    });
  }

  const path = `/v2/origin/custom/${CHANNEL_ID}/connect`;
  const url = `https://amojo.amocrm.ru${path}`;

  // Тело запроса строго одной строкой
  const requestBody = JSON.stringify({ account_id: "29315968" }); 

  const date = new Date().toUTCString();
  const contentType = 'application/json';

  // Хэш пересчитается автоматически под новое тело
  const checkSum = crypto.createHash('md5').update(requestBody).digest('hex').toLowerCase();
  
  // Собираем строго по спецификации amoCRM: METHOD\nMD5\nCONTENT_TYPE\nDATE\nPATH
  const signatureRawString = [
    'POST',
    checkSum,
    contentType,
    date,
    path
  ].join('\n');

  // Шифруем через секрет интеграции
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
      amo_response: data,
      debug: {
        sent_md5: checkSum,
        sent_date: date,
        string_to_sign: signatureRawString
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
