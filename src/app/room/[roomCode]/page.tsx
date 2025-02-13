"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { fetchRoomByRoomCode, startGame, leaveRoom } from "@/app/api/room";

// 방 데이터 타입 정의
interface Room {
  id: string;
  title: string;
  roomCode: string;
  status: "WAITING" | "PLAYING";
  host: string | null;
  guest: string | null;
}

export default function RoomPage() {
  const router = useRouter();
  const { roomCode } = useParams(); // URL에서 id를 받아옴
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const userId = "user123"; // 실제 로그인된 유저 ID로 대체해야 함 (예제용)

  useEffect(() => {
    if (!roomCode) return; // id가 없으면 실행하지 않음
    async function loadRoom() {
      try {
        console.log("Fetching room info for:", roomCode);
        const data = await fetchRoomByRoomCode(roomCode as string); // id를 문자열로 타입 캐스팅
        console.log(data);
        setRoom(data as Room);
      } catch (err) {
        console.log(err);
        setError("방 정보를 불러올 수 없습니다.");
      } finally {
        setLoading(false);
      }
    }
    loadRoom();
  }, [roomCode]); // 룸코드가 변경될 때마다 호출

  async function handleStartGame() {
    if (!room) return;
    try {
      await startGame(room.roomCode);
      setRoom({ ...room, status: "PLAYING" });
    } catch (err) {
      console.error(err);
      alert("게임을 시작할 수 없습니다.");
    }
  }

  async function handleLeaveRoom() {
    if (!room) return;
    try {
      await leaveRoom(room.roomCode, userId);
      router.push("/"); // 나가면 메인 페이지로 이동
    } catch (err) {
      console.error(err);
      alert("방을 나갈 수 없습니다.");
    }
  }

  if (loading) return <p>로딩 중...</p>;
  if (error) return <p className="text-red-500">{error}</p>;
  if (!room) return <p>방을 찾을 수 없습니다.</p>;

  return (
    <div className="min-h-screen flex flex-col items-center p-8">
      <h1 className="text-2xl font-bold mb-4">{room.title}</h1>
      <p className="text-gray-500">방 코드: {room.roomCode}</p>
      <p className={`text-lg font-semibold ${room.status === "WAITING" ? "text-green-500" : "text-red-500"}`}>
        {room.status === "WAITING" ? "대기 중" : "게임 중"}
      </p>

      {/* 플레이어 정보 표시 (가운데 정렬) */}
      <div className="flex justify-center items-center w-full max-w-md mt-6">
        <div className="w-1/2 text-center border-r-2 border-gray-300">
          <h2 className="text-xl font-bold">👑 호스트</h2>
          <p className="text-blue-500">{room.host || "없음"}</p>
        </div>
        <div className="w-1/2 text-center">
          <h2 className="text-xl font-bold">🙋‍♂️ 게스트</h2>
          <p className="text-red-500">{room.guest || "없음"}</p>
        </div>
      </div>

      {/* 버튼 영역 */}
      <div className="mt-6 flex gap-4">
        {room.host === userId && room.status === "WAITING" && (
          <button 
            onClick={handleStartGame} 
            className="px-4 py-2 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600"
          >
            게임 시작
          </button>
        )}
        <button 
          onClick={handleLeaveRoom} 
          className="px-4 py-2 bg-gray-500 text-white rounded-lg shadow-md hover:bg-gray-600"
        >
          나가기
        </button>
      </div>
    </div>
  );
}
