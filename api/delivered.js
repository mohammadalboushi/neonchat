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
  
  // نفس الحمايات الأمنية للمنافذ
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

  const { chatId, msgKey } = req.body;

  if (!chatId || !msgKey) {
    return res.status(400).json({ error: 'Missing chatId or msgKey' });
  }

  try {
    // 🚀 تحديث حالة الرسالة إلى "تم الاستلام" (delivered: true) في قاعدة بيانات فايربيس
    const db = admin.database();
    await db.ref(`chats/${chatId}/messages/${msgKey}`).update({ delivered: true });
    
    res.status(200).json({ success: true, message: 'Marked as delivered' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
