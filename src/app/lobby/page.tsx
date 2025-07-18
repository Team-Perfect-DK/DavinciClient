"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWaitingRooms, createRoom } from "@/app/api/room";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import GlobalClientHandler from '@/components/GlobalClientHandler';

interface Room {
  id: string;
  title: string;
  roomCode: string;
  status: "WAITING" | "PLAYING";
  hostNickname: string;
  guestNickname?: string | null;
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
        console.log(data)
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
        client.subscribe(`/topic/rooms/update`, (m) => {
          const body = JSON.parse(m.body);
          console.log(body)
          if (body.action === "ROOM_LIST_UPDATED" || body.action === "ROOM_LIST_CHANGED") {
            loadRooms();
          }

        });
      },
    });
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
    
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-r from-[#0B0400] to-[#462512] relative pt-12">
      <GlobalClientHandler />
      {/* 프레임 이미지 */}
      <img
        src="/img/goldframe.svg"
        alt="gold frame"
        className="absolute w-[95%] max-w-7xl h-auto pointer-events-none z-0"
      />

      {/* 상단 제목 + 버튼 */}
      <div className="flex justify-between items-center w-[85%] max-w-6xl z-10 mb-6">
        <div className="text-4xl font-noto text-[#EDAE51] drop-shadow-[4px_4px_4px_rgba(0,0,0,0.3)]">
          ROOM LIST
        </div>
        <button
          className="w-52 text-2xl font-Arita border border-[#AF8039] text-[#AF8039] px-4 py-2 rounded bg-[#0C0601] hover:bg-[#EDAE51] hover:text-black transition-all"
          onClick={() => setIsModalOpen(true)}
        >
          방 만들기
        </button>
      </div>

      {/* 방 목록 */}
      <div className="w-[85%] max-w-6xl h-[400px] bg-[#111111] border border-[#AF8039] rounded-md overflow-y-scroll px-6 py-4 z-10">
        {rooms.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {rooms.map((room, idx) => {
              const isFull = room.status === "WAITING" && !!room.guestNickname;
              const isPlaying = room.status === "PLAYING";

              return (
                <div
                  key={room.id}
                  className="border border-[#EDAE51] bg-black p-6 rounded-md"
                >
                  <p className="text-white text-sm mb-1">{idx + 1}</p>
                  <h3 className="text-white text-lg font-semibold mb-2">
                    {room.title}
                  </h3>
                  <div className="flex justify-between items-center">
                    <p
                      className={`text-sm font-bold ${isPlaying
                          ? "text-red-600"
                          : isFull
                            ? "text-yellow-400"
                            : "text-green-400"
                        }`}
                    >
                      {isPlaying
                        ? "게임중"
                        : isFull
                          ? "인원 꽉참"
                          : "대기중"}
                    </p>
                    <button
                      className={`px-4 py-1 border border-[#EDAE51] rounded transition
                        ${isFull || isPlaying
                          ? "bg-gray-600 text-gray-300 cursor-not-allowed"
                          : "text-white hover:bg-[#EDAE51] hover:text-black"
                        }`}
                      disabled={isFull || isPlaying}
                      onClick={() => {
                        const userId = localStorage.getItem("sessionId");
                        if (!userId) {
                          alert("유저 정보가 없습니다.");
                          router.push("/");
                          return;
                        }

                        if (!isFull && !isPlaying && stompClient && stompClient.connected) {
                          stompClient.publish({
                            destination: "/app/rooms/join",
                            body: JSON.stringify({
                              roomCode: room.roomCode,
                              userId: userId,
                            }),
                          });

                          router.push(`/room/${room.roomCode}`);
                        }
                      }}
                    >
                      입장하기
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <p className="font-Arita text-white text-2xl">
              현재 대기중인 방이 없습니다.
            </p>
          </div>
        )}
      </div>

      {/* 방 생성 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-20">
          <div className="bg-[#111111] border border-[#EDAE51] text-white p-6 rounded-lg shadow-lg w-96">
            <h2 className="text-xl font-bold mb-4">방 만들기</h2>
            <input
              type="text"
              className="border border-[#EDAE51] bg-transparent text-white p-2 w-full mb-4"
              placeholder="방 제목 입력"
              value={roomTitle}
              onChange={(e) => setRoomTitle(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 border border-[#777] text-[#aaa] hover:bg-[#333]"
                onClick={() => setIsModalOpen(false)}
              >
                취소
              </button>
              <button
                className="px-4 py-2 border border-[#EDAE51] text-[#EDAE51] hover:bg-[#EDAE51] hover:text-black"
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
