const admin = require('firebase-admin');

if (!admin.apps.length) {
  let pk = process.env.FIREBASE_PRIVATE_KEY || '';
  pk = pk.replace(/(^"|"$)/g, '').replace(/\\n/g, '\n');

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: pk,
    })
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  
  const allowedOrigins = ['https://neonchat.mooo.com', 'https://mohammadalboushi.github.io', 'http://localhost:2435', 'http://localhost:5500'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 🚀 استقبال الـ msgKey والـ chatId من الطلب
  const { token, title, body, icon, url, msgKey, chatId } = req.body;

  if (!token) return res.status(400).json({ error: 'Token is required' });

  const baseUrl = 'https://neonchat.mooo.com';

  const message = {
    token: token,
    data: {
      title: title || 'رسالة جديدة',
      body: body || 'لديك رسالة جديدة',
      // 🚀 إرفاق البيانات المخفية للأندرويد (يجب أن تكون نصوص String حصراً)
      msgKey: String(msgKey || ''),
      chatId: String(chatId || '')
    },
    android: {
      priority: 'high',
    },
    webpush: {
      headers: {
        urgency: 'high',
        TTL: '86400'
      },
      notification: {
        title: title || 'رسالة جديدة',
        body: body || 'لديك رسالة جديدة',
        icon: icon ? `${baseUrl}/${icon}` : `${baseUrl}/icon-192.png`,
        dir: 'rtl',
        requireInteraction: true,
        vibrate: [300, 100, 300]
      },
      fcmOptions: {
        link: url || baseUrl
      }
    }
  };

  try {
    const response = await admin.messaging().send(message);
    res.status(200).json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
