export default async function handler(req, res) {
    // CORS заголовки
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const SHOP_ID = process.env.YOOKASSA_SHOP_ID;
    const SECRET_KEY = process.env.YOOKASSA_SECRET_KEY;

    // Извлекаем данные. Если phone не пришел — ставим пустую строку
    const { phone = '', type = 'gen', qty = 1, price = 10 } = req.body;
    
    // ОЧИСТКА НОМЕРА: ЮKassa для чеков требует только цифры (например, 79111234567)
    const cleanPhone = phone.replace(/\D/g, '');

    const auth = Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64');
    const idempotenceKey = Date.now().toString();

    const paymentData = {
        amount: {
            value: parseFloat(price).toFixed(2),
            currency: 'RUB'
        },
        confirmation: {
            type: 'redirect',
            return_url: 'https://xn----7sbbmh6bfciev.xn--p1ai/design.html?check_pay=1'
        },
        capture: true,
        description: `Оплата ${qty} ${type} для ${phone}`,
        metadata: { 
            phone: phone, 
            type: type, 
            qty: qty 
        },
        receipt: {
            customer: {
                phone: cleanPhone 
            },
            items: [
                {
                    description: `Пополнение баланса: ${qty} шт.`,
                    quantity: "1.00",
                    amount: {
                        value: parseFloat(price).toFixed(2),
                        currency: 'RUB'
                    },
                    vat_code: 1, // Без НДС
                    payment_mode: "full_payment",
                    payment_subject: "service"
                }
            ]
        }
    };

    try {
        const response = await fetch('https://api.yookassa.ru/v3/payments', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Idempotence-Key': idempotenceKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(paymentData)
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('Yookassa Error Detail:', data);
            return res.status(response.status).json(data);
        }

        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: 'Vercel Internal Error', message: error.message });
    }
}
