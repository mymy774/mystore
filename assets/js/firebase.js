import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';

// Configuração pública do projeto My Store.
const firebaseConfig = {
  apiKey: 'AIzaSyD19nDStx93XHAc0DuVAN2PcyvtXi9RvBo',
  authDomain: 'mystore-c3c60.firebaseapp.com',
  projectId: 'mystore-c3c60',
  storageBucket: 'mystore-c3c60.firebasestorage.app',
  messagingSenderId: '695597457784',
  appId: '1:695597457784:web:d9acbb86b0fc454902688d'
};

export const app = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
