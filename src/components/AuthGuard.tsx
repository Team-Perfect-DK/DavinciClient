"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const LOGIN_PATH = "/";
const LOBBY_PATH = "/lobby";

export default function AuthGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const sessionId = localStorage.getItem("sessionId");
    const isLoginPage = pathname === LOGIN_PATH;

    if (!sessionId && !isLoginPage) {
      router.replace(LOGIN_PATH);
      return;
    }

    if (sessionId && isLoginPage) {
      router.replace(LOBBY_PATH);
    }
  }, [pathname, router]);

  return null;
}
