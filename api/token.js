const admin = require('firebase-admin');

if (!admin.apps.length) {
  let pk = process.env.FIREBASE_PRIVATE_KEY || '';
  pk = pk.replace(/(^"|"$)/g, '').replace(/\\n/g, '\n');

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: pk,
    }),
    databaseURL: "https://neonchat-2df05-default-rtdb.firebaseio.com"
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, token } = req.body;

  if (!uid || !token) {
    return res.status(400).json({ error: 'Missing uid or token' });
  }

  try {
    // تحديث التوكن بقاعدة البيانات للمستخدم المحدد فوراً
    await admin.database().ref('users/' + uid + '/fcmToken').set(token);
    res.status(200).json({ success: true, message: 'Token updated successfully in background' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
