import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyBHE-BSWdPPCXlG5S8_4Lp3SFpD4Pvs0Ns",
    authDomain: "bvm-gym.firebaseapp.com",
    projectId: "bvm-gym",
    storageBucket: "bvm-gym.firebasestorage.app",
    messagingSenderId: "460544109184",
    appId: "1:460544109184:web:d22c3927083609a8f31465",
    measurementId: "G-VWSLZHPTRH"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;
