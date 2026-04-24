export default async function handler(req, res) {
    const { id } = req.query;
    const YANDEX_API_KEY = 'AQVN3DbXYRvQvQg9p2ylCnR5eSVfi_hfQqnJhzQK'; 

    try {
        const response = await fetch(`https://llm.api.cloud.yandex.net/operations/${id}`, {
            headers: { "Authorization": `Api-Key ${YANDEX_API_KEY}` }
        });
        const data = await response.json();

        if (data.done && data.response) {
            return res.status(200).json({ 
                done: true, 
                image: `data:image/png;base64,${data.response.image}` 
            });
        } else {
            return res.status(200).json({ done: false });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
