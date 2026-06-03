export const config = { runtime: 'edge' };

const SYSTEM_PROMPT = `You are underwriting a NYC multifamily acquisition for FM Capital, a real estate fund focused on condo conversion deals. Extract key deal metrics from this Offering Memorandum and return ONLY a valid JSON object — no markdown, no commentary, just the JSON.

Return exactly these keys:
{
  "property_name": "full street address",
  "submarket": "neighborhood and borough",
  "asking_price": number (total dollars, no commas),
  "total_units": number,
  "free_market_units": number (FM units — null if not found),
  "rent_stab_units": number (RS or rent-stabilized units — null if not found),
  "avg_sf": number (average unit square footage — null if not found),
  "avg_rent": number (average current monthly rent across all units — null if not found),
  "avg_market_rent": number (average market or asking rent per month — null if not found),
  "avg_rs_rent": number (average rent-stabilized tenant rent per month — null if not found),
  "year_built": number (null if not found),
  "building_class": "brief description e.g. pre-war walk-up, elevator building",
  "seller_notes": "key notes from the OM: seller motivation, property condition, recent renovations, debt situation, anything relevant"
}

If a value is not stated anywhere in the document, use null. Do not guess or estimate — only extract what is explicitly written.`;

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('pdf');

    if (!file) {
      return new Response(JSON.stringify({ error: 'No PDF file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Convert PDF to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // Call Anthropic API with PDF as a native document
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64
              }
            },
            {
              type: 'text',
              text: 'Extract the deal metrics from this offering memorandum and return the JSON.'
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(JSON.stringify({ error: `Anthropic API error: ${response.status}`, detail: err }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await response.json();
    const text = result.content?.[0]?.text ?? '';

    // Parse JSON — strip markdown fences if present
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
    const jsonStr = match ? match[1] : text;
    const extracted = JSON.parse(jsonStr);

    return new Response(JSON.stringify({ ok: true, data: extracted }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
