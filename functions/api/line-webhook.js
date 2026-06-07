const LINE_REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply';
const DEFAULT_SITE_URL = 'https://s-banchou.com';

const encoder = new TextEncoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function normalize(text) {
  return String(text || '').trim().toLowerCase();
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function buildUrl(env, path) {
  return `${env.SITE_URL || DEFAULT_SITE_URL}${path}`;
}

function buildReply(text, env) {
  const value = normalize(text);
  const roomsUrl = buildUrl(env, '/rooms.html');
  const applyUrl = buildUrl(env, '/apply.html');
  const sizeUrl = buildUrl(env, '/size-guide.html');
  const accessUrl = buildUrl(env, '/access.html');
  const tel = '0120-666-780';

  if (includesAny(value, ['空き', '空室', 'あき', '空いて', '空いてます', '空いてる'])) {
    return [
      'お問い合わせありがとうございます。',
      '空室確認ですね。',
      '',
      '最新の空室状況は下記ページで確認できます。',
      roomsUrl,
      '',
      'LINEで確認したい場合は、希望の部屋番号・広さ・利用開始希望日を送ってください。',
      '確認して順番にご案内します。'
    ].join('\n');
  }

  if (includesAny(value, ['見学', '予約', '内覧', '見たい'])) {
    return [
      '見学のご希望ありがとうございます。',
      '',
      '下記を送ってください。',
      '1. お名前',
      '2. 見学希望日を2〜3候補',
      '3. 希望の広さ、または部屋番号',
      '4. お電話番号',
      '',
      '確認してご案内します。'
    ].join('\n');
  }

  if (includesAny(value, ['申込', '申し込み', '申込み', '契約', '借りたい'])) {
    return [
      'お申し込みありがとうございます。',
      '',
      '申込みフォームはこちらです。',
      applyUrl,
      '',
      'フォーム送信後、本人確認書類の画像をご案内します。',
      '※マイナンバーカードは表面のみ送ってください。裏面は送らないでください。'
    ].join('\n');
  }

  if (includesAny(value, ['料金', '値段', '費用', '価格', 'いくら'])) {
    return [
      '料金のご確認ですね。',
      '',
      '月額2,700円（税込）からご利用いただけます。',
      '初期費用は0円です。',
      '',
      '部屋ごとの料金はこちらです。',
      roomsUrl
    ].join('\n');
  }

  if (includesAny(value, ['サイズ', '広さ', '何が入る', '荷物', '収納量'])) {
    return [
      'サイズ選びのご相談ですね。',
      '',
      '収納量の目安はこちらにまとめています。',
      sizeUrl,
      '',
      '預けたい荷物を書いていただければ、近いサイズもご提案します。'
    ].join('\n');
  }

  if (includesAny(value, ['場所', 'アクセス', '住所', '行き方', '津久野'])) {
    return [
      'アクセスはこちらです。',
      accessUrl,
      '',
      'お急ぎの場合はお電話でもご案内できます。',
      tel
    ].join('\n');
  }

  return [
    'お問い合わせありがとうございます。',
    'トランクルーム収納番長です。',
    '',
    '空き確認・見学予約・お申し込みをご希望の方は、下記を送ってください。',
    '',
    '1. お名前',
    '2. 希望の部屋番号、または希望サイズ',
    '3. 利用開始希望日',
    '4. 預けたい荷物',
    '5. 見学希望の有無',
    '',
    `お急ぎの方は ${tel} までお電話ください。`
  ].join('\n');
}

async function verifySignature(body, signature, secret) {
  if (!signature || !secret) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary) === signature;
}

async function replyMessage(replyToken, text, token) {
  const response = await fetch(LINE_REPLY_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }]
    })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export async function onRequestGet() {
  return json({ ok: true, message: 'LINE webhook is ready.' });
}

export async function onRequestPost({ request, env }) {
  if (!env.LINE_CHANNEL_SECRET || !env.LINE_CHANNEL_ACCESS_TOKEN) {
    return json({ ok: false, error: 'LINE settings are missing.' }, 500);
  }

  const bodyText = await request.text();
  const signature = request.headers.get('x-line-signature') || '';
  const valid = await verifySignature(bodyText, signature, env.LINE_CHANNEL_SECRET);
  if (!valid) {
    return json({ ok: false, error: 'Invalid signature.' }, 401);
  }

  const body = JSON.parse(bodyText);
  const events = Array.isArray(body.events) ? body.events : [];

  await Promise.all(events.map(async (event) => {
    if (!event.replyToken) return;

    if (event.type === 'follow') {
      await replyMessage(event.replyToken, buildReply('', env), env.LINE_CHANNEL_ACCESS_TOKEN);
      return;
    }

    if (event.type === 'message' && event.message?.type === 'text') {
      await replyMessage(event.replyToken, buildReply(event.message.text, env), env.LINE_CHANNEL_ACCESS_TOKEN);
    }
  }));

  return json({ ok: true });
}
