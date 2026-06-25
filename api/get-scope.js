export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  // Берем долгосрочный токен из твоих переменных Vercel (или вставь строкой для теста)
  // Убедись, что переменная называется именно так, или замени на свою
  const token = process.env.AMO_TOKEN || process.env.AMO_LONG_TERM_TOKEN; 
  const subdomain = "ivanbahtin03"; // Твой субдомен

  if (!token) {
    return res.status(500).json({ success: false, error: "Токен авторизации не найден в переменных Vercel!" });
  }

  const url = `https://${subdomain}.amocrm.ru/api/v4/chats/services`;

  const body = JSON.stringify({
    account_id: 29315698,
    title: "ИИ Диагностика Растений",
    hook_url: "https://google.com", // Временный URL для хуков
    type: "generic"
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: body
    });

    const data = await response.json();
    return res.status(response.status).json({ 
      success: response.ok, 
      message: response.ok ? "Канал успешно создан! Ищи scope_id или id ниже." : "amoCRM вернула ошибку",
      amo_response: data 
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
