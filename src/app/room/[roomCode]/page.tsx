"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  fetchRoomByRoomCode,
  startGame,
  leaveRoom,
  joinRoomAsGuest,
} from "@/app/api/room";
import {
  connectGameSocket,
  disconnectSocket,
  sendGuessMessage,
  sendJoinMessage,
  sendStartMessage,
} from "@/utils/stompClient";
import { CompatClient } from "@stomp/stompjs";

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

interface GameCard {
  id: number;
  number: number;
  color: "WHITE" | "BLACK";
  status: "OPEN" | "CLOSE";
  userId: string;
}

interface BroadcastMessage {
  type: string;
  payload?: any;
}

export default function RoomPage() {
  const router = useRouter();
  const { roomCode } = useParams();

  const [room, setRoom] = useState<Room | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [winner, setWinner] = useState<string | null>(null);
  const [currentTurn, setCurrentTurn] = useState<string | null>(null);
  const [cards, setCards] = useState<GameCard[]>([]);
  const [myCards, setMyCards] = useState<GameCard[]>([]);
  const [opponentCards, setOpponentCards] = useState<GameCard[]>([]);

  const stompClientRef = useRef<CompatClient | null>(null);

  useEffect(() => {
    const id = localStorage.getItem("sessionId");
    if (id) setUserId(id);
  }, []);

  useEffect(() => {
    if (!roomCode || !userId || stompClientRef.current) return;

  const handleMessage = (message: BroadcastMessage) => {
    console.log("수신 메시지:", message);

    switch (message.type) {
      case "ROOM_UPDATED":
      case "ROOM_CREATED":
        setRoom(message.payload);
        break;

      case "GAME_STARTED": {
        const allCards: GameCard[] = message.payload.cards;
        const my = allCards.filter(c => c.userId === userId);
        const opp = allCards.filter(c => c.userId !== userId);
        setCards(allCards);
        setMyCards(sortCards(my));
        setOpponentCards(sortCards(opp));
        setRoom(prev => prev ? { ...prev, status: "PLAYING" } : prev);
        break;
      }

      case "CARD_OPENED": {
        const { cardId, nextTurnUserId } = message.payload;
        setCurrentTurn(nextTurnUserId);
        setCards(prev => prev.map(c => c.id === cardId ? { ...c, status: "OPEN" } : c));
        break;
      }

      case "TURN_CHANGED": {
        setCurrentTurn(message.payload.nextTurnUserId);
        break;
      }

      case "GAME_ENDED":
        setWinner(message.payload.winnerNickname);
        break;

      case "ROOM_DELETED":
        router.push("/lobby");
        break;

      default:
        console.warn("Unknown message action:", message.type);
    }
  };

    const client = connectGameSocket(roomCode as string, handleMessage);
    stompClientRef.current = client;
    console.log("stomp client 상태", client);
    fetchRoomByRoomCode(roomCode as string)
      .then(async (data) => {
        if (!data) throw new Error("방 정보가 없습니다.");
        let finalRoom: Room;

        if (
          data &&
          userId &&
          data.hostId &&
          !data.guestId &&
          data.hostId !== userId
        ) {
          const joined = await joinRoomAsGuest(data.roomCode, userId);
          finalRoom =
            joined.action === "ROOM_UPDATED" ? joined.payload : joined;
        } else {
          finalRoom = data;
        }
        setRoom(finalRoom);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError("방 정보를 불러올 수 없습니다.");
        setLoading(false);
      });

    return () => {
      disconnectSocket();
    };
  }, [roomCode, userId]);

  const sortCards = (cards: GameCard[]) =>
    [...cards].sort((a, b) => {
      if (a.number === b.number) {
        return a.color === "WHITE" && b.color === "BLACK" ? -1 : 1;
      }
      return a.number - b.number;
    });

  const handleGuess = (cardId: number) => {
    const client = stompClientRef.current;
    if (!client || !client.connected) {
    console.warn("STOMP 연결되지 않음, 메시지 전송 중단");
    return;
  }
    if (!room || !userId || !client) return;

    const guessedNumber = Number(prompt("상대 카드의 숫자를 추측해보세요 (0~11)"));
    if (isNaN(guessedNumber)) {
      alert("숫자를 정확히 입력하세요.");
      return;
    }
    console.log("카드 추측 메시지 전송:", cardId, guessedNumber);
    sendGuessMessage(client, {
      roomCode: room.roomCode,
      userId,
      targetCardId: cardId,
      guessedNumber,
    });
  };

  const handleStartGame = async () => {
    if (!room) return;
    try {
      await startGame(room.roomCode);
      sendStartMessage(stompClientRef.current!, room.roomCode);
    } catch {
      alert("게임을 시작할 수 없습니다.");
    }
  };

  const handleLeaveRoom = async () => {
    if (!room || !userId) return;
    try {
      await leaveRoom(room.roomCode, userId);
      router.push("/lobby");
    } catch {
      alert("방을 나갈 수 없습니다.");
    }
  };

  if (loading) return <p>로딩 중...</p>;
  if (error) return <p className="text-red-500">{error}</p>;
  if (!room) return <p>방을 찾을 수 없습니다.</p>;

  return (
    <div className="min-h-screen flex flex-col items-center p-8">
      <h1 className="text-2xl font-bold mb-4">{room.title}</h1>
      <p className="text-gray-500">방 코드: {room.roomCode}</p>
      <p
        className={`text-lg font-semibold ${
          room.status === "WAITING" ? "text-green-500" : "text-red-500"
        }`}
      >
        {room.status === "WAITING" ? "대기 중" : "게임 중"}
      </p>

      {winner && (
        <p className="mt-2 text-xl font-bold text-green-600">
          🎉 승자: {winner}
        </p>
      )}
      {currentTurn && (
        <p className="mt-1 text-md text-blue-500">현재 턴: {currentTurn}</p>
      )}

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
          {myCards.map((card) => (
            <div
              key={card.id}
              className={`rounded w-20 h-40 text-center py-10 text-2xl ${
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
          {opponentCards.map((card) => (
            <div
              key={card.id}
              onClick={() => handleGuess(card.id)}
              className={`rounded w-20 h-40 text-center py-10 text-2xl cursor-pointer ${
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
