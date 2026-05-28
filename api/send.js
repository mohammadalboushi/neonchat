const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : '',
    })
  });
}

module.exports = async (req, res) => {
  // السماح لموقعك بالاتصال بهذا السيرفر المخفي
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
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

  const message = {
    token: token,
    notification: {
      title: title || 'رسالة جديدة',
      body: body || 'لديك رسالة جديدة',
    },
    webpush: {
      notification: {
        icon: icon || 'https://mohammadalboushi.github.io/neonchat/icon.png',
        dir: 'rtl'
      },
      fcmOptions: {
        link: url || 'https://mohammadalboushi.github.io/neonchat/'
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
