"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  fetchRoomByRoomCode,
  startGame,
  leaveRoom,
  joinRoomAsGuest,
} from "@/app/api/room";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { connectGameSocket, sendGuessMessage } from "@/utils/stompClient";

interface Room {
  id: string;
  title: string;
  roomCode: string;
  status: "WAITING" | "PLAYING" | "ENDED";
  hostId: string;
  hostNickname: string;
  guestId: string | null;
  guestNickname: string | null;
  winnerNickname?: string;
}

interface GameBroadcast {
  action: "CARD_OPENED" | "GAME_ENDED";
  cardId: number;
  nextTurnUserId?: string;
  winnerNickname?: string;
}

interface GameCard {
  id: number;
  number: number;
  color: "WHITE" | "BLACK";
  status: "OPEN" | "CLOSE";
  userId: string;
}

export default function RoomPage() {
  const router = useRouter();
  const { roomCode } = useParams();
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stompClient, setStompClient] = useState<Client | null>(null);
  const [winner, setWinner] = useState<string | null>(null);
  const [currentTurn, setCurrentTurn] = useState<string | null>(null);
  const [cards, setCards] = useState<GameCard[]>([]);
  const [myCards, setMyCards] = useState<GameCard[]>([]);
  const [opponentCards, setOpponentCards] = useState<GameCard[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const id = localStorage.getItem("sessionId");
    if (id) setUserId(id);
  }, []);

  function sortCards(cards: GameCard[]) {
  return [...cards].sort((a, b) => {
    if (a.number === b.number) {
      return a.color === "WHITE" && b.color === "BLACK" ? -1 : 1;
    }
    return a.number - b.number;
  });
}


  useEffect(() => {
    if (!roomCode || !userId) return;
    let client: Client;

    async function initRoomAndConnectSocket() {
      try {
        const data = await fetchRoomByRoomCode(roomCode as string);
        let finalRoom: Room;

        if (!data) throw new Error("방 정보가 없습니다.");

        if (data && userId && data.hostId && !data.guestId && data.hostId !== userId) {
          const joined = await joinRoomAsGuest(data.roomCode, userId);
          finalRoom = joined.type === "ROOM_UPDATED" ? joined.payload : joined;
        } else {
          finalRoom = data;
        }

        setRoom(finalRoom);
        setLoading(false);

        // WebSocket: 방 상태 구독
        const socket = new SockJS(`${process.env.NEXT_PUBLIC_WS_URL}`);
        client = new Client({
          webSocketFactory: () => socket,
          reconnectDelay: 5000,
          onConnect: () => {
            client.subscribe(`/topic/rooms/${roomCode}`, (message) => {
              try {
                const data = JSON.parse(message.body);
                if ("type" in data && "payload" in data) {
                  switch (data.type) {
                    case "ROOM_UPDATED":
                    case "ROOM_CREATED":
                      setRoom(data.payload);
                      break;
                    case "GAME_STARTED":
                      const allCards: GameCard[] = data.payload?.cards ?? [];
                      const my = sortCards(allCards.filter(card => String(card.userId) === String(userId)));
                      const opp = sortCards(allCards.filter(card => String(card.userId) !== String(userId)));
                      setCards(allCards);
                      setMyCards(my);
                      setOpponentCards(opp);
                      setRoom(prev => prev ? { ...prev, status: "PLAYING" } : prev);
                      break;
                    case "ROOM_DELETED":
                      router.push("/lobby");
                      break;
                  }
                }
              } catch (err) {
                console.error("WebSocket 메시지 파싱 오류:", err);
              }
            });

            client.publish({
              destination: "/app/rooms/join",
              body: JSON.stringify({ roomCode, userId }),
            });
          },
        });
        client.activate();
        setStompClient(client);
      } catch (err) {
        console.error(err);
        setError("방 정보를 불러올 수 없습니다.");
        setLoading(false);
      }
    }

    initRoomAndConnectSocket();

    connectGameSocket(roomCode as string, (data: GameBroadcast) => {
      if (data.action === "CARD_OPENED") {
        console.log("카드 공개됨:", data.cardId);
        setCurrentTurn(data.nextTurnUserId ?? null);

      } else if (data.action === "GAME_ENDED") {
        setWinner(data.winnerNickname ?? null);
      }
    });

    return () => {
      if (client) client.deactivate();
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
    } catch {
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
    } catch {
      alert("방을 나갈 수 없습니다.");
    }
  }

  function handleTestGuess() {
    if (!room || !userId) return;
    sendGuessMessage({
      roomCode: room.roomCode,
      userId,
      targetCardId: 42, // 테스트용
      guessedNumber: 7,
      guessedColor: "BLACK",
    });
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

      {winner && <p className="mt-2 text-xl font-bold text-green-600">🎉 승자: {winner}</p>}
      {currentTurn && <p className="mt-1 text-md text-blue-500">현재 턴: {currentTurn}</p>}

      <div className="flex justify-center items-center w-full max-w-md mt-6">
        <div className="w-1/2 text-center border-r-2 border-gray-300">
          <h2 className="text-xl font-bold"> 호스트</h2>
          <p className="text-blue-500">{room.hostNickname || "없음"}</p>
        </div>
        <div className="w-1/2 text-center">
          <h2 className="text-xl font-bold"> 게스트</h2>
          <p className="text-red-500">{room.guestNickname || "없음"}</p>
        </div>
      </div>

      <div className="mt-6 flex gap-4">
        {room.hostId === userId && room.status === "WAITING" && (
          <button
            onClick={handleStartGame}
            className="px-4 py-2 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600"
          >
            게임 시작
          </button>
        )}
        {room.status === "WAITING" && (
          <button
            onClick={handleLeaveRoom}
            className="px-4 py-2 bg-gray-500 text-white rounded-lg shadow-md hover:bg-gray-600"
          >
            나가기
          </button>
        )}


      </div>

      <div className="mt-6">
        <h3 className="font-bold">🃏 내 카드</h3>
        <div className="flex gap-2 mt-2">
          {myCards.map(card => (
            <div
              key={card.id}
              className={` rounded w-20 h-40 text-center py-10 text-2xl ${
                card.color === "BLACK"
                  ? "bg-black text-white border border-gray-700"
                  : "bg-white text-black border border-black"
              }`}
            >
              {card.number}
            </div>
          ))}
        </div>


        <h3 className="mt-4 font-bold">🎯 상대 카드</h3>
        <div className="flex gap-2 mt-2">
          {opponentCards.map(card => (
            <div
              key={card.id}
              className={`rounded w-20 h-40 text-center py-10 text-2xl ${
                card.color === "BLACK"
                  ? "bg-black text-pink-500 border border-gray-700"
                  : "bg-white text-pink-500 border border-black"
              }`}
            >
              ?
            </div>
          ))}
        </div>

      </div>



    </div>
  );
}
