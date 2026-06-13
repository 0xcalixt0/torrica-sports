export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const TOKEN = process.env.PAGSEGURO_TOKEN;
  const EMAIL = process.env.PAGSEGURO_EMAIL;

  if (!TOKEN || !EMAIL) {
    return res.status(500).json({ error: 'Credenciais nao configuradas' });
  }

  const { items, shipping, total } = req.body;

  if (!items || !items.length || !total) {
    return res.status(400).json({ error: 'Dados do pedido invalidos' });
  }

  try {
    const itemsXml = items.map((item, i) => {
      const desc = `${item.club} ${item.name} Tam ${item.size}${item.perso ? ' Personalizado' : ''}`;
      const cleanDesc = desc.replace(/[^a-zA-Z0-9 \-\.]/g, ' ').substring(0, 100).trim();
      const price = Math.max(0.01, parseFloat(item.price)).toFixed(2);
      const qty = parseInt(item.qty) || 1;
      return `<item><id>${i + 1}</id><description>${cleanDesc}</description><amount>${price}</amount><quantity>${qty}</quantity></item>`;
    }).join('');

    const shippingXml = shipping && shipping.value > 0
      ? `<shipping><type>3</type><cost>${parseFloat(shipping.value).toFixed(2)}</cost></shipping>`
      : `<shipping><type>3</type><cost>0.00</cost></shipping>`;

    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><checkout><currency>BRL</currency><items>${itemsXml}</items>${shippingXml}<redirectURL>https://www.torricasports.shop</redirectURL><maxUses>1</maxUses><maxAge>3600</maxAge></checkout>`;

    const url = `https://ws.pagseguro.uol.com.br/v2/checkout?email=${encodeURIComponent(EMAIL)}&token=${encodeURIComponent(TOKEN)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml; charset=UTF-8'
      },
      body: xml
    });

    const text = await response.text();

    if (!response.ok) {
      console.error('PagSeguro HTTP', response.status, text);
      return res.status(502).json({ error: 'Erro PagSeguro', detail: text, status: response.status });
    }

    const codeMatch = text.match(/<code>([^<]+)<\/code>/);
    if (!codeMatch) {
      console.error('Sem code na resposta:', text);
      return res.status(502).json({ error: 'Code nao encontrado', detail: text });
    }

    const code = codeMatch[1];
    const redirectUrl = `https://pagseguro.uol.com.br/v2/checkout/payment.html?code=${code}`;

    return res.status(200).json({ redirectUrl, code });

  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: 'Erro interno', detail: err.message });
  }
}
