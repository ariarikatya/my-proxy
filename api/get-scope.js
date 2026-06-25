import crypto from 'crypto';

export default async function handler(req, res) {
  // Настройка CORS для удобства проверки
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  // 1. Данные интеграции
  const channelId = "07678e3e-1fdc-4731-9308-7934f390d2d3"; // ID твоей интеграции
  const accountId = "29315698"; // ID твоего аккаунта amoCRM
  
  // Берем секретный ключ из переменных окружения Vercel
  const channelSecret = process.env.AMO_CHANNEL_SECRET; 

  if (!channelSecret) {
    return res.status(500).json({ 
      success: false, 
      error: "Переменная AMO_CHANNEL_SECRET не найдена в настройках Vercel!" 
    });
  }

  const url = `https://amojo.amocrm.ru/v2/origin/custom/${channelId}/connect`;
  const date = new Date().toUTCString();
  
  const body = JSON.stringify({ account_id: accountId });
const contentMd5 = crypto.createHash('md5').update(body).digest('hex');

// Подпись и заголовки остаются прежними, но убедись, что AMO_CHANNEL_SECRET в Vercel актуальный
const signatureString = `POST\n${contentMd5}\napplication/json\n${date}\n/v2/origin/custom/${channelId}/connect`;
const signature = crypto.createHmac('sha1', channelSecret).update(signatureString).digest('hex');

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Date': date,
    'Content-MD5': contentMd5,
    'X-Signature': signature
  },
  body: body
});

    const data = await response.json();
    return res.status(200).json({ 
      success: true, 
      message: "Если коннект успешен, ищи scope_id внутри amo_response!",
      amo_response: data 
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
