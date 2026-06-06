"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { validateSession } from "@/app/api/user";
import { clearAuthSession, getSessionId } from "@/utils/authSession";

const LOGIN_PATH = "/";
const LOBBY_PATH = "/lobby";

export default function AuthGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const sessionId = getSessionId();
    const isLoginPage = pathname === LOGIN_PATH;
    setChecking(true);

    if (!sessionId && !isLoginPage) {
      router.replace(LOGIN_PATH);
      return;
    }

    if (!sessionId) {
      setChecking(false);
      return;
    }

    let cancelled = false;

    void validateSession(sessionId)
      .then((isValid) => {
        if (cancelled) return;

        if (!isValid) {
          clearAuthSession();
          if (!isLoginPage) router.replace(LOGIN_PATH);
          setChecking(false);
          return;
        }

        if (isLoginPage) router.replace(LOBBY_PATH);
        setChecking(false);
      })
      .catch(() => {
        // Keep the current session during temporary network failures.
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!checking || pathname === LOGIN_PATH) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#f4f4f1] px-5 font-Arita">
      <div className="w-full max-w-sm border-[3px] border-black bg-white px-7 py-8 text-center shadow-[10px_10px_0_#11936e]">
        <div className="mx-auto h-12 w-12 animate-spin border-[5px] border-[#d8d8d8] border-t-[#11936e]" />
        <p className="mt-6 text-2xl font-black">로그인 상태를 확인 중입니다...</p>
      </div>
    </div>
  );
}
