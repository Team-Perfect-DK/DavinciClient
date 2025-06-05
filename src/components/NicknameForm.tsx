"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/store/userStore";
import { registerUser } from "@/app/api/user";

export default function NicknameForm() {
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
      router.push("/lobby");
    } catch (error) {
      alert("닉네임 중복! 다른 닉네임을 입력하세요.");
    }
  };

  return (
    <div className="p-4 w-full min-h-screen flex items-center justify-center">
      <div className="flex flex-row items-center justify-evenly border w-3/4 p-10 h-full">
        <div className="flex flex-col items-center justify-center w-full h-full">
          <div className="w-2/3 h-full">
            <img src="/img/davincimonarisa.png" className="w-full h-full"/>
          </div>
          <div className="text-3xl font-bold">Davinci Code</div>
        </div>
        <div className="flex flex-col items-start w-full h-full justify-center pl-10">
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
      </div>
   </div>
  );
}
