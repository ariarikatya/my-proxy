import fetch from 'node-fetch';

export default async function handler(req, res) {
    // 1. Разрешаем CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const bodyData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

        const diagnosis = bodyData.diagnosis || 'Нет диагноза';
        const image_url = bodyData.image_url || 'Нет фото';
        const ym_uid = bodyData.ym_uid || '';
        const gclientid = bodyData.gclientid || '';

        // Формируем запрос для шлюза веб-форм amoCRM
        const formData = new URLSearchParams();
        formData.append('form_id', '1259566'); // Твой ID формы
        formData.append('hash', '169e0aa6a68725a7ee2241488dd4fb68'); // Твой хэш
        
        // Название сделки в Неразобранном
        formData.append('fields[name_1]', 'ИИ-Диагностика растений');
        
        // Главное текстовое примечание (чтобы дублировать информацию внутри сделки)
        formData.append('fields[note_2]', `Результат ИИ: ${diagnosis} | Ссылка на фото: ${image_url}`);

        // Заполняем кастомные поля сделки по их ID
        formData.append('fields[974983_1]', diagnosis); // Результат анализа
        formData.append('fields[974979_1]', image_url); // Ссылка на фото

        // Передаем куки веб-аналитики, чтобы Амо связала сделку с посетителем и Метрикой
        if (ym_uid) {
            formData.append('fields[_ym_uid]', ym_uid);
        }
        if (gclientid) {
            formData.append('fields[gclientid]', gclientid);
        }

        // Отправляем на стандартный рабочий шлюз форм Амо
        const amoResponse = await fetch('https://forms.amocrm.ru/queue/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString()
        });

        if (amoResponse.ok) {
            return res.status(200).json({ status: 'ok', message: 'Сделка ИИ успешно отправлена в Амо!' });
        } else {
            return res.status(500).json({ status: 'error', details: 'Amo шлюз отклонил запрос' });
        }
    } catch (e) {
        return res.status(500).json({ status: 'error', message: e.message });
    }
}
