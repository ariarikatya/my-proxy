import fetch from 'node-fetch';
// api/amo.js
export default async function handler(req, res) {
    // 1. Разрешаем CORS для твоего домена
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // 2. Обработка предварительного запроса (preflight)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const { phone, name, note, quiz_name, email, address } = req.body;

        // САМАЯ БЕЗОПАСНАЯ КОРРЕКЦИЯ: просто стираем пробел в начале строки, если он прилетел
        // Если телефон пришел нормальный, строка останется на 100% исходной
        const safePhone = phone ? String(phone).trim() : '';

        let noteParts = [];
        if (note) noteParts.push(note);
        if (email) noteParts.push('Email: ' + email);
        if (address) noteParts.push('Адрес: ' + address);
        if (quiz_name && quiz_name !== note) noteParts.push('Форма: ' + quiz_name);
        
        const fullNote = noteParts.join(' | ');

        const formData = new URLSearchParams();
        formData.append('form_id', '1259566');
        formData.append('hash', '169e0aa6a68725a7ee2241488dd4fb68');
        formData.append('fields[name_1]', name || 'Не указано');
        formData.append('fields[582075_1][310085]', safePhone); // Передаем оригинальную строку (без пробела на конце/начале)
        formData.append('fields[note_2]', fullNote);

        const amoResponse = await fetch('https://forms.amocrm.ru/queue/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString()
        });

        if (amoResponse.ok) {
            res.status(200).json({ status: 'ok' });
        } else {
            res.status(500).json({ status: 'error', details: 'Amo rejected request' });
        }
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
}
