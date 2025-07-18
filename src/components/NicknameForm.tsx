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
    } catch {
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
        const radius = Math.min(rect.width, rect.height) * 0.25;
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
    <div className="min-h-screen w-full flex items-center justify-center bg-davinci-gradient relative">
      {/* 프레임 SVG */}
      <img
        src="/img/goldframe.svg"
        alt="gold frame"
        className="absolute w-[98%] max-w-7xl h-auto pointer-events-none z-0"
      />
      <div className="flex flex-col items-center justify-center w-full h-full relative z-10">
        <div className="font-noto text-6xl font-bold bg-gradient-to-r from-[#EDAE51] to-[#301D00] bg-clip-text text-transparent mt-12 drop-shadow-[4px_8px_8px_rgba(0,0,0,1)]">
          DAVINCI CODE GAME
        </div>


        {/* 콘텐츠 영역 */}
        <div className="flex flex-row items-center justify-center w-[90%] max-w-7xl p-10 z-10">
          {/* 왼쪽: 그림 */}
          <div className="relative flex flex-col items-center justify-center w-full h-full">
            <div className="w-[90%] h-[90%] relative">
              <img src="/img/monarisagold.svg" className="w-[90%] h-auto bg-inherit pl-16" alt="monalisa " />
              <img
                ref={leftEyeRef}
                src="/img/eyes.svg"
                className="absolute"
                style={{ top: "16%", left: "41.7%", width: "2%" }}
                alt="left eye"
              />
              <img
                ref={rightEyeRef}
                src="/img/eyes.svg"
                className="absolute"
                style={{ top: "16.3%", left: "51.2%", width: "2%" }}
                alt="right eye"
              />
            </div>

          </div>

          {/* 오른쪽: 닉네임 입력 폼 */}
          <div className="font-Arita flex flex-col items-center w-full h-full justify-center pr-10">
            <h1 className="font-Arita text-4xl mb-4 text-[#EDAE51] pb-4">닉네임을 입력하세요</h1>
            <input
              className="w-[80%] h-14 border border-[#AF8039] px-4 py-2 rounded mb-8 placeholder:text-[#c19853] bg-[#0C0601] text-[#c19853] text-center text-xl"
              type="text"
              placeholder="EX: MASTERDAVINCI"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
            <button
              className="w-[40%] h-12 text-2xl bg-[#0C0601] px-6 py-2 border border-[#AF8039] text-[#c19853] rounded hover:bg-[#c19853] hover:text-black transition-all"
              onClick={handleSubmit}
            >
              시작하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );

}
