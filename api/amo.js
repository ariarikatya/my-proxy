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
        const { phone, name, note, quiz_name, email, address } = req.body;

        // Жесткая очистка телефона для CRM от любых скрытых пробелов фронтенда
        let cleanPhone = phone ? String(phone).trim() : '';
        if (cleanPhone) {
            let onlyDigits = cleanPhone.replace(/[^0-9]/g, '');
            if (onlyDigits.startsWith('7')) cleanPhone = '+' + onlyDigits;
            else if (onlyDigits.startsWith('8')) cleanPhone = '+7' + onlyDigits.substring(1);
            else if (onlyDigits) cleanPhone = '+7' + onlyDigits;
        }

        // Собираем всё примечание квиза красиво
        let noteParts = [];
        if (note) noteParts.push(note);
        if (email) noteParts.push('Email: ' + email);
        if (address) noteParts.push('Адрес: ' + address);
        if (quiz_name) noteParts.push('Форма: ' + quiz_name);
        const fullNote = noteParts.join(' | ');

        // ПОДГОТОВКА ДАННЫХ ДЛЯ НАДЕЖНОГО СЕРВЕРА СДЕЛОК AMOCRM
        const formData = new URLSearchParams();
        formData.append('form_id', '1259566');
        formData.append('hash', '169e0aa6a68725a7ee2241488dd4fb68');
        formData.append('fields[name_1]', name || 'Не указано');
        formData.append('fields[582075_1][310085]', cleanPhone);
        formData.append('fields[note_2]', fullNote);

        // Отправляем на универсальный vapi-шлюз amoCRM, который принимает ЛЮБЫЕ лиды со свободными полями
        const amoResponse = await fetch('https://vapi.amocrm.ru/v2/leads/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString()
        });

        if (amoResponse.ok) {
            return res.status(200).json({ status: 'ok' });
        } else {
            // Если универсальный шлюз почему-то недоступен, пробуем старый шлюз как резервный
            const fallbackResponse = await fetch('https://forms.amocrm.ru/queue/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString()
            });
            
            if (fallbackResponse.ok) {
                return res.status(200).json({ status: 'ok' });
            }
            return res.status(500).json({ status: 'error', details: 'Amo rejected request completely' });
        }
    } catch (e) {
        return res.status(500).json({ status: 'error', message: e.message });
    }
}
