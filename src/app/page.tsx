"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import NicknameForm from "@/components/NicknameForm";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (localStorage.getItem("sessionId")) {
      router.replace("/lobby");
    }
  }, [router]);

  return <NicknameForm />;
}
