"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  fetchRoomByRoomCode,
  leaveRoom,
  joinRoomAsGuest,
} from "@/app/api/room";
import {
  connectGameSocket,
  disconnectSocket,
  sendGuessMessage,
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
  guestId?: string | null;
  guestNickname?: string | null;
  winnerNickname?: string;
}

interface GameCard {
  id: number;
  number: number;
  color: "WHITE" | "BLACK";
  status: "OPEN" | "CLOSE";
  userId: string | null;
}

interface BroadcastMessage {
  action: string;
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
  const [guessResult, setGuessResult] = useState<{
    correct: boolean;
    cardId: number | null;
    openedCardOwnerNickname: string | null;
    guessedNumber: number | null;
  } | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [drawModalOpen, setDrawModalOpen] = useState(false);
  const [drawFailMessage, setDrawFailMessage] = useState<string | null>(null);

  const stompClientRef = useRef<CompatClient | null>(null);

  // 닉네임으로 userId 변환
  const getNicknameById = (id?: string | null) => {
    if (!room || !id) return "";
    if (id === room.hostId) return room.hostNickname;
    if (id === room.guestId) return room.guestNickname ?? "";
    return "";
  };

  useEffect(() => {
    const id = localStorage.getItem("sessionId");
    if (id) setUserId(id);
  }, []);

  useEffect(() => {
    if (!roomCode || !userId || stompClientRef.current) return;

    const handleMessage = (message: BroadcastMessage) => {
      switch (message.action) {
        case "ROOM_UPDATED":
        case "ROOM_CREATED":
          setRoom(message.payload);
          break;

        case "GAME_STARTED": {
          const allCards: GameCard[] = message.payload.cards || [];
          const my = allCards.filter(c => c.userId === userId);
          const opp = allCards.filter(c => c.userId && c.userId !== userId);
          setCards(allCards);
          setMyCards(sortCards(my));
          setOpponentCards(sortCards(opp));
          setRoom(prev => prev ? { ...prev, status: "PLAYING" } : prev);

          if (message.payload.currentTurnPlayerId) {
            setCurrentTurn(message.payload.currentTurnPlayerId);
          }
          setHasDrawn(false);
          break;
        }
        case "CARD_DRAWN": {
          const { card, userId: drawnUserId, color } = message.payload;
          if (drawnUserId === userId) {
            setMyCards(prev => sortCards([...prev, card]));
          } else {
            setOpponentCards(prev => sortCards([...prev, card]));
          }
          setHasDrawn(true);
          setDrawModalOpen(false);
          setDrawFailMessage(null);
          break;
        }
        case "DRAW_FAILED": {
          setDrawFailMessage(message.payload.reason || "카드 뽑기 실패");
          setDrawModalOpen(false);
          break;
        }
        case "CARD_OPENED": {
          const {
            cardId,
            nextTurnUserId,
            openedCardOwnerId,
            correct,
            guessedNumber,
            openedCardOwnerNickname,
            guesserId,
            openedMyCardId,
            openedMyCardInfo // 추가된 오픈된 카드 정보
          } = message.payload;

          setCurrentTurn(nextTurnUserId);

          // 전체 카드 상태 업데이트
          setCards(prev =>
            prev.map(c => {
              if (correct && c.id === cardId) return { ...c, status: "OPEN" }; // 정답일 때만 상대 카드 오픈
              if (openedMyCardId && c.id === openedMyCardId) return { ...c, status: "OPEN" }; // 오답이면 내 카드 오픈
              return c;
            })
          );

          // 내 카드 상태 업데이트
          setMyCards(prev =>
            prev.map(c =>
              openedMyCardId && c.id === openedMyCardId ? { ...c, status: "OPEN" } : c
            )
          );

          // 상대 카드 상태 업데이트
          setOpponentCards(prev =>
            prev.map(c =>
              correct && cardId && c.id === cardId ? { ...c, status: "OPEN" } :
              openedMyCardInfo && c.id === openedMyCardInfo.id ? { ...openedMyCardInfo, status: "OPEN" } : // 상대방 화면에서 내 카드 오픈
              c
            )
          );

          // 추리 결과 메시지 업데이트
          if (guesserId === userId) {
            setGuessResult({
              correct,
              cardId,
              openedCardOwnerNickname: openedCardOwnerNickname ?? getNicknameById(openedCardOwnerId),
              guessedNumber,
            });
          } else {
            setGuessResult(null);
          }

          setHasDrawn(false);
          break;
        }
        case "TURN_CHANGED": {
          setCurrentTurn(message.payload.nextTurnUserId);
          setHasDrawn(false);
          break;
        }
        case "GAME_ENDED":
          setWinner(message.payload.winnerNickname);
          break;

        case "ROOM_DELETED":
          router.push("/lobby");
          break;

        default:
          console.warn("Unknown message action:", message.action);
      }
    };

    const client = connectGameSocket(roomCode as string, handleMessage);
    stompClientRef.current = client;
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

  const isMyTurn = () => {
    if (!userId || !currentTurn) return false;
    return userId === currentTurn;
  };

  // 카드 더미에서 한 장 뽑기 (색상 선택)
  const handleDrawCard = (color: "WHITE" | "BLACK") => {
    if (!room || !userId || !stompClientRef.current) return;
    stompClientRef.current.send(
      "/app/rooms/draw",
      {},
      JSON.stringify({ roomCode: room.roomCode, userId, color })
    );
  };

  // 카드 맞추기 (뽑기 완료 후에만 가능)
  const canGuess = isMyTurn() && hasDrawn;

  const handleGuess = (cardId: number) => {
    if (!canGuess) return;
    const client = stompClientRef.current;
    if (!client || !client.connected) return;
    if (!room || !userId || !client) return;

    const guessedNumber = Number(prompt("상대 카드의 숫자를 추측해보세요 (0~11)"));
    if (isNaN(guessedNumber)) {
      alert("숫자를 정확히 입력하세요.");
      return;
    }
    
    sendGuessMessage(client, {
      roomCode: room.roomCode,
      userId,
      targetCardId: cardId,
      guessedNumber,
      //guessedColor: "WHITE" // 색상 추리도 필요하면 추가
    });
  };

  const handleStartGame = async () => {
    if (!room) return;
    sendStartMessage(stompClientRef.current!, room.roomCode);
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
        <p className="mt-1 text-md text-blue-500">
          현재 턴: <span className="font-bold">{getNicknameById(currentTurn)}</span>
        </p>
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
        <h3 className="font-bold"> 내 카드</h3>
        <div className="flex gap-2 mt-2">
          {myCards.map((card) => (
            <div
              key={card.id}
              className={`rounded w-20 h-40 text-center py-10 text-2xl ${
              card.status === "OPEN"
                ? card.color === "BLACK"
                  ? "text-pink-500 bg-black"
                  : "text-pink-500 bg-white border border-black"
                : card.color === "BLACK"
                ? "bg-black text-white"
                : "bg-white text-black border border-black"
              }`}
            >
              {card.number}
            </div>
          ))}
        </div>

        <h3 className="mt-4 font-bold"> 상대 카드</h3>
        <div className="flex gap-2 mt-2">
          {opponentCards.map((card) => (
            <div
              key={card.id}
              onClick={() => canGuess && card.status === "CLOSE" && handleGuess(card.id)}
              className={`rounded w-20 h-40 text-center py-10 text-2xl ${
              card.status === "OPEN"
                ? card.color === "BLACK"
                  ? "text-pink-500 bg-black"
                  : "text-pink-500 bg-white border border-black"
                : card.color === "BLACK"
                ? "bg-black text-white"
                : "bg-white text-black border border-black"
              }`}
              style={{
                cursor:
                  canGuess && card.status === "CLOSE"
                    ? "pointer"
                    : "default",
              }}
            >
              {card.status === "OPEN" ? card.number : "?"}
            </div>
          ))}
        </div>
      </div>

      {isMyTurn() && !hasDrawn && (
        <div className="mt-6 flex flex-col items-center">
          <button
            className="px-4 py-2 bg-yellow-500 text-white rounded shadow mb-2"
            onClick={() => setDrawModalOpen(true)}
          >
            카드 더미에서 한 장 뽑기
          </button>
          {drawFailMessage && (
            <div className="text-red-500">{drawFailMessage}</div>
          )}
        </div>
      )}
      {drawModalOpen && (
        <div className="fixed top-0 left-0 w-full h-full bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow flex flex-col items-center">
            <p className="mb-4 font-bold">어떤 색의 카드를 뽑을까요?</p>
            <div className="flex gap-4">
              <button
                className="px-4 py-2 bg-white text-black border border-black rounded hover:bg-gray-100"
                onClick={() => handleDrawCard("WHITE")}
              >
                흰색 카드
              </button>
              <button
                className="px-4 py-2 bg-black text-white border border-black rounded hover:bg-gray-800"
                onClick={() => handleDrawCard("BLACK")}
              >
                검은색 카드
              </button>
            </div>
            <button
              className="mt-6 px-3 py-1 rounded bg-gray-300"
              onClick={() => setDrawModalOpen(false)}
            >
              닫기
            </button>
          </div>
        </div>
      )}

  
      {guessResult && (
        <div className="mt-6 p-3 bg-gray-100 rounded shadow text-center">
          {guessResult.correct ? (
            <span className="text-green-600 font-bold">
              정답! {guessResult.openedCardOwnerNickname}의 카드({guessResult.guessedNumber})를 열었습니다.
            </span>
          ) : (
            <span className="text-red-600 font-bold">
              오답! 내 카드 한 장이 오픈됩니다.
            </span>
          )}
        </div>
      )}
    </div>
  );
}