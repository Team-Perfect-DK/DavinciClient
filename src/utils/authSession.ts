const SESSION_ID_KEY = "sessionId";
const NICKNAME_KEY = "nickname";

export function getSessionId() {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(SESSION_ID_KEY);
}

export function setAuthSession(sessionId: string, nickname: string) {
  sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  sessionStorage.setItem(NICKNAME_KEY, nickname);
}

export function clearAuthSession() {
  sessionStorage.removeItem(SESSION_ID_KEY);
  sessionStorage.removeItem(NICKNAME_KEY);
}
