"use client";  // Next.js 15에서 클라이언트 컴포넌트 지정

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/store/userStore";
import { registerUser } from "@/app/api/user";

export default function Home() {
  const [nickname, setNickname] = useState("");
  const router = useRouter();
  const setUser = useUserStore((state) => state.setUser);

  const handleSubmit = async () => {
    if (!nickname) return alert("닉네임을 입력하세요!");

    try {
      const data = await registerUser(nickname);
      setUser(nickname, data.sessionId);
      localStorage.setItem("sessionId", data.sessionId);
      localStorage.setItem("nickname", nickname);
      router.push("/lobby");  // 로비 페이지로 이동
    } catch (error) {
      alert("닉네임 중복! 다른 닉네임을 입력하세요.");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-2xl font-bold mb-4">닉네임 입력</h1>
      <input
        className="border px-4 py-2 rounded mb-2"
        type="text"
        placeholder="닉네임 입력"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
      />
      <button className="bg-blue-500 text-white px-4 py-2 rounded" onClick={handleSubmit}>
        시작하기
      </button>
    </div>
  );
}
