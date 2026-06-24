importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-database-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyA3xtGLVJwij2BTiiOk7DsNeF9hIOuZCyI",
  authDomain: "q-room-fe8a6.firebaseapp.com",
  databaseURL: "https://q-room-fe8a6-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "q-room-fe8a6",
  storageBucket: "q-room-fe8a6.firebasestorage.app",
  messagingSenderId: "151049149394",
  appId: "1:151049149394:web:7a3ea6406454f6a87d460b"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// FCMからのバックグラウンドメッセージを受信してOS通知を表示
messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || '新しい通知', {
    body: body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data || {}
  });
});

// 通知をクリックしたらアプリを開く
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/');
    })
  );
});