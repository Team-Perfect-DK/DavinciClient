"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/store/userStore";
import { registerUser } from "@/app/api/user";

export default function NicknameForm() {
  const [nickname, setNickname] = useState("");
  const router = useRouter();
  const setUser = useUserStore((state) => state.setUser);

  const leftEyeRef = useRef<HTMLImageElement>(null);
  const rightEyeRef = useRef<HTMLImageElement>(null);

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

  useEffect(() => {
    const moveEyes = (e: MouseEvent) => {
      const moveEye = (eye: HTMLImageElement | null) => {
        if (!eye) return;
        const rect = eye.getBoundingClientRect();
        const eyeCenterX = rect.left + rect.width / 2;
        const eyeCenterY = rect.top + rect.height / 2;

        const dx = e.clientX - eyeCenterX;
        const dy = e.clientY - eyeCenterY;
        const angle = Math.atan2(dy, dx);
        const radius = Math.min(rect.width, rect.height) * 0.25; // 움직일 반경

        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        eye.style.transform = `translate(${x}px, ${y}px)`;
      };

      moveEye(leftEyeRef.current);
      moveEye(rightEyeRef.current);
    };

    window.addEventListener("mousemove", moveEyes);
    return () => window.removeEventListener("mousemove", moveEyes);
  }, []);

  return (
    <div className="p-4 w-full min-h-screen flex items-center justify-center bg-black bg-gradient-to-l from-white via-black">
      <div className="flex flex-row items-center justify-evenly w-8/12 p-10 h-full"> 
        <div className="relative flex flex-col items-center justify-center w-full h-full">
          <div className="w-3/4 h-full relative">
            <img src="/img/davincimonarisawithouteyes.png " className="w-full h-full invert bg-inherit" alt="monalisa" />
            <img
              ref={leftEyeRef}
              src="/img/monarisaLeftEye.png"
              className="absolute invert"
              style={{
                top: "25%",
                left: "42%",
                width: "3.2%",
              }}
              alt="left eye"
            />
            <img
              ref={rightEyeRef}
              src="/img/monarisaRightEye.png"
              className="absolute invert"
              style={{
                top: "25%",
                left: "54%",
                width: "3%",
              }}
              alt="right eye"
            />
          </div>
          <div className="text-6xl font-bold mt-2 text-myBrown text-stroke text-stroke-white">Davinci Code</div>
        </div>
        <div className="flex flex-col items-start w-full h-full justify-center pl-10">
          <h1 className="text-3xl font-bold mb-4 text-white">닉네임 입력</h1>
          <input
            className="border px-4 py-2 rounded mb-2"
            type="text"
            placeholder="Your Nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
          <button className="bg-myBrown text-white px-8 py-2 rounded" onClick={handleSubmit}>
            시작하기
          </button>
        </div>
      </div>
    </div>
  );
}
