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
import dynamic from "next/dynamic";
import GameEndOverlay from "@/components/GameEndOverlay";
import GlobalClientHandler from "@/components/GlobalClientHandler";

// 폭죽 라이브러리 동적
const ReactCanvasConfetti = dynamic(() => import("react-canvas-confetti"), {
  ssr: false,
});

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
  const [isGameEnded, setIsGameEnded] = useState(false);
  const [countdown, setCountdown] = useState<number>(5);
  const [deckEmpty, setDeckEmpty] = useState(false);

  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const confettiRef = useRef<any>(null);
  const stompClientRef = useRef<CompatClient | null>(null);

  const [flippedCards, setFlippedCards] = useState<number[]>([]);


  // guess 1회라도 했는지 여부
  const [hasGuessedOnce, setHasGuessedOnce] = useState(false);

  // 이전 턴의 userId 저장
  const prevTurnUserIdRef = useRef<string | null>(null);

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
    prevTurnUserIdRef.current = currentTurn;
  }, [currentTurn]);

  useEffect(() => {
    if (!roomCode || !userId || stompClientRef.current) return;

    const handleMessage = (message: BroadcastMessage) => {
      switch (message.action) {
        case "ROOM_UPDATED":
        case "ROOM_CREATED":
          setRoom(message.payload);
          break;

        case "GAME_STARTED": {
          setDeckEmpty(false);
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
          setGuessResult(null);
          setHasGuessedOnce(false);
          break;
        }

        case "CARD_DRAWN": {
          const { card, userId: drawnUserId, color, deckEmpty } = message.payload;
          setDeckEmpty(!!deckEmpty);
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
            openedCardInfo,
          } = message.payload;
          setCurrentTurn(nextTurnUserId);

          // 전체 카드 상태 업데이트
          if (openedCardInfo) {
            setCards(prev =>
              prev.map(c => c.id === openedCardInfo.id ? { ...c, ...openedCardInfo } : c)
            );
            setMyCards(prev =>
              prev.map(c => c.id === openedCardInfo.id ? { ...c, ...openedCardInfo } : c)
            );
            setOpponentCards(prev =>
              prev.map(c => c.id === openedCardInfo.id ? { ...c, ...openedCardInfo } : c)
            );

            // flip 애니메이션 트리거
            setTimeout(() => {
              setFlippedCards(prev => [...prev, openedCardInfo.id]);
            }, 30);
          }
          // 내가 guess한 턴에만 guessResult를 표시
          const wasMyTurn = prevTurnUserIdRef.current === userId;
          if (wasMyTurn) {
            setHasDrawn(true);
            setHasGuessedOnce(true); // guess 한 번이라도 했으면 true
            setGuessResult({
              correct,
              cardId,
              openedCardOwnerNickname: openedCardOwnerNickname ?? getNicknameById(openedCardOwnerId),
              guessedNumber,
            });
          } else {
            setHasDrawn(false);
            setGuessResult(null);
          }
          setDrawModalOpen(false);
          break;
        }

        case "TURN_CHANGED": {
          setCurrentTurn(message.payload.nextTurnUserId);
          setHasDrawn(false);
          setGuessResult(null);
          setHasGuessedOnce(false); // 턴이 바뀌면 초기화
          break;
        }

        case "GAME_ENDED":
          setWinner(message.payload.winnerNickname);
          setIsGameEnded(true);
          setRoom((prev) => prev ? { ...prev, status: "ENDED", winnerNickname: message.payload.winnerNickname } : prev);
          setCountdown(5);

          // 카운트다운 시작
          if (countdownRef.current) clearInterval(countdownRef.current);
          countdownRef.current = setInterval(() => {
            setCountdown((prev) => {
              if (prev <= 1) {
                clearInterval(countdownRef.current!);
                setWinner(null);
                setIsGameEnded(false);
                setRoom((prev) => prev ? { ...prev, status: "WAITING", winnerNickname: undefined } : prev);
                setCurrentTurn(null);
                setHasDrawn(false);
                setGuessResult(null);
                setHasGuessedOnce(false);
                setCards([]);
                setMyCards([]);
                setOpponentCards([]);
                return 5;
              }
              return prev - 1;
            });
          }, 1000);
          setGuessResult(null);
          setHasGuessedOnce(false);
          break;

        case "ROOM_DELETED":
          router.push("/lobby");
          break;

        case "GAME_RESET":
          alert(message.payload.reason || "상대방이 게임을 나가서 게임이 리셋되었습니다.");
          setRoom((prev) => prev ? { ...prev, status: "WAITING", winnerNickname: undefined } : prev);
          setWinner(null);
          setCurrentTurn(null);
          setHasDrawn(false);
          setGuessResult(null);
          setHasGuessedOnce(false);
          setCards([]);
          setMyCards([]);
          setOpponentCards([]);
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
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [roomCode, userId]);

  // 폭죽 효과 트리거
  useEffect(() => {
    if (isGameEnded && confettiRef.current) {
      confettiRef.current({
        particleCount: 200,
        spread: 120,
        origin: { y: 0.6 },
      });
    }
  }, [isGameEnded]);

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

  // 카드 더미에서 한 장 뽑기
  const handleDrawCard = (color: "WHITE" | "BLACK") => {
    if (!room || !userId || !stompClientRef.current) return;
    stompClientRef.current.send(
      "/app/rooms/draw",
      {},
      JSON.stringify({ roomCode: room.roomCode, userId, color })
    );
  };

  // 카드 맞추기는 카드 뽑은 후 여러 번 가능
  const canGuess = isMyTurn() && hasDrawn;
  // 턴 넘기기: 내 턴이고, 뽑았고, guess 한 번이라도 했으면
  const canPass = isMyTurn() && hasDrawn && hasGuessedOnce;

  const handleGuess = (cardId: number) => {
    if (!canGuess) return;
    const client = stompClientRef.current;
    if (!client || !client.connected) return;
    if (!room || !userId || !client) return;

    const input = prompt("상대 카드의 숫자를 추측해보세요 (0~11)");
    // 취소 or 빈 입력일 경우 아무 것도 하지 않고 return
    if (input === null || input.trim() === "") return;

    const guessedNumber = Number(input);
    if (isNaN(guessedNumber)) {
      alert("숫자를 정확히 입력하세요.");
      return;
    }

    sendGuessMessage(client, {
      roomCode: room.roomCode,
      userId,
      targetCardId: cardId,
      guessedNumber,
    });
  };

  // 턴 넘기기
  const handlePassTurn = () => {
    if (!canPass) return;
    if (!room || !userId || !stompClientRef.current) return;
    stompClientRef.current.send(
      "/app/rooms/turn/pass",
      {},
      JSON.stringify({ roomCode: room.roomCode, userId })
    );
    setHasDrawn(false);
    setHasGuessedOnce(false);
  };

  const handleStartGame = async () => {
    if (!room) return;
    if (!room.guestId) {
      alert("게스트가 있어야 게임을 시작할 수 있습니다.");
      return;
    }
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

  // 카드 덱이 비어있을 때만 자동으로 hasDrawn true
  useEffect(() => {
    if (deckEmpty && isMyTurn() && !hasDrawn && room?.status === "PLAYING") {
      setHasDrawn(true);
    }
  }, [deckEmpty, isMyTurn(), hasDrawn, room?.status]);

  const wasMyCardGuessed = (card: GameCard) =>
    card.userId === userId &&
    flippedCards.includes(card.id); // 이 카드가 맞혀진 카드인지


  if (loading) return <p>로딩 중...</p>;
  if (error) return <p className="text-red-500">{error}</p>;
  if (!room) return <p>방을 찾을 수 없습니다.</p>;


  return (
    <>
      <GlobalClientHandler />
      <div className={`font-Arita font-semibold min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-r from-[#0B0400] to-[#462512] relative pt-12 ${room?.status === "ENDED"
        ? "bg-gradient-to-b from-green-100 to-gray-300"
        : "bg-white"
        }`}>
        {/* 프레임 이미지 */}
        <img
          src="/img/goldframe.svg"
          alt="gold frame"
          className="absolute w-[95%] max-w-[1550px] h-auto pointer-events-none z-0"
        />
        <div className="w-full h-full rounded-lg shadow-lg flex justify-evenly items-end mb-4">
          <h1 className="text-4xl font-Arita text-[#EDAE51] ">{room.title}</h1>
          <p
            className={`text-lg font-semibold ${room.status === "WAITING"
              ? "text-green-500"
              : room.status === "PLAYING"
                ? "text-red-500"
                : "text-gray-500"
              }`}
          >
            {room.status === "WAITING"
              ? "대기 중"
              : room.status === "PLAYING"
                ? "게임 중"
                : "게임 종료"}
          </p>
        </div>
        <div className="w-95% min-w-[1100px] h-full min-h-[300px] max-h-[700px] bg-white z-10 p-6 rounded-lg shadow-lg display flex flex-col items-center">


          {/* 게임 종료 오버레이 */}
          {winner && room.status === "ENDED" && (
            <div className="fixed inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center z-50 transition-opacity duration-700">
              <GameEndOverlay isGameEnded={isGameEnded} />
              <div className="bg-white px-14 py-10 rounded-3xl shadow-2xl border-8 border-green-300 ring-4 ring-green-200 animate-fadeIn flex flex-col items-center relative z-10">
                <span className="text-5xl font-extrabold text-green-800 mb-4 drop-shadow animate-bounce">
                  🎉 게임 종료!
                </span>
                <span className="text-3xl font-bold text-green-600 mb-2 animate-pulse">
                  승자: {winner}
                </span>
                <span className="text-xl text-gray-700 mt-6 mb-2">
                  다음 게임까지{" "}
                  <span className="font-extrabold text-red-500">{countdown}</span>초
                </span>
                <button
                  className="mt-8 px-8 py-3 bg-blue-500 text-white rounded-xl shadow-xl hover:bg-blue-600 text-lg font-bold"
                  onClick={handleLeaveRoom}
                >
                  로비로 돌아가기
                </button>
              </div>
            </div>
          )}



          {/* 호스트/게스트 정보 */}
          <div className="flex justify-center items-center w-full max-w-md mb-4">
            <div className="w-1/2 text-center border-r-2 border-gray-300">
              <h2 className="text-2xl font-bold">👑 호스트</h2>
              <p className="text-blue-500 font-semibold">{room.hostNickname || "없음"}</p>
            </div>
            <div className="w-1/2 text-center">
              <h2 className="text-2xl font-bold">👤 게스트</h2>
              <p className="text-red-500 font-semibold">{room.guestNickname || "없음"}</p>
            </div>
          </div>

          {/* 현재 턴 안내 */}
          {!winner && currentTurn && room.status !== "ENDED" && (
            <p className="text-md text-[#EDAE51] font-semibold">
              현재 턴: <span className="font-bold ">{getNicknameById(currentTurn)}</span>
            </p>
          )}

          {/* 게임 시작/나가기 버튼 */}
          <div className="mt-2 flex gap-4">
            {room.hostId === userId && room.status === "WAITING" && (
              <button
                onClick={handleStartGame}
                className="px-4 py-2 bg-[#EDAE51] text-white font-semibold rounded-lg shadow-md hover:bg-[#462512]"
              >
                게임 시작
              </button>
            )}
            {room.status === "WAITING" && (
              <button
                onClick={handleLeaveRoom}
                className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg shadow-md hover:bg-gray-600"
              >
                나가기
              </button>
            )}
          </div>
          {/* 카드 영역 */}
          {room.status !== "ENDED" && (
            <div className="mt-6">
              {/* 내 카드 */}
              <h3 className="font-bold">내 카드</h3>
              <div className="flex gap-4 mt-2">
                {myCards.map((card) => {
                  const guessed = wasMyCardGuessed(card);

                  return (
                    <div
                      key={card.id}
                      className={`card-wrapper ${guessed ? "animate-card-flip" : ""
                        } transition-transform duration-700`}
                    >
                      <div
                        className={`card-face ${card.color === "BLACK" ? "bg-black" : "bg-white"
                          } ${guessed
                            ? "border-red-500 border-[4px] shadow-red text-red-500"
                            : `border-gray-300 border-2 shadow-xl ${card.color === "BLACK" ? "text-white" : "text-black"
                            }`
                          } rounded-xl font-bold text-[28px] flex items-center justify-center`}
                      >
                        {card.number}
                      </div>
                    </div>
                  );
                })}



              </div>



              {/* 상대 카드 */}
              <h3 className="mt-6 font-bold">상대 카드</h3>
              <div className="flex gap-4 mt-2">
                {opponentCards.map((card) => {
                  const isFlipped = flippedCards.includes(card.id) || card.status === "OPEN";

                  return (
                    <div
                      key={card.id}
                      className="card-wrapper hover:scale-[1.03] transition-transform duration-200"
                      onClick={() =>
                        canGuess && card.status === "CLOSE" && handleGuess(card.id)
                      }
                      style={{
                        cursor: canGuess && card.status === "CLOSE" ? "pointer" : "default",
                      }}
                    >
                      <div className={`card-inner ${isFlipped ? "is-flipped" : ""}`}>
                        {/* 앞면: 물음표 */}
                        <div
                          className={`card-face card-front ${card.color === "BLACK"
                            ? "bg-black text-white"
                            : "bg-white text-black"
                            }`}
                        >
                          <span className="text-5xl leading-none">?</span>
                        </div>

                        {/* 뒷면: 숫자 */}
                        <div
                          className={`card-face card-back ${card.color === "BLACK"
                            ? "bg-black text-red-500 border-red-500 shadow-red"
                            : "bg-white text-red-500 border-red-500 shadow-red"
                            }`}
                        >
                          {card.number}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}




          {/* 카드 뽑기/턴 넘기기 버튼 */}
          {isMyTurn() && !hasDrawn && room.status !== "ENDED" && !deckEmpty && (
            <div className="mt-6 flex flex-col items-center">
              <button
                className="px-4 py-2 bg-[#EDAE51] text-white rounded font-semibold shadow mb-2"
                onClick={() => setDrawModalOpen(true)}
              >
                카드 더미에서 한 장 뽑기
              </button>
              {drawFailMessage && (
                <div className="text-red-500">{drawFailMessage}</div>
              )}
            </div>
          )}
          {canPass && room.status !== "ENDED" && (
            <div className="mt-6 flex flex-col items-center">
              <button
                className="px-4 py-2 bg-gray-500 text-white rounded shadow"
                onClick={handlePassTurn}
              >
                턴 넘기기
              </button>
            </div>
          )}

          {/* 카드 뽑기 모달 */}
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

          {/* 정오답 결과 */}
          {guessResult && room.status !== "ENDED" && (
            <div className="mt-6 p-3 bg-gray-100 rounded shadow text-center">
              {guessResult.correct ? (
                <span className="text-green-600 font-bold">
                  정답! {guessResult.openedCardOwnerNickname}의 카드({guessResult.guessedNumber})를 열었습니다.
                </span>
              ) : (
                <span className="text-red-600 font-bold">
                  오답! 카드 한 장이 오픈되고, 턴이 넘어갑니다.
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </>

  );
}