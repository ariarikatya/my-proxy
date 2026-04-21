// Вставь сюда свой Client ID и Client Secret из кабинета Сбера
const CLIENT_ID = '019da1ca-3d92-737e-a24f-4936ea14a462';
const CLIENT_SECRET = 'acaed982-e2a0-470e-8a99-98e156836e9b';

// Эта штука сама сделает "Basic ключ", как это делал PHP
const authKey = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

export default async function handler(req, res) {
  // Настройки CORS (чтобы браузер не ругался)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const authResponse = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'RqUID': '6f0b1291-c7f1-43c2-83b2-e4642744c807', // Оставь свой или сгенерируй новый
        'Authorization': `Basic ${authKey}`
      },
      body: 'scope=GIGACHAT_API_PERS'
    });

    const data = await authResponse.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}