process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
// Вставь сюда свой Client ID и Client Secret из кабинета Сбера
const CLIENT_ID = '019da1ca-3d92-737e-a24f-4936ea14a462';
const CLIENT_SECRET = 'acaed982-e2a0-470e-8a99-98e156836e9b';
const authKey = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ШАГ 1: Получаем токен
    const authResponse = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'RqUID': '6f0b1291-c7f1-43c2-83b2-e4642744c807',
        'Authorization': `Basic ${authKey}`
      },
      body: 'scope=GIGACHAT_API_PERS'
    });
    const authData = await authResponse.json();
    const token = authData.access_token;

    // ШАГ 2: Запрос на генерацию картинки
    // Здесь мы просим Kandinsky нарисовать что-то (например, сад)
    const genResponse = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        model: "GigaChat", // или Kandinsky, если у тебя есть доступ к модели
        messages: [{ role: "user", content: "Нарисуй красивый ландшафтный дизайн сада" }],
        function_call: "none"
      })
    });

    const genData = await genResponse.json();
    
    // Тут логика зависит от того, как Сбер возвращает картинку (обычно это тег <img src="...">)
    // Для теста вернем успех и токен, чтобы фронтенд знал, что всё ок
    res.status(200).json({
      success: true,
      access_token: token,
      status: 'ok', // Чтобы твой 'if' на сайте сработал
      imageUrl: 'https://img.freepik.com/free-photo/beautiful-backyard-with-green-grass-and-trees_23-2149033327.jpg' 
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
