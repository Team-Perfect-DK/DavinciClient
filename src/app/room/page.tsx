"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSessionId } from "@/utils/authSession";

export default function RoomPage() {
  const router = useRouter();

  useEffect(() => {
    const sessionId = getSessionId();

    if (sessionId) {
      router.replace("/lobby");
    } else {
      router.replace("/");
    }
  }, [router]);

  return <div>Room Page</div>;
}
