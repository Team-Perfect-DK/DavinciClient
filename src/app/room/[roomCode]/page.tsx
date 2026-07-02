"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CompatClient } from "@stomp/stompjs";
import {
  fetchGameState,
  fetchRoomByRoomCode,
  joinRoomAsGuest,
  leaveRoom,
  sendRoomHeartbeat,
} from "@/app/api/room";
import GameEndOverlay from "@/components/GameEndOverlay";
import GlobalClientHandler from "@/components/GlobalClientHandler";
import {
  connectGameSocket,
  disconnectSocket,
  sendGuessMessage,
  sendSocketMessage,
  sendStartMessage,
} from "@/utils/stompClient";

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
  currentTurnPlayerId?: string | null;
  currentTurnHasDrawn?: boolean;
  currentTurnHasGuessed?: boolean;
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

type LogTone = "normal" | "success" | "danger" | "accent";

interface GameLog {
  id: number;
  message: string;
  tone?: LogTone;
}

interface DialogState {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "normal" | "danger";
  onConfirm?: () => void;
}

const TOTAL_DECK_SIZE = 24;
const GUESS_NUMBERS = Array.from({ length: 12 }, (_, index) => index);

export default function RoomPage() {
  const router = useRouter();
  const params = useParams();
  const roomCode = Array.isArray(params.roomCode)
    ? params.roomCode[0]
    : params.roomCode;

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
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [hasGuessedOnce, setHasGuessedOnce] = useState(false);
  const [guessModalCard, setGuessModalCard] = useState<GameCard | null>(null);
  const [selectedGuessNumber, setSelectedGuessNumber] = useState<number | null>(
    null
  );
  const [logs, setLogs] = useState<GameLog[]>([]);
  const [socketReady, setSocketReady] = useState(false);
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const stompClientRef = useRef<CompatClient | null>(null);
  const prevTurnUserIdRef = useRef<string | null>(null);
  const isLeavingRoomRef = useRef(false);
  const logIdRef = useRef(0);
  const roomRef = useRef<Room | null>(null);

  const sortCards = useCallback((cardList: GameCard[]) => {
    return [...cardList].sort((a, b) => {
      if (a.number === b.number) {
        return a.color === "WHITE" && b.color === "BLACK" ? -1 : 1;
      }
      return a.number - b.number;
    });
  }, []);

  const addLog = useCallback((message: string, tone: LogTone = "normal") => {
    setLogs((prev) => [
      { id: ++logIdRef.current, message, tone },
      ...prev.slice(0, 8),
    ]);
  }, []);

  const showNotice = useCallback((title: string, message: string) => {
    setDialog({
      title,
      message,
      confirmText: "확인",
    });
  }, []);

  const getNicknameById = useCallback(
    (id?: string | null) => {
      const latestRoom = roomRef.current;
      if (!latestRoom || !id) return "상대";
      if (id === latestRoom.hostId) return latestRoom.hostNickname;
      if (id === latestRoom.guestId) return latestRoom.guestNickname ?? "상대";
      return "상대";
    },
    []
  );

  const syncGameState = useCallback(async () => {
    if (!roomCode || !userId) return;

    const state = await fetchGameState(roomCode);
    const allCards = state.cards || [];
    const my = allCards.filter((card) => card.userId === userId);
    const opponent = allCards.filter(
      (card) => card.userId && card.userId !== userId
    );

    setRoom(state.room as Room);
    setCards(allCards);
    setMyCards(sortCards(my));
    setOpponentCards(sortCards(opponent));
    setCurrentTurn(state.room.currentTurnPlayerId ?? null);
    setHasDrawn(!!state.room.currentTurnHasDrawn);
    setHasGuessedOnce(!!state.room.currentTurnHasGuessed);
    setDeckEmpty(!!state.deckEmpty);
    setFlippedCards(
      allCards
        .filter((card) => card.status === "OPEN")
        .map((card) => card.id)
    );
  }, [roomCode, sortCards, userId]);

  const myNickname = useMemo(() => {
    if (!room || !userId) return "나";
    return userId === room.hostId
      ? room.hostNickname
      : room.guestNickname ?? "나";
  }, [room, userId]);

  const opponentNickname = useMemo(() => {
    if (!room || !userId) return "상대";
    if (userId === room.hostId) return room.guestNickname ?? "대기 중";
    return room.hostNickname || "상대";
  }, [room, userId]);

  const isMyTurn = Boolean(userId && currentTurn && userId === currentTurn);
  const canGuess = isMyTurn && hasDrawn;
  const canPass = isMyTurn && hasDrawn && hasGuessedOnce;
  const remainingTiles = Math.max(
    TOTAL_DECK_SIZE - myCards.length - opponentCards.length,
    0
  );

  useEffect(() => {
    const id = localStorage.getItem("sessionId");
    if (id) {
      setUserId(id);
    } else {
      router.replace("/");
    }
  }, [router]);

  useEffect(() => {
    prevTurnUserIdRef.current = currentTurn;
  }, [currentTurn]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

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
          const my = allCards.filter((card) => card.userId === userId);
          const opponent = allCards.filter(
            (card) => card.userId && card.userId !== userId
          );
          setCards(allCards);
          setMyCards(sortCards(my));
          setOpponentCards(sortCards(opponent));
          setRoom((prev) =>
            prev ? { ...prev, status: "PLAYING" } : prev
          );
          setCurrentTurn(message.payload.currentTurnPlayerId ?? null);
          setHasDrawn(false);
          setGuessResult(null);
          setHasGuessedOnce(false);
          setLogs([]);
          addLog("게임이 시작되었습니다.", "accent");
          break;
        }

        case "CARD_DRAWN": {
          const {
            card,
            userId: drawnUserId,
            color,
            deckEmpty: nextDeckEmpty,
          } = message.payload;
          const nickname =
            drawnUserId === userId ? myNickname : opponentNickname;
          setDeckEmpty(!!nextDeckEmpty);
          if (drawnUserId === userId) {
            setMyCards((prev) => sortCards([...prev, card]));
          } else {
            setOpponentCards((prev) => sortCards([...prev, card]));
          }
          setCards((prev) => [...prev, card]);
          setHasDrawn(true);
          setDrawModalOpen(false);
          setDrawFailMessage(null);
          addLog(
            `${nickname}님이 ${color === "BLACK" ? "검은" : "흰"} 타일을 뽑았습니다.`,
            "normal"
          );
          break;
        }

        case "DRAW_FAILED":
          setDrawFailMessage(message.payload.reason || "타일을 뽑지 못했습니다.");
          setDrawModalOpen(false);
          addLog("타일 뽑기에 실패했습니다.", "danger");
          break;

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

          if (openedCardInfo) {
            setCards((prev) =>
              prev.map((card) =>
                card.id === openedCardInfo.id ? { ...card, ...openedCardInfo } : card
              )
            );
            setMyCards((prev) =>
              prev.map((card) =>
                card.id === openedCardInfo.id ? { ...card, ...openedCardInfo } : card
              )
            );
            setOpponentCards((prev) =>
              prev.map((card) =>
                card.id === openedCardInfo.id ? { ...card, ...openedCardInfo } : card
              )
            );

            window.setTimeout(() => {
              setFlippedCards((prev) =>
                prev.includes(openedCardInfo.id)
                  ? prev
                  : [...prev, openedCardInfo.id]
              );
            }, 30);
          }

          const wasMyTurn = prevTurnUserIdRef.current === userId;
          const ownerNickname =
            openedCardOwnerNickname ?? getNicknameById(openedCardOwnerId);

          if (wasMyTurn) {
            setHasDrawn(true);
            setHasGuessedOnce(true);
            setGuessResult({
              correct,
              cardId,
              openedCardOwnerNickname: ownerNickname,
              guessedNumber,
            });
          } else {
            setHasDrawn(false);
            setGuessResult(null);
          }

          addLog(
            correct
              ? `적중! ${ownerNickname}님의 타일은 ${guessedNumber}였습니다.`
              : `실패! 추측한 숫자 ${guessedNumber}가 아니었습니다.`,
            correct ? "success" : "danger"
          );
          setGuessModalCard(null);
          setSelectedGuessNumber(null);
          break;
        }

        case "TURN_CHANGED":
          setCurrentTurn(message.payload.nextTurnUserId);
          setHasDrawn(false);
          setGuessResult(null);
          setHasGuessedOnce(false);
          addLog(
            `${
              message.payload.nextTurnUserNickname ??
              getNicknameById(message.payload.nextTurnUserId)
            }님의 차례입니다.`,
            "accent"
          );
          break;

        case "GAME_ENDED":
          setWinner(message.payload.winnerNickname);
          setIsGameEnded(true);
          setDrawModalOpen(false);
          setGuessModalCard(null);
          setSelectedGuessNumber(null);
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  status: "ENDED",
                  winnerNickname: message.payload.winnerNickname,
                }
              : prev
          );
          setCountdown(5);
          addLog(`${message.payload.winnerNickname}님이 승리했습니다.`, "success");

          if (countdownRef.current) clearInterval(countdownRef.current);
          countdownRef.current = setInterval(() => {
            setCountdown((prev) => {
              if (prev <= 1) {
                clearInterval(countdownRef.current!);
                setWinner(null);
                setIsGameEnded(false);
                setRoom((prevRoom) =>
                  prevRoom
                    ? {
                        ...prevRoom,
                        status: "WAITING",
                        winnerNickname: undefined,
                      }
                    : prevRoom
                );
                setCurrentTurn(null);
                setHasDrawn(false);
                setGuessResult(null);
                setHasGuessedOnce(false);
                setCards([]);
                setMyCards([]);
                setOpponentCards([]);
                setFlippedCards([]);
                setLogs([]);
                return 5;
              }
              return prev - 1;
            });
          }, 1000);
          setGuessResult(null);
          setHasGuessedOnce(false);
          break;

        case "ROOM_DELETED":
          router.replace("/lobby");
          break;

        case "GAME_RESET":
          if (isLeavingRoomRef.current) {
            break;
          }
          showNotice(
            "게임이 종료되었습니다",
            message.payload.reason ||
              "상대방이 나가 게임이 대기 상태로 돌아갔습니다."
          );
          setRoom((prev) =>
            prev ? { ...prev, status: "WAITING", winnerNickname: undefined } : prev
          );
          setWinner(null);
          setCurrentTurn(null);
          setHasDrawn(false);
          setGuessResult(null);
          setHasGuessedOnce(false);
          setCards([]);
          setMyCards([]);
          setOpponentCards([]);
          setFlippedCards([]);
          setLogs([]);
          break;

        default:
          console.warn("Unknown message action:", message.action);
      }
    };

    setSocketReady(false);
    const client = connectGameSocket(roomCode, handleMessage, {
      onConnect: () => {
        setSocketReady(true);
        setHasConnectedOnce(true);
        addLog("서버와 연결되었습니다.", "success");
        if (roomRef.current) {
          void syncGameState().catch((syncError) => {
            console.warn("Failed to sync game state:", syncError);
            addLog("게임 상태를 다시 불러오지 못했습니다.", "danger");
          });
        }
      },
      onDisconnect: () => {
        setSocketReady(false);
      },
      onError: (socketError) => {
        console.error("STOMP connection error:", socketError);
        setSocketReady(false);
        addLog("서버 연결이 불안정합니다. 잠시 후 다시 시도해주세요.", "danger");
      },
    });
    stompClientRef.current = client;

    fetchRoomByRoomCode(roomCode)
      .then(async (data) => {
        if (!data) throw new Error("방 정보를 찾을 수 없습니다.");
        let finalRoom: Room;
        if (data.hostId && !data.guestId && data.hostId !== userId) {
          const joined = await joinRoomAsGuest(data.roomCode, userId);
          finalRoom =
            joined.action === "ROOM_UPDATED" ? joined.payload : joined;
        } else {
          finalRoom = data as Room;
        }
        setRoom(finalRoom);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError("방 정보를 불러오지 못했습니다.");
        setLoading(false);
      });

    return () => {
      setSocketReady(false);
      disconnectSocket();
      stompClientRef.current = null;
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [
    addLog,
    roomCode,
    router,
    showNotice,
    sortCards,
    syncGameState,
    userId,
  ]);

  useEffect(() => {
    if (!roomCode || !userId) return;

    const restoreConnection = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;

      void syncGameState().catch((syncError) => {
        console.warn("Failed to restore game state:", syncError);
      });

      const socket = stompClientRef.current;
      if (socket?.active) {
        socket.forceDisconnect();
      }
    };

    document.addEventListener("visibilitychange", restoreConnection);
    window.addEventListener("pageshow", restoreConnection);
    window.addEventListener("online", restoreConnection);

    return () => {
      document.removeEventListener("visibilitychange", restoreConnection);
      window.removeEventListener("pageshow", restoreConnection);
      window.removeEventListener("online", restoreConnection);
    };
  }, [roomCode, syncGameState, userId]);

  useEffect(() => {
    if (!roomCode || !userId || !room) return;

    const isRoomMember = userId === room.hostId || userId === room.guestId;
    if (!isRoomMember) return;

    const heartbeat = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      void sendRoomHeartbeat(roomCode, userId).catch((heartbeatError) => {
        console.warn("Failed to send room heartbeat:", heartbeatError);
      });
    };

    heartbeat();
    const intervalId = window.setInterval(heartbeat, 2 * 60 * 60 * 1000);
    document.addEventListener("visibilitychange", heartbeat);
    window.addEventListener("pageshow", heartbeat);
    window.addEventListener("online", heartbeat);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", heartbeat);
      window.removeEventListener("pageshow", heartbeat);
      window.removeEventListener("online", heartbeat);
    };
  }, [room, roomCode, userId]);

  useEffect(() => {
    if (deckEmpty && isMyTurn && !hasDrawn && room?.status === "PLAYING") {
      setHasDrawn(true);
    }
  }, [deckEmpty, hasDrawn, isMyTurn, room?.status]);

  const handleDrawCard = (color: "WHITE" | "BLACK") => {
    if (!room || !userId || !stompClientRef.current) return;
    const sent = sendSocketMessage(stompClientRef.current,
      "/app/rooms/draw",
      { roomCode: room.roomCode, userId, color }
    );
    if (!sent) {
      setDrawFailMessage("서버 연결이 아직 준비되지 않았습니다.");
    }
  };

  const openGuessModal = (card: GameCard) => {
    if (!canGuess || card.status === "OPEN") return;
    setGuessModalCard(card);
    setSelectedGuessNumber(null);
  };

  const handleGuessSubmit = () => {
    const client = stompClientRef.current;
    if (
      selectedGuessNumber === null ||
      !guessModalCard ||
      !client ||
      !client.connected ||
      !room ||
      !userId
    ) {
      return;
    }

    const sent = sendGuessMessage(client, {
      roomCode: room.roomCode,
      userId,
      targetCardId: guessModalCard.id,
      guessedNumber: selectedGuessNumber,
    });
    if (!sent) {
      addLog("서버 연결 후 다시 시도해주세요.", "danger");
    }
  };

  const handlePassTurn = () => {
    if (!canPass || !room || !userId || !stompClientRef.current) return;
    const sent = sendSocketMessage(stompClientRef.current,
      "/app/rooms/turn/pass",
      { roomCode: room.roomCode, userId }
    );
    if (!sent) {
      addLog("서버 연결 후 다시 시도해주세요.", "danger");
      return;
    }
    setHasDrawn(false);
    setHasGuessedOnce(false);
    addLog(`${myNickname}님이 턴을 넘겼습니다.`, "normal");
  };

  const handleStartGame = () => {
    if (!room || !stompClientRef.current) return;
    if (!room.guestId) {
      showNotice("아직 시작할 수 없습니다", "상대방이 입장해야 게임을 시작할 수 있습니다.");
      return;
    }
    const sent = sendStartMessage(stompClientRef.current, room.roomCode);
    if (!sent) {
      showNotice(
        "서버 연결 대기 중",
        "서버 연결이 아직 준비되지 않았습니다. 잠시 후 다시 눌러주세요."
      );
    }
  };

  const handleLeaveRoom = async () => {
    if (!room || !userId || isLeavingRoom) return;
    if (room.status === "PLAYING") {
      setDialog({
        title: "게임을 나갈까요?",
        message: "게임 도중에 나가면 현재 게임이 종료됩니다.",
        confirmText: "나가기",
        cancelText: "취소",
        tone: "danger",
        onConfirm: () => {
          void leaveCurrentRoom();
        },
      });
      return;
    }
    await leaveCurrentRoom();
  };

  const leaveCurrentRoom = async () => {
    if (!room || !userId || isLeavingRoomRef.current) return;
    isLeavingRoomRef.current = true;
    setIsLeavingRoom(true);
    try {
      await leaveRoom(room.roomCode, userId);
    } catch (leaveError) {
      console.error("Failed to leave room:", leaveError);
      showNotice("로비로 이동합니다", "방 상태 정리에 실패했지만 로비로 이동합니다.");
    } finally {
      disconnectSocket();
      stompClientRef.current = null;
      setSocketReady(false);
      router.replace("/lobby");
    }
  };

  const wasMyCardGuessed = (card: GameCard) =>
    card.userId === userId &&
    (card.status === "OPEN" || flippedCards.includes(card.id));

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f4f1] flex items-center justify-center font-Arita text-xl font-bold">
        로딩 중...
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f4f4f1] flex items-center justify-center text-red-600 font-bold">
        {error}
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-[#f4f4f1] flex items-center justify-center font-bold">
        방을 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <>
      <GlobalClientHandler />
      {!socketReady && !isLeavingRoom && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-5 font-Arita backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
          aria-label="서버 연결 중"
        >
          <div className="w-full max-w-sm border-[3px] border-black bg-white px-7 py-8 text-center shadow-[10px_10px_0_#11936e]">
            <div className="mx-auto h-12 w-12 animate-spin border-[5px] border-[#d8d8d8] border-t-[#11936e]" />
            <p className="mt-6 text-2xl font-black">
              {hasConnectedOnce
                ? "연결을 복구하고 있습니다..."
                : "서버에 연결 중입니다..."}
            </p>
            <p className="mt-3 text-sm font-bold leading-6 text-[#666]">
              연결이 완료되면 게임이 자동으로 이어집니다.
              <br />
              잠시만 기다려주세요.
            </p>
          </div>
        </div>
      )}
      <main className="min-h-screen overflow-x-hidden bg-[#f4f4f1] px-4 py-3 font-Arita text-[#101014]">
        <section className="mx-auto flex min-h-[calc(100vh-24px)] w-full max-w-[1500px] flex-col border-[3px] border-black bg-white shadow-[10px_10px_0_#000]">
          <header className="flex flex-col gap-4 border-b-[3px] border-black px-6 py-5 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-sm font-black uppercase text-[#11936e]">
                Game Room
              </p>
              <h1 className="text-4xl font-black leading-none sm:text-5xl">
                {room.title}
              </h1>
              <p className="mt-4 text-base font-black text-[#5b5b63]">
                방 코드 {room.roomCode}
              </p>
            </div>

            <div className="flex items-end gap-6">
              <div className="text-right">
                <p className="text-xs font-black text-[#6b6b72]">현재 턴</p>
                <p
                  className={`text-2xl font-black ${
                    isMyTurn ? "text-[#11936e]" : "text-[#f0263e]"
                  }`}
                >
                  {currentTurn
                    ? isMyTurn
                      ? "당신의 차례"
                      : `${getNicknameById(currentTurn)}의 차례`
                    : room.status === "WAITING"
                      ? "대기 중"
                      : "준비 중"}
                </p>
              </div>
              <button
                onClick={handleLeaveRoom}
                disabled={isLeavingRoom}
                className="border-[3px] border-black bg-white px-5 py-3 text-sm font-black shadow-[5px_5px_0_#000] transition hover:-translate-y-0.5 hover:shadow-[7px_7px_0_#000] disabled:cursor-not-allowed disabled:bg-[#d7d7d7] disabled:shadow-none"
              >
                {isLeavingRoom ? "나가는 중" : "나가기"}
              </button>
            </div>
          </header>

          {winner && room.status === "ENDED" && (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/75">
              <GameEndOverlay isGameEnded={isGameEnded} />
              <div className="relative z-10 flex flex-col items-center border-[4px] border-black bg-white px-12 py-10 text-center shadow-[12px_12px_0_#11936e]">
                <span className="text-5xl font-black">게임 종료</span>
                <span className="mt-4 text-3xl font-black text-[#11936e]">
                  승자: {winner}
                </span>
                <span className="mt-6 text-lg font-bold text-[#5b5b63]">
                  다음 게임까지 {countdown}초
                </span>
                <button
                  className="mt-8 border-[3px] border-black bg-black px-8 py-3 text-lg font-black text-white shadow-[6px_6px_0_#11936e]"
                  onClick={handleLeaveRoom}
                >
                  로비로 돌아가기
                </button>
              </div>
            </div>
          )}

          <div className="grid min-w-0 flex-1 lg:grid-cols-[minmax(0,1fr)_390px]">
            <section className="flex min-w-0 flex-col gap-6 px-6 py-5 sm:px-8">
              <div className="grid gap-4 border-b-[3px] border-black pb-5 sm:grid-cols-2">
                <PlayerBadge
                  label="상대"
                  nickname={opponentNickname}
                  color="red"
                  isActive={currentTurn !== userId && room.status === "PLAYING"}
                />
                <PlayerBadge
                  label="나"
                  nickname={myNickname}
                  color="green"
                  isActive={isMyTurn}
                />
              </div>

              {room.status === "WAITING" ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-5 py-20 text-center">
                  <p className="text-3xl font-black">상대 입장을 기다리는 중</p>
                  <p className="max-w-md text-base font-bold text-[#666]">
                    두 명이 모두 입장하면 방장이 게임을 시작할 수 있습니다.
                  </p>
                  <div className="flex gap-3">
                    {room.hostId === userId && (
                      <button
                        onClick={handleStartGame}
                        disabled={!socketReady}
                        className="border-[3px] border-black bg-black px-6 py-3 font-black text-white shadow-[6px_6px_0_#11936e] disabled:cursor-not-allowed disabled:bg-[#b7b7b7] disabled:shadow-none"
                      >
                        {socketReady ? "게임 시작" : "연결 중"}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex min-w-0 flex-col gap-6">
                  <CardRow
                    title={`${opponentNickname}의 타일`}
                    countLabel={`TILE x ${opponentCards.length}`}
                    cards={opponentCards}
                    flippedCards={flippedCards}
                    canGuess={canGuess}
                    onCardClick={openGuessModal}
                    isOpponent
                  />

                  <div className="h-[3px] w-full bg-black" />

                  <CardRow
                    title={`${myNickname}의 타일`}
                    countLabel={`보유: ${myCards.length}`}
                    cards={myCards}
                    flippedCards={flippedCards}
                    canGuess={false}
                    onCardClick={() => undefined}
                    isMyCardGuessed={wasMyCardGuessed}
                  />
                </div>
              )}

              {guessResult && room.status !== "ENDED" && (
                <div
                  className={`border-[3px] border-black px-5 py-4 text-lg font-black shadow-[6px_6px_0_#000] ${
                    guessResult.correct
                      ? "bg-[#11936e] text-white"
                      : "bg-[#f0263e] text-white"
                  }`}
                >
                  {guessResult.correct
                    ? `정답! ${guessResult.openedCardOwnerNickname}님의 타일은 ${guessResult.guessedNumber}였습니다.`
                    : "오답! 내 타일 하나가 공개되고 턴이 상대에게 넘어갑니다."}
                </div>
              )}
            </section>

            <aside className="grid border-t-[3px] border-black lg:border-l-[3px] lg:border-t-0 lg:grid-rows-[auto_1fr]">
              <section className="border-b-[3px] border-black px-6 py-5">
                <p className="mb-5 text-xs font-black uppercase tracking-[0.24em] text-[#777]">
                  행동
                </p>
                <button
                  disabled={!socketReady || !isMyTurn || hasDrawn || deckEmpty || room.status !== "PLAYING"}
                  onClick={() => setDrawModalOpen(true)}
                  className="w-full border-[3px] border-black bg-[#1c1c1f] px-5 py-5 text-2xl font-black text-white shadow-[7px_7px_0_#000] transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-[#b7b7b7] disabled:text-white disabled:shadow-none"
                >
                  타일 뽑기
                  <span className="mt-2 block text-xs font-black tracking-[0.18em] text-[#20d498]">
                    REMAINING: {remainingTiles}
                  </span>
                </button>

                {drawFailMessage && (
                  <p className="mt-4 text-sm font-black text-[#f0263e]">
                    {drawFailMessage}
                  </p>
                )}

                <button
                  disabled={!socketReady || !canPass || room.status !== "PLAYING"}
                  onClick={handlePassTurn}
                  className="mt-5 w-full border-[3px] border-black bg-white px-5 py-4 text-lg font-black shadow-[5px_5px_0_#000] transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:border-[#b7b7b7] disabled:text-[#aaa] disabled:shadow-none"
                >
                  턴 넘기기
                </button>
              </section>

              <section className="px-6 py-5">
                <p className="mb-5 text-xs font-black uppercase tracking-[0.24em] text-[#999]">
                  Game Logs
                </p>
                <div className="flex max-h-[360px] flex-col gap-3 overflow-y-auto pr-1">
                  {logs.length > 0 ? (
                    logs.map((log, index) => (
                      <div
                        key={log.id}
                        className={`border-l-[3px] py-1 pl-4 text-sm font-black ${
                          index === 0
                            ? "border-black bg-[#1c1c1f] px-4 py-3 text-white"
                            : log.tone === "success"
                              ? "border-[#11936e] text-[#11936e]"
                              : log.tone === "danger"
                                ? "border-[#f0263e] text-[#101014]"
                                : "border-[#d5d5d5] text-[#101014]"
                        }`}
                      >
                        {index === 0 && (
                          <span className="mb-1 block text-xs text-[#20d498]">
                            최근 활동
                          </span>
                        )}
                        {log.message}
                      </div>
                    ))
                  ) : (
                    <p className="border-l-[3px] border-[#d5d5d5] py-2 pl-4 text-sm font-black text-[#777]">
                      게임 로그가 여기에 표시됩니다.
                    </p>
                  )}
                </div>
              </section>
            </aside>
          </div>
        </section>

        {drawModalOpen && (
          <Modal title="어떤 색의 타일을 뽑을까요?" onClose={() => setDrawModalOpen(false)}>
            <div className="grid grid-cols-2 gap-4">
              <button
                className="h-24 border-[3px] border-black bg-white text-xl font-black text-black shadow-[5px_5px_0_#000]"
                onClick={() => handleDrawCard("WHITE")}
              >
                흰 타일
              </button>
              <button
                className="h-24 border-[3px] border-black bg-black text-xl font-black text-white shadow-[5px_5px_0_#11936e]"
                onClick={() => handleDrawCard("BLACK")}
              >
                검은 타일
              </button>
            </div>
          </Modal>
        )}

        {guessModalCard && (
          <Modal
            title={`${opponentNickname}의 타일 추측`}
            onClose={() => {
              setGuessModalCard(null);
              setSelectedGuessNumber(null);
            }}
          >
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between border-[3px] border-black px-4 py-3">
                <span className="font-black">
                  선택한 타일
                </span>
                <span
                  className={`border-[3px] border-black px-4 py-2 text-xl font-black ${
                    guessModalCard.color === "BLACK"
                      ? "bg-black text-white"
                      : "bg-white text-black"
                  }`}
                >
                  ?
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {GUESS_NUMBERS.map((number) => (
                  <button
                    key={number}
                    onClick={() => setSelectedGuessNumber(number)}
                    className={`h-12 border-[3px] border-black text-lg font-black transition ${
                      selectedGuessNumber === number
                        ? "bg-[#11936e] text-white shadow-[4px_4px_0_#000]"
                        : "bg-white text-black"
                    }`}
                  >
                    {number}
                  </button>
                ))}
              </div>

              <button
                disabled={selectedGuessNumber === null}
                onClick={handleGuessSubmit}
                className="border-[3px] border-black bg-black px-5 py-4 text-lg font-black text-white shadow-[5px_5px_0_#11936e] disabled:cursor-not-allowed disabled:bg-[#b7b7b7] disabled:shadow-none"
              >
                결정
              </button>
            </div>
          </Modal>
        )}

        {dialog && (
          <GameDialog
            {...dialog}
            onClose={() => setDialog(null)}
            onConfirm={() => {
              const confirmAction = dialog.onConfirm;
              setDialog(null);
              confirmAction?.();
            }}
          />
        )}
      </main>
    </>
  );
}

function PlayerBadge({
  label,
  nickname,
  color,
  isActive,
}: {
  label: string;
  nickname: string;
  color: "red" | "green";
  isActive: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`h-5 w-5 border-[3px] border-black ${
          color === "green" ? "bg-[#20c997]" : "bg-[#f0263e]"
        }`}
      />
      <div>
        <p className="text-xs font-black text-[#777]">{label}</p>
        <p className={`text-2xl font-black ${isActive ? "text-[#11936e]" : ""}`}>
          {nickname}
        </p>
      </div>
    </div>
  );
}

function CardRow({
  title,
  countLabel,
  cards,
  flippedCards,
  canGuess,
  onCardClick,
  isOpponent = false,
  isMyCardGuessed,
}: {
  title: string;
  countLabel: string;
  cards: GameCard[];
  flippedCards: number[];
  canGuess: boolean;
  onCardClick: (card: GameCard) => void;
  isOpponent?: boolean;
  isMyCardGuessed?: (card: GameCard) => boolean;
}) {
  return (
    <section className="min-w-0 max-w-full">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-black">{title}</h2>
        <span className="border-[3px] border-black bg-white px-4 py-2 text-sm font-black shadow-[4px_4px_0_#000]">
          {countLabel}
        </span>
      </div>
      <div className="flex min-h-[150px] w-full min-w-0 max-w-full gap-[clamp(12px,1.5vw,20px)] overflow-x-auto overflow-y-hidden overscroll-x-contain px-1 pb-4 pt-7">
        {cards.length > 0 ? (
          cards.map((card) => {
            const isFlipped = flippedCards.includes(card.id) || card.status === "OPEN";
            const guessed = isMyCardGuessed?.(card) ?? false;

            if (isOpponent) {
              return (
                <button
                  type="button"
                  key={card.id}
                  disabled={!canGuess || card.status === "OPEN"}
                  onClick={() => onCardClick(card)}
                  className={`card-wrapper disabled:cursor-default ${
                    isFlipped ? "-translate-y-[20%]" : ""
                  } transition-transform duration-300`}
                  aria-label="상대 타일 추측하기"
                >
                  <div
                    className={`card-inner ${isFlipped ? "is-flipped" : ""} ${
                      canGuess && card.status === "CLOSE"
                        ? "transition-transform hover:-translate-y-1"
                        : ""
                    }`}
                  >
                    <div
                      className={`card-face card-front rounded-none border-[3px] border-black ${
                        card.color === "BLACK"
                          ? "bg-[#1c1c1f] text-white"
                          : "bg-white text-black"
                      }`}
                    >
                      <span className="text-[clamp(2.5rem,4vw,3rem)] leading-none">?</span>
                    </div>
                    <div
                      className={`card-face card-back rounded-none border-[5px] border-[#ff123f] text-[#ff123f] shadow-[0_10px_18px_rgba(255,18,63,0.35)] ${
                        card.color === "BLACK" ? "bg-[#1c1c1f]" : "bg-white"
                      }`}
                    >
                      {card.number}
                    </div>
                  </div>
                </button>
              );
            }

            return (
              <div
                key={card.id}
                className={`card-wrapper ${
                  guessed ? "animate-card-open-rise" : ""
                } transition-transform duration-300`}
              >
                <div
                  className={`card-face rounded-none border-[3px] ${
                    guessed
                      ? `border-[5px] border-[#ff123f] text-[#ff123f] shadow-[0_10px_18px_rgba(255,18,63,0.35)] ${
                          card.color === "BLACK" ? "bg-[#1c1c1f]" : "bg-white"
                        }`
                      : `border-black ${
                          card.color === "BLACK"
                            ? "bg-[#1c1c1f] text-white"
                            : "bg-white text-black"
                        }`
                  }`}
                >
                  {card.number}
                </div>
              </div>
            );
          })
        ) : (
          <p className="flex min-h-[120px] items-center text-lg font-black text-[#777]">
            아직 타일이 없습니다.
          </p>
        )}
      </div>
    </section>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md border-[3px] border-black bg-white p-6 shadow-[10px_10px_0_#000]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <h2 className="text-2xl font-black">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 border-[3px] border-black bg-white text-xl font-black leading-none"
            aria-label="닫기"
          >
            x
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function GameDialog({
  title,
  message,
  confirmText = "확인",
  cancelText,
  tone = "normal",
  onClose,
  onConfirm,
}: DialogState & {
  onClose: () => void;
  onConfirm: () => void;
}) {
  const isDanger = tone === "danger";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-4">
      <div className="w-full max-w-md border-[3px] border-black bg-white p-6 shadow-[10px_10px_0_#000]">
        <div className="mb-5 flex items-center gap-3">
          <span
            className={`h-5 w-5 border-[3px] border-black ${
              isDanger ? "bg-[#ff123f]" : "bg-[#20c997]"
            }`}
          />
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#777]">
            Notice
          </p>
        </div>
        <h2 className="text-3xl font-black leading-tight">{title}</h2>
        <p className="mt-4 text-base font-bold leading-7 text-[#555]">
          {message}
        </p>

        <div className="mt-7 flex justify-end gap-3">
          {cancelText && (
            <button
              type="button"
              onClick={onClose}
              className="border-[3px] border-black bg-white px-5 py-3 text-sm font-black shadow-[4px_4px_0_#000] transition hover:-translate-y-0.5"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`border-[3px] border-black px-5 py-3 text-sm font-black text-white shadow-[4px_4px_0_#000] transition hover:-translate-y-0.5 ${
              isDanger ? "bg-[#ff123f]" : "bg-black"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
