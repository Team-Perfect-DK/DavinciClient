"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RoomPage() {
  const router = useRouter();

  useEffect(() => {
    const sessionId = localStorage.getItem("sessionId");

    if (sessionId) {
      router.push("/lobby");
    } else {
      router.push("/login");
    }
  }, []);

  return <div>Room Page</div>;
}
