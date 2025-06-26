import { useCallback } from "react";
import { CompatClient } from "@stomp/stompjs";

interface SendGuessPayload {
  roomCode: string;
  userId: string;
  targetCardId: number;
  guessedNumber: number;
  guessedColor: "BLACK" | "WHITE";
}

export function useGameLogic(
  gameClient: CompatClient | null,
  roomCode: string,
  userId: string | null
) {
  const guessCard = useCallback(
    (cardId: number, actualColor: "BLACK" | "WHITE") => {
      if (!gameClient || !userId || !roomCode) return;

      const input = prompt("카드 번호를 맞춰보세요 (0~11)");
      const guessedNumber = Number(input);
      if (isNaN(guessedNumber)) return;

      const payload: SendGuessPayload = {
        roomCode,
        userId,
        targetCardId: cardId,
        guessedNumber,
        guessedColor: actualColor,
      };

      console.log("보낼 payload:", payload);
      console.log("STOMP 연결됨?", gameClient.connected);

      gameClient.send("/topic/games/action", {}, JSON.stringify(payload));
    },
    [gameClient, roomCode, userId]
  );

  return {
    guessCard,
  };
}
