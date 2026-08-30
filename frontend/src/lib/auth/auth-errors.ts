import { FirebaseError } from "firebase/app";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "The email or password is incorrect.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/user-disabled":
    "This account is disabled. Contact support if you think this is a mistake.",
  "auth/too-many-requests":
    "Too many attempts were made. Wait a moment and try again.",
  "auth/network-request-failed":
    "We could not reach the authentication service. Check your connection.",
  "auth/popup-closed-by-user": "Google sign-in was cancelled.",
  "auth/popup-blocked":
    "The Google sign-in window was blocked. Allow pop-ups and try again.",
  "auth/operation-not-allowed":
    "This sign-in method is not enabled. Choose another method.",
  "auth/expired-action-code":
    "This link has expired. Request a new link and try again.",
  "auth/invalid-action-code":
    "This link is invalid or has already been used. Request a new link.",
};

export function getAuthErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof FirebaseError) {
    return AUTH_ERROR_MESSAGES[error.code] ?? fallback;
  }

  return fallback;
}
