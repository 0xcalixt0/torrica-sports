export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SECRET_KEY = process.env.STRIPE_SECRET_KEY;

  if (!SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe key nao configurada' });
  }

  const { items, shipping, total } = req.body;

  if (!items || !items.length || !total) {
    return res.status(400).json({ error: 'Dados invalidos' });
  }

  try {
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'brl',
        product_data: {
          name: `${item.club} ${item.name} - Tam ${item.size}${item.perso ? ' (Personalizado)' : ''}`.substring(0, 100),
        },
        unit_amount: Math.round(Math.max(0.01, parseFloat(item.price)) * 100),
      },
      quantity: parseInt(item.qty) || 1,
    }));

    if (shipping && shipping.value > 0) {
      lineItems.push({
        price_data: {
          currency: 'brl',
          product_data: { name: `Frete - ${shipping.method?.toUpperCase() || 'Entrega'}` },
          unit_amount: Math.round(parseFloat(shipping.value) * 100),
        },
        quantity: 1,
      });
    }

    const body = new URLSearchParams();
    body.append('mode', 'payment');
    body.append('success_url', 'https://www.torricasports.shop?pagamento=sucesso');
    body.append('cancel_url', 'https://www.torricasports.shop?pagamento=cancelado');
    body.append('locale', 'pt-BR');
    body.append('payment_method_types[]', 'card');

    lineItems.forEach((item, i) => {
      body.append(`line_items[${i}][price_data][currency]`, item.price_data.currency);
      body.append(`line_items[${i}][price_data][product_data][name]`, item.price_data.product_data.name);
      body.append(`line_items[${i}][price_data][unit_amount]`, item.price_data.unit_amount);
      body.append(`line_items[${i}][quantity]`, item.quantity);
    });

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      console.error('Stripe error:', JSON.stringify(data));
      return res.status(502).json({ error: 'Erro Stripe', detail: data.error?.message });
    }

    return res.status(200).json({ redirectUrl: data.url });

  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: 'Erro interno', detail: err.message });
  }
}
