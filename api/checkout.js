export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const TOKEN = process.env.PAGSEGURO_TOKEN;

  if (!TOKEN) {
    return res.status(500).json({ error: 'Token nao configurado' });
  }

  const { items, shipping, total } = req.body;

  if (!items || !items.length || !total) {
    return res.status(400).json({ error: 'Dados invalidos' });
  }

  try {
    // Monta itens para API v4
    const psItems = items.map((item, i) => ({
      reference_id: `item-${i + 1}`,
      name: `${item.club} ${item.name} Tam ${item.size}`.replace(/[^a-zA-Z0-9 \-]/g, ' ').substring(0, 64).trim(),
      quantity: parseInt(item.qty) || 1,
      unit_amount: Math.round(Math.max(0.01, parseFloat(item.price)) * 100) // centavos
    }));

    const shippingAmount = shipping && shipping.value > 0
      ? Math.round(parseFloat(shipping.value) * 100)
      : 0;

    const body = {
      reference_id: `pedido-${Date.now()}`,
      customer_modifiable: true,
      items: psItems,
      shipping: {
        type: 'FIXED',
        amount: shippingAmount
      },
      redirect_url: 'https://www.torricasports.shop',
      return_url: 'https://www.torricasports.shop',
      payment_methods: [
        { type: 'CREDIT_CARD' },
        { type: 'DEBIT_CARD' },
        { type: 'PIX' },
        { type: 'BOLETO' }
      ]
    };

    const response = await fetch('https://api.pagseguro.com/checkouts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('PagSeguro v4 error:', JSON.stringify(data));
      return res.status(502).json({ error: 'Erro PagSeguro', detail: data });
    }

    // Pega o link de pagamento
    const paymentLink = data.links?.find(l => l.rel === 'PAY')?.href
      || data.links?.[0]?.href;

    if (!paymentLink) {
      console.error('Sem link de pagamento:', JSON.stringify(data));
      return res.status(502).json({ error: 'Link nao encontrado', detail: data });
    }

    return res.status(200).json({ redirectUrl: paymentLink });

  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: 'Erro interno', detail: err.message });
  }
}
