const MAIL_TO = 'room.banchou@gmail.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function field(label, value) {
  if (!value || value === '未入力' || value === '未定') return '';
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

function buildHtml(body) {
  const rows = [
    field('申込区分', body.applicantType),
    field('お名前', body.name),
    field('ふりがな', body.kana),
    field('住所', body.address),
    field('電話番号', body.tel),
    field('メール', body.email),
    field('希望の部屋・サイズ', body.room),
    field('利用開始希望日', body.start),
    field('利用期間', body.period),
    field('支払い方法', body.payment),
    field('見学希望', body.visit),
    field('連絡しやすい時間帯', body.contactTime)
  ].filter(Boolean).join('');

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: sans-serif; color: #2A1D14; line-height: 1.7; }
    h1 { font-size: 20px; }
    table { border-collapse: collapse; width: 100%; max-width: 760px; margin: 16px 0; }
    th, td { border: 1px solid #EEE2CE; padding: 10px 12px; vertical-align: top; text-align: left; }
    th { width: 180px; background: #FFF8EC; }
    pre { white-space: pre-wrap; background: #FFFBF3; border: 1px solid #EEE2CE; padding: 14px; }
  </style>
</head>
<body>
  <h1>トランクルーム収納番長 申込み・空き確認</h1>
  <table>${rows}</table>
  <pre>${escapeHtml(body.summary || '')}</pre>
</body>
</html>`;
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: '入力内容を読み取れませんでした。' }, 400);
  }

  if (!env.RESEND_API_KEY) {
    return json({ ok: false, error: 'メール送信設定が未設定です。' }, 500);
  }

  if (!body?.summary || !body?.name || !body?.tel) {
    return json({ ok: false, error: 'お名前と電話番号を入力してください。' }, 400);
  }

  const from = env.MAIL_FROM || 'onboarding@resend.dev';
  const subjectName = body.name && body.name !== '未入力' ? body.name : 'お客様';
  const subject = `【収納番長】申込み・空き確認 ${subjectName}様`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [env.MAIL_TO || MAIL_TO],
      reply_to: body.email && body.email !== '未入力' ? body.email : undefined,
      subject,
      text: body.summary,
      html: buildHtml(body)
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    return json({ ok: false, error: 'メール送信に失敗しました。', detail }, 502);
  }

  return json({ ok: true });
}
