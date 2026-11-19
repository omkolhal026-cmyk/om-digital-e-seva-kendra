import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.setCustomParameters({
  prompt: 'select_account',
});

let cachedAccessToken: string | null =
  typeof window !== 'undefined' ? localStorage.getItem('om_google_sheets_token') : null;

export const getCurrentDomain = (): string => {
  if (typeof window !== 'undefined') {
    return window.location.hostname;
  }
  return 'localhost';
};

// Helper to acquire token via Google Identity Services (GSI)
const requestGsiToken = (clientId: string): Promise<{ accessToken: string; user?: any }> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !(window as any).google?.accounts?.oauth2) {
      return reject(new Error('Google Identity Services SDK not yet loaded'));
    }

    try {
      const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.profile',
        callback: (response: any) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error));
          } else if (response.access_token) {
            resolve({ accessToken: response.access_token });
          } else {
            reject(new Error('No access token returned from Google Identity Services'));
          }
        },
        error_callback: (err: any) => {
          reject(err);
        },
      });

      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (e) {
      reject(e);
    }
  });
};

export interface GoogleAuthResult {
  user?: any;
  accessToken: string;
  method?: 'gsi' | 'firebase' | 'manual';
}

export const googleSignIn = async (): Promise<GoogleAuthResult> => {
  const currentDomain = getCurrentDomain();

  // 1. First attempt: Google Identity Services (GIS) if available
  if (firebaseConfig.oAuthClientId && typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2) {
    try {
      const gsiResult = await requestGsiToken(firebaseConfig.oAuthClientId);
      if (gsiResult?.accessToken) {
        cachedAccessToken = gsiResult.accessToken;
        localStorage.setItem('om_google_sheets_token', cachedAccessToken);
        // Sync token to backend
        try {
          await fetch('/api/set-google-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: cachedAccessToken }),
          });
        } catch (_) {}
        return { ...gsiResult, method: 'gsi' };
      }
    } catch (gsiErr: any) {
      console.warn('GSI token acquisition fallback to Firebase:', gsiErr?.message || gsiErr);
    }
  }

  // 2. Second attempt: Firebase Auth signInWithPopup
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google access token unavailable from sign-in');
    }
    cachedAccessToken = credential.accessToken;
    localStorage.setItem('om_google_sheets_token', cachedAccessToken);

    try {
      await fetch('/api/set-google-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cachedAccessToken }),
      });
    } catch (_) {}

    return { user: result.user, accessToken: cachedAccessToken, method: 'firebase' };
  } catch (err: any) {
    console.error('Google Sign In error:', err);

    // Check specifically for auth/unauthorized-domain
    if (err?.code === 'auth/unauthorized-domain' || err?.message?.includes('unauthorized-domain')) {
      const customErr: any = new Error(
        `डोमेन अधिकृत नाही (Unauthorized Domain: ${currentDomain}). चालू डोमेन (${currentDomain}) Firebase Console मध्ये Authorized Domains मध्ये जोडणे आवश्यक आहे, किंवा खाली मॅन्युअल Google Token पेस्ट करून थेट सेव्ह करा.`
      );
      customErr.code = 'auth/unauthorized-domain';
      customErr.isUnauthorizedDomain = true;
      customErr.domain = currentDomain;
      customErr.originalMessage = err?.message;
      throw customErr;
    }

    throw err;
  }
};

export const setManualAccessToken = async (token: string): Promise<boolean> => {
  const trimmed = token.trim();
  if (!trimmed) return false;

  cachedAccessToken = trimmed;
  if (typeof window !== 'undefined') {
    localStorage.setItem('om_google_sheets_token', trimmed);
  }

  try {
    const res = await fetch('/api/set-google-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: trimmed }),
    });
    return res.ok;
  } catch (e) {
    console.error('Failed to sync manual token to server:', e);
    return false;
  }
};

export const getStoredAccessToken = (): string | null => {
  return cachedAccessToken || (typeof window !== 'undefined' ? localStorage.getItem('om_google_sheets_token') : null);
};

export const clearStoredAccessToken = async () => {
  cachedAccessToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('om_google_sheets_token');
  }
  try {
    await fetch('/api/clear-google-token', { method: 'POST' });
  } catch (_) {}
};

export const checkGoogleTokenStatus = async (): Promise<{ connected: boolean; hasToken: boolean }> => {
  try {
    const res = await fetch('/api/google-token-status');
    if (res.ok) {
      const data = await res.json();
      return { connected: !!data.connected, hasToken: !!data.hasToken };
    }
  } catch (_) {}
  return { connected: !!getStoredAccessToken(), hasToken: !!getStoredAccessToken() };
};

export { firebaseConfig };
