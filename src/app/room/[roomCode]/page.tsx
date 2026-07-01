"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { fetchRoomByRoomCode, startGame, leaveRoom, joinRoomAsGuest, sendRoomHeartbeat } from "@/app/api/room";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";

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
  const [stompClient, setStompClient] = useState<Client | null>(null);

  const userId = typeof window !== "undefined" ? localStorage.getItem("sessionId") : null;

  useEffect(() => {
    if (!roomCode || !userId) return;

    const currentRoomCode = Array.isArray(roomCode) ? roomCode[0] : roomCode;
    const heartbeat = () => {
      sendRoomHeartbeat(currentRoomCode, userId).catch((err) => {
        console.error("Room heartbeat failed:", err);
      });
    };

    heartbeat();
    const intervalId = window.setInterval(heartbeat, 2 * 60 * 60 * 1000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        heartbeat();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", heartbeat);
    window.addEventListener("online", heartbeat);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", heartbeat);
      window.removeEventListener("online", heartbeat);
    };
  }, [roomCode, userId]);

  useEffect(() => {
    if (!roomCode || !userId) return;

    async function initRoom() {
      try {
        const data = await fetchRoomByRoomCode(roomCode as string);
        setRoom(data as Room);

        if (data && userId && data.hostId && !data.guestId && data.hostId !== userId) {
          const updatedRoom = await joinRoomAsGuest(data.roomCode, userId);
          setRoom(updatedRoom);
        }
      } catch (err) {
        setError("방 정보를 불러올 수 없습니다.");
      } finally {
        setLoading(false);
      }
    }

    initRoom();

    const socket = new SockJS(`${process.env.NEXT_PUBLIC_WS_URL}`);
    const client = new Client({
      webSocketFactory: () => socket,
      reconnectDelay: 5000,
      onConnect: () => {
        // 메시지 수신 구독
        client.subscribe(`/topic/rooms/${roomCode}`, (message) => {
          try {
            const updatedRoom = JSON.parse(message.body);
            setRoom(updatedRoom);
          } catch (err) {
            console.error("메시지 파싱 오류:", err);
          }
        });

        // 서버에 방 참가 메시지 보내기
        client.publish({
          destination: "/app/rooms/join",
          body: JSON.stringify({ roomCode, userId }),
        });
      },
      onStompError: (frame) => {
        console.error("STOMP 오류:", frame);
      },
    });

    client.activate();
    setStompClient(client);

    return () => {
      client.deactivate();
    };
  }, [roomCode, userId]);




  async function handleStartGame() {
    if (!room) return;
    try {
      await startGame(room.roomCode);
      stompClient?.publish({
        destination: "/app/rooms/start",
        body: JSON.stringify({ roomCode: room.roomCode }),
      });
    } catch (err) {
      alert("게임을 시작할 수 없습니다.");
    }
  }

  async function handleLeaveRoom() {
    if (!room || !userId) return;
    try {
      await leaveRoom(room.roomCode, userId);
      stompClient?.publish({
        destination: "/app/rooms/leave",
        body: JSON.stringify({ roomCode: room.roomCode, userId }),
      });
      router.push("/lobby");
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
