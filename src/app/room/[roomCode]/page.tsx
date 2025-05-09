"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { fetchRoomByRoomCode, startGame, leaveRoom, joinRoomAsGuest } from "@/app/api/room";

interface Room {
  id: string;
  title: string;
  roomCode: string;
  status: "WAITING" | "PLAYING";
  hostId: string;
  hostNickname: string;
  guestId: string | null;
  guestNickname: string | null;
}

export default function RoomPage() {
  const router = useRouter();
  const { roomCode } = useParams();
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [role, setRole] = useState<"HOST" | "GUEST" | null>(null);

  const userId = localStorage.getItem("sessionId");

  useEffect(() => {
    if (!roomCode || !userId) return;

    async function loadRoom() {
      try {
        const data = await fetchRoomByRoomCode(roomCode as string);
        setRoom(data as Room);

        if (data && userId && data.hostId && !data.guestId && data.hostId !== userId) {
          if (data.hostId === userId) {
            console.log("🟢 나는 Host입니다.");
          } else if (data.guestId === userId) {
            console.log("🔴 나는 Guest입니다.");
          } else if (!data.guestId) {
            console.log("🙋‍♂️ 아직 Guest 없음 → 자동 참여?");
          }
          const updatedRoom = await joinRoomAsGuest(data.roomCode, userId);
          setRoom(updatedRoom);
        }
      } catch (err) {
        setError("방 정보를 불러올 수 없습니다.");
      } finally {
        setLoading(false);
      }
    }

    loadRoom();

    // WebSocket 연결
    const ws = new WebSocket(`wss://davinci.net/rooms/${roomCode}`);

    ws.onopen = () => {
      console.log("WebSocket 연결됨");
      setSocket(ws);
    };

    ws.onmessage = (event) => {
      const updatedRoom = JSON.parse(event.data);
      setRoom(updatedRoom);
    };

    ws.onerror = (error) => {
      console.error("WebSocket 오류:", error);
    };

    ws.onclose = () => {
      console.log("WebSocket 연결 종료");
    };

    return () => {
      ws.close();
    };
  }, [roomCode, userId]);

  async function handleStartGame() {
    if (!room) return;
    try {
      await startGame(room.roomCode);
      socket?.send(JSON.stringify({ type: "GAME_STARTED" }));
    } catch (err) {
      alert("게임을 시작할 수 없습니다.");
    }
  }

  async function handleLeaveRoom() {
    if (!room) return;
    try {
      if (userId) await leaveRoom(room.roomCode, userId);
      socket?.send(JSON.stringify({ type: "PLAYER_LEFT", userId }));
      router.push("/");
    } catch (err) {
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

      <div className="flex justify-center items-center w-full max-w-md mt-6">
        <div className="w-1/2 text-center border-r-2 border-gray-300">
          <h2 className="text-xl font-bold">👑 호스트</h2>
          <p className="text-blue-500">{room.hostNickname || "없음"}</p>
        </div>
        <div className="w-1/2 text-center">
          <h2 className="text-xl font-bold">🙋‍♂️ 게스트</h2>
          <p className="text-red-500">{room.guestNickname || "없음"}</p>
        </div>
      </div>

      <div className="mt-6 flex gap-4">
        {room.hostId === userId && room.status === "WAITING" && (
          <button onClick={handleStartGame} className="px-4 py-2 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600">
            게임 시작
          </button>
        )}

        <button onClick={handleLeaveRoom} className="px-4 py-2 bg-gray-500 text-white rounded-lg shadow-md hover:bg-gray-600">
          나가기
        </button>
      </div>
    </div>
  );
}
