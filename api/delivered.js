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
    const db = admin.database();

    //   :            ""
    if (msgKey === 'call_wakeup') {
      const uids = chatId.split('_');
      if (uids.length === 2) {
         //     (caller)      
         const call1Snap = await db.ref(`calls/${uids[0]}`).once('value');
         if (call1Snap.exists() && call1Snap.val().role === 'caller') {
             await db.ref(`calls/${uids[0]}`).update({ ringStatus: 'ringing' });
         }
         
         const call2Snap = await db.ref(`calls/${uids[1]}`).once('value');
         if (call2Snap.exists() && call2Snap.val().role === 'caller') {
             await db.ref(`calls/${uids[1]}`).update({ ringStatus: 'ringing' });
         }
      }
      return res.status(200).json({ success: true, message: 'Call marked as ringing' });
    }

    //       " " ( )
    await db.ref(`chats/${chatId}/messages/${msgKey}`).update({ delivered: true });
    res.status(200).json({ success: true, message: 'Marked as delivered' });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
