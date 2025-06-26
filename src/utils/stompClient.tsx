import { CompatClient, Stomp } from "@stomp/stompjs";
import SockJS from "sockjs-client";

let client: CompatClient | null = null;

// 1. 소켓 연결 및 구독
export const connectGameSocket = (
  roomCode: string,
  onMessage: (msg: any) => void
): CompatClient => {
  if (client && client.connected) {
    client.disconnect(() => {
      console.log("이전 소켓 연결 해제");
    });
  }

  const socket = new SockJS(`${process.env.NEXT_PUBLIC_WS_URL}`);
  client = Stomp.over(socket);
  client.debug = () => {};

  client.connect({}, () => {
    client!.subscribe(
      `/topic/rooms/${roomCode}`,
      msg => onMessage(JSON.parse(msg.body)),
      { id: `${roomCode}-rooms` }
    );
  });

  return client;
};

// 2. 소켓 연결 해제
export const disconnectSocket = () => {
  if (client && client.connected) {
    client.disconnect(() => {
      console.log("WebSocket disconnected");
    });
  }
};

// 3. 방 참가 메시지
export const sendJoinMessage = (
  client: CompatClient,
  roomCode: string,
  userId: string,
  nickname: string
) => {
  client.send(
    "/app/rooms/join",
    {},
    JSON.stringify({ roomCode, userId, nickname })
  );
};

// 4. 게임 시작 메시지
export const sendStartMessage = (
  client: CompatClient,
  roomCode: string
) => {
  client.send("/app/rooms/start", {}, JSON.stringify({ roomCode }));
};

// 5. 턴 넘기기 메시지 추가
export const sendPassTurnMessage = (
  client: CompatClient,
  payload: {
    roomCode: string;
    userId: string;
  }
): void => {
  if (!client.connected) return;
  client.send("/app/rooms/turn/pass", {}, JSON.stringify(payload));
};

// 6. 카드 추리(액션) 메시지
export const sendGuessMessage = (
  client: CompatClient,
  payload: {
    roomCode: string;
    userId: string;
    targetCardId: number;
    guessedNumber: number;
  }
): void => {
  if (!client.connected) return;
  client.send("/app/rooms/action", {}, JSON.stringify(payload));
};