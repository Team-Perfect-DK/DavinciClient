import { CompatClient, Stomp } from "@stomp/stompjs";
import SockJS from "sockjs-client";

let client: CompatClient | null = null;

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
    client!.subscribe(
      `/topic/games/${roomCode}`,
      msg => onMessage(JSON.parse(msg.body)),
      { id: `${roomCode}-games` }
    );
  });

  return client;
};


export const disconnectSocket = () => {
  if (client && client.connected) {
    client.disconnect(() => {
      console.log("WebSocket disconnected");
    });
  }
};

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

export const sendStartMessage = (
  client: CompatClient,
  roomCode: string
) => {
  client.send("/app/rooms/start", {}, JSON.stringify({ roomCode }));
};

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
  client.send("/app/games/action", {}, JSON.stringify(payload));
};



