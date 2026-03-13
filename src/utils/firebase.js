import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBxGZuEc8Al4Yp7ad47jVPqmWqYKjcVhY0",
  authDomain: "fintrack-app-f692f.firebaseapp.com",
  projectId: "fintrack-app-f692f",
  storageBucket: "fintrack-app-f692f.firebasestorage.app",
  messagingSenderId: "968494689350",
  appId: "1:968494689350:web:598b96db3e689a8749ae47",
  measurementId: "G-V8MNHF938Q"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;