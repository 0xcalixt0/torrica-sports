export default async function handler(req, res) {
  // Apenas POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const TOKEN = process.env.PAGSEGURO_TOKEN;
  const EMAIL = process.env.PAGSEGURO_EMAIL;

  if (!TOKEN || !EMAIL) {
    return res.status(500).json({ error: 'Credenciais não configuradas' });
  }

  const { items, shipping, total, customer } = req.body;

  if (!items || !items.length || !total) {
    return res.status(400).json({ error: 'Dados do pedido inválidos' });
  }

  try {
    // Monta os itens no formato do PagSeguro
    const itemsXml = items.map((item, i) => `
      <item>
        <id>${i + 1}</id>
        <description>${item.club} — ${item.name} (Tam ${item.size})${item.perso ? ' [Personalizado]' : ''}</description>
        <amount>${parseFloat(item.price).toFixed(2)}</amount>
        <quantity>${item.qty}</quantity>
      </item>`).join('');

    const shippingCost = shipping?.value > 0
      ? `<cost>${parseFloat(shipping.value).toFixed(2)}</cost>`
      : '';

    const shippingType = shipping?.method === 'sedex' ? 1 : 3; // 1=PAC, 3=Sedex na API, mas vamos usar tipo 3 (outro)

    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<checkout>
  <currency>BRL</currency>
  <items>${itemsXml}
  </items>
  <shipping>
    <type>3</type>
    ${shippingCost}
  </shipping>
  <redirectURL>https://www.torricasports.shop</redirectURL>
  <notificationURL>https://www.torricasports.shop/api/notify</notificationURL>
  <maxUses>1</maxUses>
  <maxAge>3600</maxAge>
</checkout>`;

    const response = await fetch(
      `https://ws.pagseguro.uol.com.br/v2/checkout?email=${encodeURIComponent(EMAIL)}&token=${TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml; charset=UTF-8' },
        body: xml
      }
    );

    const text = await response.text();

    if (!response.ok) {
      console.error('PagSeguro error:', text);
      return res.status(502).json({ error: 'Erro ao criar sessão no PagSeguro', detail: text });
    }

    // Extrai o code da resposta XML
    const codeMatch = text.match(/<code>([^<]+)<\/code>/);
    if (!codeMatch) {
      return res.status(502).json({ error: 'Código de sessão não encontrado', detail: text });
    }

    const code = codeMatch[1];
    const redirectUrl = `https://pagseguro.uol.com.br/v2/checkout/payment.html?code=${code}`;

    return res.status(200).json({ redirectUrl, code });

  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: 'Erro interno', detail: err.message });
  }
}
