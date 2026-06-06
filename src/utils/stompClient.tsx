import { CompatClient, Stomp } from "@stomp/stompjs";
import SockJS from "sockjs-client";

let client: CompatClient | null = null;

interface GameSocketOptions {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: unknown) => void;
}

export const connectGameSocket = (
  roomCode: string,
  onMessage: (msg: any) => void,
  options: GameSocketOptions = {}
): CompatClient => {
  if (client) {
    if (client.connected) {
      client.disconnect(() => {
        options.onDisconnect?.();
      });
    }
    client = null;
  }

  client = Stomp.over(
    () => new SockJS(`${process.env.NEXT_PUBLIC_WS_URL}`)
  );
  client.debug = () => {};
  client.reconnect_delay = 2000;
  client.heartbeat = { incoming: 10000, outgoing: 10000 };

  client.connect(
    {},
    () => {
      client?.subscribe(
        `/topic/rooms/${roomCode}`,
        (msg) => onMessage(JSON.parse(msg.body)),
        { id: `${roomCode}-rooms` }
      );
      options.onConnect?.();
    },
    (error: unknown) => {
      options.onError?.(error);
    },
    () => {
      options.onDisconnect?.();
    }
  );

  return client;
};

export const disconnectSocket = () => {
  if (client && client.connected) {
    client.disconnect(() => {
      console.log("WebSocket disconnected");
    });
  }
  client = null;
};

export const sendSocketMessage = (
  targetClient: CompatClient | null,
  destination: string,
  payload: unknown
): boolean => {
  if (!targetClient || !targetClient.connected) return false;
  targetClient.send(destination, {}, JSON.stringify(payload));
  return true;
};

export const sendJoinMessage = (
  targetClient: CompatClient,
  roomCode: string,
  userId: string,
  nickname: string
): boolean => {
  return sendSocketMessage(targetClient, "/app/rooms/join", {
    roomCode,
    userId,
    nickname,
  });
};

export const sendStartMessage = (
  targetClient: CompatClient,
  roomCode: string,
  userId: string
): boolean => {
  return sendSocketMessage(targetClient, "/app/rooms/start", { roomCode, userId });
};

export const sendPassTurnMessage = (
  targetClient: CompatClient,
  payload: {
    roomCode: string;
    userId: string;
  }
): boolean => {
  return sendSocketMessage(targetClient, "/app/rooms/turn/pass", payload);
};

export const sendGuessMessage = (
  targetClient: CompatClient,
  payload: {
    roomCode: string;
    userId: string;
    targetCardId: number;
    guessedNumber: number;
  }
): boolean => {
  return sendSocketMessage(targetClient, "/app/rooms/action", payload);
};
