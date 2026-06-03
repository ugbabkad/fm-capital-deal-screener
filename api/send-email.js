import { IncomingForm } from 'formidable';
import fs from 'fs';

export const config = {
  api: { bodyParser: false, responseLimit: false }
};

// ── Team recipients — add/remove emails here ──────────────────────────────────
const TEAM_EMAILS = [
  'brandonkatz9@gmail.com',
  // 'partner2@fmcapital.com',
];

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ maxFileSize: 50 * 1024 * 1024 });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err); else resolve({ fields, files });
    });
  });
}

function fmt(n) {
  return n == null ? 'N/A' : Math.round(n).toLocaleString();
}
function fmtM(n) {
  if (n == null) return 'N/A';
  return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'K' : String(n);
}

function bedroomMixText(d) {
  const rows = [
    { label: 'Studio', val: d.units_studio },
    { label: '1 BR',   val: d.units_1br },
    { label: '2 BR',   val: d.units_2br },
    { label: '3 BR',   val: d.units_3br },
    { label: '4+ BR',  val: d.units_4br_plus },
  ].filter(r => r.val != null && r.val > 0);
  if (!rows.length) return 'N/A';
  const total = rows.reduce((s, r) => s + r.val, 0);
  return rows.map(r => `${r.label}: ${r.val} (${Math.round(r.val / total * 100)}%)`).join(' · ');
}

function buildEmail(d, r) {
  const compPSF = d.comp_psf || null;
  const impliedPerUnit = (compPSF && d.avg_sf) ? d.avg_sf * compPSF : null;
  const impliedTotal = (impliedPerUnit && d.total_units) ? impliedPerUnit * d.total_units : null;
  const ppd = (d.asking_price && d.total_units) ? d.asking_price / d.total_units : null;
  const fmPct = (d.free_market_units && d.total_units) ? Math.round(d.free_market_units / d.total_units * 100) : null;
  const rsPct = fmPct != null ? 100 - fmPct : null;

  const verdictColor = r.verdict.cls === 'pursue' ? '#166534' : r.verdict.cls === 'conditional' ? '#b45309' : '#991b1b';
  const verdictBg    = r.verdict.cls === 'pursue' ? '#dcfce7' : r.verdict.cls === 'conditional' ? '#fef3c7' : '#fee2e2';

  const flagIcon = (l) => l === 'red' ? '🔴' : l === 'yellow' ? '🟡' : '🟢';

  const scoreRows = Object.values(r.scores).map(s => `
    <tr>
      <td style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6">${s.label}</td>
      <td style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6">${s.detail}</td>
      <td style="padding:8px 12px;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid #f3f4f6;color:${s.score/s.max >= 0.7 ? '#166534' : s.score/s.max >= 0.4 ? '#b45309' : '#991b1b'}">${s.score} / ${s.max}</td>
    </tr>`).join('');

  const flagRows = r.flags.map(f => `
    <tr>
      <td style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6">
        ${flagIcon(f.l)} ${f.t}
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:640px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e2dc">

  <!-- Header -->
  <div style="background:#2c5f2e;padding:24px 32px">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#86efac;margin-bottom:4px">FM Capital</div>
    <div style="font-size:22px;font-weight:800;color:#ffffff">Acquisition Screener</div>
    <div style="font-size:13px;color:#bbf7d0;margin-top:3px">Condo conversion thesis — deal analysis</div>
  </div>

  <!-- Verdict -->
  <div style="padding:28px 32px;text-align:center;border-bottom:1px solid #f3f4f6">
    <div style="font-size:48px;font-weight:900;color:${verdictColor}">${r.total}</div>
    <div style="font-size:13px;color:#6b7280;margin-bottom:14px">out of 100</div>
    <div style="display:inline-block;background:${verdictBg};color:${verdictColor};font-size:16px;font-weight:800;padding:10px 24px;border-radius:8px;letter-spacing:0.04em">${r.verdict.label}</div>
    <div style="font-size:13px;color:#6b7280;margin-top:10px">${r.verdict.sub}</div>
  </div>

  <!-- Property summary -->
  <div style="padding:24px 32px;border-bottom:1px solid #f3f4f6">
    <div style="font-size:18px;font-weight:800;color:#1a1916;margin-bottom:2px">${d.property_name || 'Property'}</div>
    <div style="font-size:13px;color:#6b7280;margin-bottom:18px">${d.submarket || ''}</div>
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td style="padding:8px 0;width:33%"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;margin-bottom:3px">Asking Price</div><div style="font-size:16px;font-weight:800;color:#1a1916">${d.asking_price ? '$' + fmtM(d.asking_price) : 'N/A'}</div></td>
        <td style="padding:8px 0;width:33%"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;margin-bottom:3px">Price / Door</div><div style="font-size:16px;font-weight:800;color:#1a1916">${ppd ? '$' + fmt(ppd) : 'N/A'}</div></td>
        <td style="padding:8px 0;width:33%"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;margin-bottom:3px">Total Units</div><div style="font-size:16px;font-weight:800;color:#1a1916">${d.total_units || 'N/A'}</div></td>
      </tr>
      <tr>
        <td style="padding:8px 0"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;margin-bottom:3px">FM Units</div><div style="font-size:14px;font-weight:700;color:#1a1916">${d.free_market_units != null ? d.free_market_units : 'N/A'}</div></td>
        <td style="padding:8px 0"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;margin-bottom:3px">RS Units</div><div style="font-size:14px;font-weight:700;color:#1a1916">${d.rent_stab_units != null ? d.rent_stab_units : 'N/A'}</div></td>
        <td style="padding:8px 0"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;margin-bottom:3px">FM / RS Ratio</div><div style="font-size:14px;font-weight:700;color:#1a1916">${fmPct != null ? fmPct + '% FM / ' + rsPct + '% RS' : 'N/A'}</div></td>
      </tr>
      <tr>
        <td style="padding:8px 0"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;margin-bottom:3px">Avg Unit SF</div><div style="font-size:14px;font-weight:700;color:#1a1916">${d.avg_sf ? d.avg_sf + ' SF' : 'N/A'}</div></td>
        <td style="padding:8px 0"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;margin-bottom:3px">Avg Rent</div><div style="font-size:14px;font-weight:700;color:#1a1916">${d.avg_rent ? '$' + fmt(d.avg_rent) + '/mo' : 'N/A'}</div></td>
        <td style="padding:8px 0"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;margin-bottom:3px">Condo Comp Basis</div><div style="font-size:14px;font-weight:700;color:#1a1916">${compPSF ? '$' + fmt(compPSF) + '/SF' : 'N/A'}</div></td>
      </tr>
      <tr>
        <td style="padding:8px 0"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;margin-bottom:3px">Implied Value / Unit</div><div style="font-size:14px;font-weight:700;color:#1a1916">${impliedPerUnit ? '$' + fmt(impliedPerUnit) : 'N/A'}</div></td>
        <td style="padding:8px 0"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;margin-bottom:3px">Implied Total Value</div><div style="font-size:14px;font-weight:700;color:#1a1916">${impliedTotal ? '$' + fmtM(impliedTotal) : 'N/A'}</div></td>
        <td style="padding:8px 0"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;margin-bottom:3px">Bedroom Mix</div><div style="font-size:13px;font-weight:700;color:#1a1916">${bedroomMixText(d)}</div></td>
      </tr>
    </table>
    ${d.seller_notes ? `<div style="margin-top:16px;background:#f8f7f4;border:1px solid #e5e2dc;border-radius:8px;padding:12px 14px;font-size:13px;color:#6b7280;line-height:1.5"><strong style="color:#1a1916">OM Notes:</strong> ${d.seller_notes}</div>` : ''}
  </div>

  <!-- Score breakdown -->
  <div style="padding:24px 32px;border-bottom:1px solid #f3f4f6">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:12px">Score Breakdown</div>
    <table style="width:100%;border-collapse:collapse;background:#f8f7f4;border-radius:8px;overflow:hidden">
      ${scoreRows}
    </table>
  </div>

  <!-- Deal flags -->
  <div style="padding:24px 32px;border-bottom:1px solid #f3f4f6">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:12px">Deal Flags</div>
    <table style="width:100%;border-collapse:collapse">
      ${flagRows}
    </table>
  </div>

  <!-- Footer -->
  <div style="padding:20px 32px;text-align:center">
    <div style="font-size:12px;color:#9ca3af">FM Capital Acquisition Screener · Condo Conversion Thesis</div>
  </div>

</div>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(500).json({ error: 'RESEND_API_KEY not configured' });

  try {
    const { fields, files } = await parseForm(req);
    const deal = JSON.parse(fields.deal?.[0] || fields.deal);
    const results = JSON.parse(fields.results?.[0] || fields.results);

    const html = buildEmail(deal, results);
    const subject = `[FM Capital Screener] ${deal.property_name || 'Deal'} — ${results.verdict.label} (${results.total}/100)`;

    // Build attachments
    const attachments = [];
    const pdfFile = files.pdf?.[0] || files.pdf;
    if (pdfFile) {
      const filepath = pdfFile.filepath || pdfFile.path;
      const pdfBuffer = fs.readFileSync(filepath);
      attachments.push({
        filename: pdfFile.originalFilename || 'offering-memo.pdf',
        content: pdfBuffer.toString('base64'),
      });
    }

    const payload = {
      from: 'FM Capital Screener <onboarding@resend.dev>',
      to: TEAM_EMAILS,
      subject,
      html,
      attachments,
    };

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: 'Resend error', detail: err });
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
