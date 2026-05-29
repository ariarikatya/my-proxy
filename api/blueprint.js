import { IncomingForm } from 'formidable';



import fs from 'fs';



import { Buffer } from 'buffer';







process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';







export const config = { 



    api: { bodyParser: false },



    maxDuration: 60 



};







const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY;







export default async function handler(req, res) {



    res.setHeader('Access-Control-Allow-Origin', '*');



    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');



    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');



    if (req.method === 'OPTIONS') return res.status(200).end();







    const form = new IncomingForm();



    return new Promise((resolve) => {



        form.parse(req, async (err, fields, files) => {



            if (err) { 



                res.status(500).json({ success: false, error: "Ошибка разбора формы" }); 



                return resolve(); 



            }







            try {



                const getVal = (val) => Array.isArray(val) ? val[0] : val;



                const modules = getVal(fields.modules); 



                const imageUrl = getVal(fields.image_url);







                // Жесткий промт для чертежей, зашитый на бэкенде



                const finalPrompt = `STRICT 2D IMAGE-TO-IMAGE RECONSTRUCTION. 
Flat 2D top-down orthographic blueprint, landscape engineering schematic style.
1. Trace the EXACT outer perimeter, boundaries, and structure positions 1:1 from the attached photo.
2. STRICT FORBIDDEN ZONE: Do not invent or add any new structures, houses, or elements. If an area is empty in the photo, keep it empty.
3. Style: Stark solid white background, crisp ultra-fine black lines only. No colors, no 3D depth, no shading. Trees as precise circles with central dots, mass plantings as cloud-like technical symbols.
4. Typography & Legend: Top center title "ПОСАДОЧНЫЙ ЧЕРТЁЖ УЧАСТКА". On the right, a structured table titled "Условные обозначения" with a numbered list matching active filters: ${modules || 'растения'}. Draw thin leader lines with callout circles connecting table rows to drawing elements.`;



                console.log("Отправка запроса чертежа в Pollinations (gpt-image-2)...");







                let imageBuffer;



                if (imageUrl) {



                    const imgRes = await fetch(imageUrl);



                    const arrayBuffer = await imgRes.arrayBuffer();



                    imageBuffer = Buffer.from(arrayBuffer);



                } else {



                    const file = files.image && (Array.isArray(files.image) ? files.image[0] : files.image);



                    if (!file) throw new Error("Фото не получено");



                    imageBuffer = fs.readFileSync(file.filepath);



                }







                const pollFormData = new globalThis.FormData();



                pollFormData.append('image', new Blob([imageBuffer], { type: 'image/jpeg' }), 'image.jpg');



                pollFormData.append('prompt', finalPrompt);



                pollFormData.append('model', 'gpt-image-2'); // Фиксируем модель для чертежей



                pollFormData.append('response_format', 'b64_json'); 







                const pollRes = await fetch('https://gen.pollinations.ai/v1/images/edits', {



                    method: 'POST',



                    headers: { 'Authorization': `Bearer ${POLLINATIONS_API_KEY}` },



                    body: pollFormData



                });







                const pollData = await pollRes.json();



                if (!pollRes.ok) throw new Error(pollData.error?.message || "Ошибка Pollinations");







                const result = pollData.data?.[0];







                res.status(200).json({ 



                    success: true, 



                    done: true, 



                    provider: 'pollinations', 



                    image: result?.b64_json || result?.url, 



                    isUrl: !!result?.url 



                });



                return resolve();







            } catch (e) {



                res.status(500).json({ success: false, error: e.message });



                return resolve();



            }



        });



    });



}
