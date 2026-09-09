import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Default Firebase config for serverless hosts
const DEFAULT_FIREBASE_CONFIG = {
  projectId: "jkuatwayfinderapp",
  appId: "1:640278866633:web:133b6e715309656254fb18",
  apiKey: "AIzaSyC40AVRlKxeYS5tyc2XLk3jMS4PFrTFU40",
  authDomain: "jkuatwayfinderapp.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-jkuatwayfinder-066e7efd-9fb1-41c8-9be6-7a961a6f0c8f",
  storageBucket: "jkuatwayfinderapp.firebasestorage.app",
  messagingSenderId: "640278866633",
  measurementId: "G-KKPYYLCEJ0",
  oAuthClientId: "640278866633-0tdkcc5jcbf9gfiof9oi9knh937eefgk.apps.googleusercontent.com"
};

// Read config from firebase-applet-config.json
let firebaseConfig = DEFAULT_FIREBASE_CONFIG;
try {
  const searchPaths = [
    path.join(process.cwd(), 'firebase-applet-config.json'),
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'firebase-applet-config.json')
  ];
  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      firebaseConfig = { ...DEFAULT_FIREBASE_CONFIG, ...JSON.parse(fs.readFileSync(p, 'utf8')) };
      break;
    }
  }
} catch (e) {
  console.warn('Note reading firebase-applet-config.json:', e.message);
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth(app);

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

export function handleFirestoreError(error, operationType, docPath) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser ? auth.currentUser.uid : null,
      email: auth.currentUser ? auth.currentUser.email : null,
      emailVerified: auth.currentUser ? auth.currentUser.emailVerified : null,
      isAnonymous: auth.currentUser ? auth.currentUser.isAnonymous : null,
      tenantId: auth.currentUser ? auth.currentUser.tenantId : null,
      providerInfo: auth.currentUser && auth.currentUser.providerData
        ? auth.currentUser.providerData.map(provider => ({
            providerId: provider.providerId,
            email: provider.email,
          }))
        : []
    },
    operationType,
    path: docPath
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('Successfully validated connection to Firestore.');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

// Automatically test connection on module boot
testConnection().catch(() => {});

export default { app, db, auth, handleFirestoreError, testConnection, OperationType };
