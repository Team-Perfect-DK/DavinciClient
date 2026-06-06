"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { createRoom, fetchWaitingRooms } from "@/app/api/room";
import GlobalClientHandler from "@/components/GlobalClientHandler";
import { clearAuthSession, getSessionId } from "@/utils/authSession";

interface Room {
  id: string;
  title: string;
  roomCode: string;
  status: "WAITING" | "PLAYING";
  hostNickname: string;
  guestNickname?: string | null;
  players?: Array<{ id: string; nickname: string; seat: number; host: boolean }>;
  playerCount?: number;
  full?: boolean;
}

const getRoomPlayers = (room: Room) =>
  room.players?.length
    ? room.players
    : [
        { id: "host", nickname: room.hostNickname, seat: 1, host: true },
        ...(room.guestNickname
          ? [{ id: "guest", nickname: room.guestNickname, seat: 2, host: false }]
          : []),
      ];

export default function Lobby() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [socketError, setSocketError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [roomTitle, setRoomTitle] = useState("");
  const [stompClient, setStompClient] = useState<Client | null>(null);
  const router = useRouter();

  useEffect(() => {
    let client: Client | null = null;
    let cancelled = false;

    async function loadRooms() {
      try {
        const data = await fetchWaitingRooms();
        if (cancelled) return;
        setRooms(data);
        setError("");
      } catch {
        if (cancelled) return;
        setError("방 목록을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function initializeLobby() {
      const sessionId = getSessionId();
      if (!sessionId) {
        router.replace("/");
        return;
      }

      await loadRooms();
      if (cancelled) return;

      client = new Client({
        webSocketFactory: () => new SockJS(`${process.env.NEXT_PUBLIC_WS_URL}`),
        reconnectDelay: 5000,
        onConnect: () => {
          setSocketError("");
          client?.subscribe("/topic/rooms/update", (message) => {
            const body = JSON.parse(message.body);
            if (
              body.action === "ROOM_LIST_UPDATED" ||
              body.action === "ROOM_LIST_CHANGED"
            ) {
              void loadRooms();
            }
          });
        },
        onWebSocketError: () => {
          if (!cancelled) {
            setSocketError("실시간 연결이 끊겼습니다. 자동으로 다시 연결하고 있습니다.");
          }
        },
      });

      client.activate();
      setStompClient(client);
    }

    void initializeLobby().catch(() => {
      if (!cancelled) {
        setLoading(false);
        setError("로비를 불러오지 못했습니다.");
      }
    });

    return () => {
      cancelled = true;
      void client?.deactivate();
    };
  }, [router]);

  const handleCreateRoom = async () => {
    const title = roomTitle.trim();
    if (!title) {
      setError("방 이름을 입력해주세요.");
      return;
    }

    try {
      const newRoom = await createRoom(title);
      setRooms((prev) => [...prev, newRoom]);
      setRoomTitle("");
      setIsModalOpen(false);
      router.push(`/room/${newRoom.roomCode}`);
    } catch (createError) {
      if (
        createError instanceof Error &&
        createError.message === "SESSION_EXPIRED"
      ) {
        clearAuthSession();
        router.replace("/");
        return;
      }
      setError("방 생성에 실패했습니다.");
    }
  };

  const handleEnterRoom = (room: Room) => {
    const userId = getSessionId();
    if (!userId) {
      router.push("/");
      return;
    }

    const isFull = room.status === "WAITING" && (room.full || getRoomPlayers(room).length >= 4);
    const isPlaying = room.status === "PLAYING";
    if (isFull || isPlaying) return;

    if (stompClient?.connected) {
      stompClient.publish({
        destination: "/app/rooms/join",
        body: JSON.stringify({
          roomCode: room.roomCode,
          userId,
        }),
      });
    }

    router.push(`/room/${room.roomCode}`);
  };

  const waitingCount = rooms.filter(
    (room) => room.status === "WAITING" && getRoomPlayers(room).length < 4
  ).length;

  return (
    <main className="min-h-screen bg-[#f4f4f1] px-4 py-4 font-Arita text-[#101014]">
      <GlobalClientHandler />
      <section className="mx-auto flex min-h-[calc(100vh-32px)] w-full max-w-[1320px] flex-col border-[3px] border-black bg-white shadow-[12px_12px_0_#000]">
        <header className="flex flex-col gap-5 border-b-[3px] border-black px-6 py-6 sm:px-9 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-sm font-black uppercase tracking-[0.2em] text-[#11936e]">
              Lobby
            </p>
            <h1 className="text-5xl font-black leading-none sm:text-6xl">
              방 목록
            </h1>
            <p className="mt-4 text-base font-black text-[#5b5b63]">
              입장 가능한 방 {waitingCount}개
            </p>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full border-[3px] border-black bg-black px-6 py-4 text-lg font-black text-white shadow-[6px_6px_0_#11936e] transition hover:-translate-y-0.5 hover:shadow-[8px_8px_0_#11936e] sm:w-auto"
          >
            방 만들기
          </button>
        </header>

        <section className="flex flex-1 flex-col gap-5 px-6 py-6 sm:px-9">
          {error && (
            <div className="border-l-[4px] border-[#ff123f] bg-[#fff5f7] px-4 py-3 text-sm font-black text-[#ff123f]">
              {error}
            </div>
          )}
          {socketError && (
            <div className="border-l-[4px] border-[#f5c542] bg-[#fffbed] px-4 py-3 text-sm font-black text-[#705b00]">
              {socketError}
            </div>
          )}

          {loading ? (
            <div className="flex flex-1 items-center justify-center text-2xl font-black text-[#777]">
              방 목록을 불러오는 중
            </div>
          ) : rooms.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {rooms.map((room, index) => {
                const players = getRoomPlayers(room);
                const isFull = room.status === "WAITING" && (room.full || players.length >= 4);
                const isPlaying = room.status === "PLAYING";
                const canEnter = !isFull && !isPlaying;

                return (
                  <article
                    key={room.id}
                    className="border-[3px] border-black bg-white p-5 shadow-[7px_7px_0_#000]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#777]">
                          Room {String(index + 1).padStart(2, "0")}
                        </p>
                        <h2 className="mt-2 text-2xl font-black leading-tight">
                          {room.title}
                        </h2>
                        <p className="mt-2 text-sm font-black text-[#777]">
                          방장 {room.hostNickname}
                        </p>
                      </div>
                      <RoomStatusBadge isFull={isFull} isPlaying={isPlaying} />
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      {Array.from({ length: 4 }, (_, seatIndex) => {
                        const player = players.find((item) => item.seat === seatIndex + 1);
                        return (
                          <PlayerSlot
                            key={seatIndex}
                            label={seatIndex === 0 ? "Host" : `Player ${seatIndex + 1}`}
                            nickname={player?.nickname ?? "대기 중"}
                            empty={!player}
                          />
                        );
                      })}
                    </div>

                    <button
                      disabled={!canEnter}
                      onClick={() => handleEnterRoom(room)}
                      className="mt-5 w-full border-[3px] border-black bg-black px-5 py-3 text-sm font-black text-white shadow-[5px_5px_0_#11936e] transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-[#b7b7b7] disabled:text-white disabled:shadow-none"
                    >
                      {isPlaying ? "게임 진행 중" : isFull ? "입장 마감" : "입장하기"}
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20 text-center">
              <p className="text-3xl font-black">대기 중인 방이 없습니다</p>
              <p className="max-w-md text-base font-bold text-[#666]">
                새 방을 만들고 상대를 기다려보세요.
              </p>
            </div>
          )}
        </section>
      </section>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4">
          <div className="w-full max-w-md border-[3px] border-black bg-white p-6 shadow-[10px_10px_0_#000]">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-[#11936e]">
              New Room
            </p>
            <h2 className="text-3xl font-black">방 만들기</h2>
            <input
              type="text"
              className="mt-6 h-14 w-full border-[3px] border-black bg-white px-4 text-lg font-black outline-none shadow-[5px_5px_0_#000]"
              placeholder="방 이름 입력"
              value={roomTitle}
              maxLength={18}
              onChange={(event) => setRoomTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleCreateRoom();
              }}
            />
            <div className="mt-7 flex justify-end gap-3">
              <button
                className="border-[3px] border-black bg-white px-5 py-3 text-sm font-black shadow-[4px_4px_0_#000]"
                onClick={() => setIsModalOpen(false)}
              >
                취소
              </button>
              <button
                className="border-[3px] border-black bg-black px-5 py-3 text-sm font-black text-white shadow-[4px_4px_0_#11936e]"
                onClick={handleCreateRoom}
              >
                생성
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function RoomStatusBadge({
  isFull,
  isPlaying,
}: {
  isFull: boolean;
  isPlaying: boolean;
}) {
  const label = isPlaying ? "게임 진행 중" : isFull ? "입장 마감" : "대기 중";
  const color = isPlaying ? "bg-[#ff123f]" : isFull ? "bg-[#f5c542]" : "bg-[#20c997]";

  return (
    <span className={`border-[3px] border-black px-3 py-2 text-xs font-black ${color}`}>
      {label}
    </span>
  );
}

function PlayerSlot({
  label,
  nickname,
  empty = false,
}: {
  label: string;
  nickname: string;
  empty?: boolean;
}) {
  return (
    <div className="border-[3px] border-black px-4 py-3">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#777]">
        {label}
      </p>
      <p className={`mt-1 text-lg font-black ${empty ? "text-[#999]" : "text-[#101014]"}`}>
        {nickname}
      </p>
    </div>
  );
}
