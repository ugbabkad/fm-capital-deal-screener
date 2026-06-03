import { IncomingForm } from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  }
};

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

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ maxFileSize: 50 * 1024 * 1024 }); // 50MB limit
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    const { files } = await parseForm(req);
    const pdfFile = files.pdf?.[0] || files.pdf;

    if (!pdfFile) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    // Read file and convert to base64
    const filepath = pdfFile.filepath || pdfFile.path;
    const buffer = fs.readFileSync(filepath);
    const base64 = buffer.toString('base64');

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
        model: 'claude-sonnet-4-6',
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
      return res.status(502).json({ error: `Anthropic API error: ${response.status}`, detail: err });
    }

    const result = await response.json();
    const text = result.content?.[0]?.text ?? '';

    // Parse JSON — strip markdown fences if present
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
    const jsonStr = match ? match[1] : text;
    const extracted = JSON.parse(jsonStr);

    return res.status(200).json({ ok: true, data: extracted });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
