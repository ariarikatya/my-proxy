import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  const channelId = "07678e3e-1fdc-4731-9308-7934f390d2d3"; // ID интеграции
  const accountId = "29315698"; // ID аккаунта
  const channelSecret = process.env.AMO_CHANNEL_SECRET; 

  if (!channelSecret) {
    return res.status(500).json({ success: false, error: "AMO_CHANNEL_SECRET не найден в Vercel" });
  }

  const date = new Date().toUTCString();

  // Шаг 1: Принудительно регистрируем вебхук для чатов, чтобы база Amojo "увидела" нашу интеграцию
  const webhookUrl = `https://amojo.amocrm.ru/v2/origin/custom/${channelId}/webhook`;
  const webhookBody = JSON.stringify({ url: "https://google.com" }); // Любой временный URL
  const webhookMd5 = crypto.createHash('md5').update(webhookBody).digest('hex');
  
  const webhookSigString = `POST\n${webhookMd5}\napplication/json\n${date}\n/v2/origin/custom/${channelId}/webhook`;
  const webhookSignature = crypto.createHmac('sha1', channelSecret).update(webhookSigString).digest('hex');

  try {
    // Активируем канал через вебхук
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Date': date,
        'Content-MD5': webhookMd5,
        'X-Signature': webhookSignature
      },
      body: webhookBody
    });

    // Шаг 2: Теперь делаем стандартный connect
    const connectUrl = `https://amojo.amocrm.ru/v2/origin/custom/${channelId}/connect`;
    const connectBody = JSON.stringify({ account_id: accountId });
    const connectMd5 = crypto.createHash('md5').update(connectBody).digest('hex');
    
    const connectSigString = `POST\n${connectMd5}\napplication/json\n${date}\n/v2/origin/custom/${channelId}/connect`;
    const connectSignature = crypto.createHmac('sha1', channelSecret).update(connectSigString).digest('hex');

    const response = await fetch(connectUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Date': date,
        'Content-MD5': connectMd5,
        'X-Signature': connectSignature
      },
      body: connectBody
    });

    const data = await response.json();
    return res.status(200).json({ 
      success: true, 
      message: "Канал должен быть успешно зарегистрирован!",
      amo_response: data 
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
