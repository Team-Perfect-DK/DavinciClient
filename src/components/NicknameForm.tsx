"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { registerUser } from "@/app/api/user";
import { useUserStore } from "@/store/userStore";
import { setAuthSession } from "@/utils/authSession";

const previewTiles = [0, 3, 6, 9, 11, "?"];

export default function NicknameForm() {
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const setUser = useUserStore((state) => state.setUser);
  const leftEyeRef = useRef<HTMLImageElement>(null);
  const rightEyeRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const moveEyes = (event: MouseEvent) => {
      const moveEye = (eye: HTMLImageElement | null) => {
        if (!eye) return;

        const rect = eye.getBoundingClientRect();
        const eyeCenterX = rect.left + rect.width / 2;
        const eyeCenterY = rect.top + rect.height / 2;
        const dx = event.clientX - eyeCenterX;
        const dy = event.clientY - eyeCenterY;
        const angle = Math.atan2(dy, dx);
        const radius = Math.min(rect.width, rect.height) * 0.28;
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedNickname = nickname.trim();

    if (!trimmedNickname) {
      setError("닉네임을 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const data = await registerUser(trimmedNickname);
      setUser(trimmedNickname, data.sessionId);
      setAuthSession(data.sessionId, trimmedNickname);
      router.push("/lobby");
    } catch {
      setError("이미 사용 중인 닉네임입니다. 다른 이름을 입력해주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f4f4f1] px-4 py-4 font-Arita text-[#101014]">
      <section className="mx-auto grid min-h-[calc(100vh-32px)] w-full max-w-[1180px] border-[3px] border-black bg-white shadow-[12px_12px_0_#000] lg:grid-cols-[minmax(0,1fr)_430px]">
        <div className="grid min-h-[560px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-b-[3px] border-black px-7 py-7 sm:px-10 lg:min-h-0 lg:border-b-0 lg:border-r-[3px]">
          <div>
            <p className="mb-3 text-sm font-black uppercase tracking-[0.2em] text-[#11936e]">
              Davinci Code Game
            </p>
            <h1 className="max-w-[720px] text-5xl font-black leading-[0.95] sm:text-7xl">
              다빈치 코드
            </h1>
            <p className="mt-6 max-w-xl text-lg font-bold leading-8 text-[#5d5d64]">
              숫자와 색을 읽고, 상대의 숨은 타일을 먼저 밝혀내세요.
            </p>
          </div>

          <div className="flex min-h-[220px] items-center justify-center overflow-hidden py-5 sm:min-h-[300px] lg:min-h-0">
            <div
              className="relative aspect-[489/563] max-h-full max-w-full"
              style={{ width: "min(62%, 380px)" }}
            >
              <img
                src="/img/monarisagold.svg"
                alt="Mona Lisa"
                className="h-full w-full object-contain opacity-95"
                style={{ filter: "brightness(0) saturate(100%)" }}
              />
              <img
                ref={leftEyeRef}
                src="/img/eyes.svg"
                alt=""
                aria-hidden="true"
                className="absolute"
                  style={{
                    top: "16%",
                    left: "38.8%",
                    width: "2.4%",
                    filter: "brightness(0) saturate(100%)",
                  }}
              />
              <img
                ref={rightEyeRef}
                src="/img/eyes.svg"
                alt=""
                aria-hidden="true"
                className="absolute"
                style={{
                    top: "16.3%",
                    left: "50.6%",
                  width: "2.4%",
                  filter: "brightness(0) saturate(100%)",
                }}
              />
            </div>
          </div>

          <div className="mx-auto grid w-full max-w-[580px] grid-cols-3 gap-3 sm:grid-cols-6">
            {previewTiles.map((tile, index) => {
              const isBlack = index % 2 === 0;
              const isOpen = index === 2 || index === 4;

              return (
                <div
                  key={`${tile}-${index}`}
                  className={`flex aspect-[2/3] items-center justify-center border-[3px] text-2xl font-black shadow-[5px_5px_0_#000] sm:text-3xl ${
                    isOpen ? "border-[#ff123f]" : "border-black"
                  } ${
                    isBlack
                      ? `bg-[#1c1c1f] ${isOpen ? "text-[#ff123f]" : "text-white"}`
                      : `bg-white ${isOpen ? "text-[#ff123f]" : "text-black"}`
                  }`}
                >
                  {tile}
                </div>
              );
            })}
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col justify-center px-7 py-8 sm:px-10"
        >
          <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-[#777]">
            Player
          </p>
          <h2 className="text-3xl font-black leading-tight">
            닉네임을 입력하세요
          </h2>

          <label className="mt-8 text-sm font-black text-[#555]" htmlFor="nickname">
            닉네임
          </label>
          <input
            id="nickname"
            className="mt-3 h-14 w-full border-[3px] border-black bg-white px-4 text-xl font-black outline-none shadow-[5px_5px_0_#000] transition focus:-translate-y-0.5 focus:shadow-[7px_7px_0_#000]"
            type="text"
            placeholder="예: MASTER334"
            value={nickname}
            maxLength={12}
            onChange={(event) => setNickname(event.target.value)}
          />

          {error && (
            <p className="mt-4 border-l-[4px] border-[#ff123f] pl-3 text-sm font-black text-[#ff123f]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-8 border-[3px] border-black bg-black px-6 py-4 text-lg font-black text-white shadow-[6px_6px_0_#11936e] transition enabled:hover:-translate-y-0.5 enabled:hover:shadow-[8px_8px_0_#11936e] disabled:cursor-not-allowed disabled:bg-[#b7b7b7] disabled:shadow-none"
          >
            {isSubmitting ? "입장 중" : "로비 입장"}
          </button>
        </form>
      </section>
    </main>
  );
}
