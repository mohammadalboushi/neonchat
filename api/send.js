const admin = require('firebase-admin');

if (!admin.apps.length) {
  let pk = process.env.FIREBASE_PRIVATE_KEY || '';
  // تنظيف المفتاح من أي علامات تنصيص إضافية قد يضعها Vercel ومعالجة الفواصل بدقة
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
  
  // حماية أمنية حرجة: تقييد الوصول لمنع الهجمات الخارجية وإرسال إشعارات عشوائية
  const allowedOrigins = ['https://neonchat.mooo.com', 'http://localhost:2435', 'http://localhost:5500'];
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

  const { token, title, body, icon, url } = req.body;

  if (!token) return res.status(400).json({ error: 'Token is required' });

  // 🚀 النطاق الجديد للتطبيق لضمان التوجيه الصحيح عند ضغط الإشعار
  const baseUrl = 'https://neonchat.mooo.com';

  const message = {
    token: token,
    notification: {
      title: title || 'رسالة جديدة',
      body: body || 'لديك رسالة جديدة',
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
        // دمج الرابط الأساسي مع مسار الأيقونة لضمان ظهورها في كل المتصفحات
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
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
