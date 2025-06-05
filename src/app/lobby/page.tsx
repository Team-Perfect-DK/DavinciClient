"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation"; 
import { fetchWaitingRooms, createRoom } from "@/app/api/room";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";

interface Room {
  id: string;
  title: string;
  roomCode: string;
  status: "WAITING" | "PLAYING";
}

export default function Lobby() {
  const [rooms, setRooms] = useState<Room[]>([]); 
  const [loading, setLoading] = useState<boolean>(true); 
  const [error, setError] = useState<string>(""); 
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false); 
  const [roomTitle, setRoomTitle] = useState<string>(""); 
  const [stompClient, setStompClient] = useState<Client | null>(null);

  const router = useRouter();

  useEffect(() => {
    async function loadRooms() {
      try {
        const data = await fetchWaitingRooms();
        setRooms(data);
      } catch (err) {
        setError("방 정보를 불러올 수 없습니다.");
      } finally {
        setLoading(false);
      }
    }
    loadRooms();
    
    const socket = new SockJS(`${process.env.NEXT_PUBLIC_WS_URL}`);
    const client = new Client({
      webSocketFactory: () => socket,
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe(`/topic/rooms/update`, (message) => {
          try {
            loadRooms();
          } catch (err) {
            console.error("방 리스트 수신 실패:", err);
          }
        });
      }
    })
    client.activate();
    setStompClient(client);

    return () => {
      client.deactivate();
    };
  }, []);

  const handleCreateRoom = async () => {
    if (!roomTitle.trim()) return;
    try {
      const newRoom = await createRoom(roomTitle);
      setRooms((prev) => [...prev, newRoom]);
      setIsModalOpen(false);
      router.push(`/room/${newRoom.roomCode}`);
    } catch (err) {
      setError("방 생성에 실패했습니다.");
    }
  };



  return (
    <div className="min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-4">로비 - 대기 중인 방</h1>
      <button
        className="mb-4 px-4 py-2 bg-blue-600 text-white rounded-lg"
        onClick={() => setIsModalOpen(true)}
      >
        방 만들기
      </button>

      {loading && <p>로딩 중...</p>}
      {error && <p className="text-red-500">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.length > 0 ? (
          rooms.map((room) => (
            <div key={room.id} className="border p-4 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold">{room.title}</h2>
              <p className="text-gray-500">방 코드: {room.roomCode}</p>
              <p className="text-green-500">
                {room.status === "WAITING" ? "대기 중" : "게임 중"}
              </p>
              <button
                className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-lg"
                onClick={() => router.push(`/room/${room.roomCode}`)}
              >
                입장하기
              </button>
            </div>
          ))
        ) : (
          <p className="text-gray-500">대기 중인 방이 없습니다.</p>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-2">방 만들기</h2>
            <input
              type="text"
              className="border p-2 w-full mb-4"
              placeholder="방 제목 입력"
              value={roomTitle}
              onChange={(e) => setRoomTitle(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 bg-gray-400 text-white rounded-lg"
                onClick={() => setIsModalOpen(false)}
              >
                취소
              </button>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                onClick={handleCreateRoom}
              >
                방 생성
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
