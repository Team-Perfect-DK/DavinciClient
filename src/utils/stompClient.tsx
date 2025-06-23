import { CompatClient, IMessage, Stomp } from "@stomp/stompjs";
import SockJS from "sockjs-client";

let stompClient: CompatClient | null = null;

export function connectGameSocket(
  roomCode: string,
  onMessage: (data: {
    action: "CARD_OPENED" | "GAME_ENDED";
    cardId: number;
    nextTurnUserId?: string;
    winnerNickname?: string;
  }) => void
) {
  const socket = new SockJS(`${process.env.NEXT_PUBLIC_WS_URL}`);
  stompClient = Stomp.over(socket); // CompatClient로 반환됨

  stompClient.connect({}, () => {
    stompClient?.subscribe(`/topic/games/${roomCode}`, (message: IMessage) => {
      const data = JSON.parse(message.body);
      onMessage(data);
    });
  });
}

export function sendGuessMessage(payload: {
  roomCode: string;
  userId: string;
  targetCardId: number;
  guessedNumber: number;
  guessedColor: "BLACK" | "WHITE";
}) {
  if (stompClient?.connected) {
    stompClient.send("/app/games/action", {}, JSON.stringify(payload));
  } else {
    console.error("STOMP 연결 안 됨");
  }
}
