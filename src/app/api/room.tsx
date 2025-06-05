const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function fetchWaitingRooms() {
  const res = await fetch(`${API_URL}/rooms/waiting`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error("방 리스트를 불러오는 데 실패했습니다.");
  }
  return res.json();
}

export async function createRoom(title: String) {
  const hostId = localStorage.getItem("sessionId");
  const res = await fetch(`${API_URL}/rooms/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, hostId }),
  });

  if (!res.ok) {
    throw new Error("방 생성 실패");
  }

  return await res.json();
}

// 방 데이터 타입 정의
export interface Room {
  id: string;
  title: string; 
  roomCode: string;
  status: "WAITING" | "PLAYING"; 
  hostId: string;
  hostNickname: string;
  guestId: string | null;
  guestNickname: string | null;
}


export async function fetchRoomByRoomCode(roomCode: string): Promise<Room | null> {
  const response = await fetch(`${API_URL}/rooms/${roomCode}`);
  if (!response.ok) {
    console.error("방 정보를 불러오는 데 실패했습니다.");
    return null;
  }

  const data = await response.json();
  if (!data) {
    console.error("받은 방 정보가 없습니다.");
    return null;
  }

  return data;
}

export async function joinRoomAsGuest(roomCode: string, guestId: string) {
  const res = await fetch(`${API_URL}/rooms/${roomCode}/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ roomCode, guestId }),
  });

  if (!res.ok) {
    throw new Error("게스트로 방에 입장하는데 실패했습니다.");
  }

  return await res.json();
}



// 게임 시작 요청 (호스트만 가능)
export async function startGame(roomCode: string) {
  const res = await fetch(`${API_URL}/rooms/${roomCode}/start`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("게임을 시작할 수 없습니다.");
}

// 방 나가기 요청
export async function leaveRoom(roomCode: string, userId: string) {
  const res = await fetch(`${API_URL}/rooms/${roomCode}/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error("방을 나갈 수 없습니다.");
}

