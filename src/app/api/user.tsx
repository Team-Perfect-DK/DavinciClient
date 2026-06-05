const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function registerUser(nickname: string) {
    const res = await fetch(`${API_URL}/users/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname }),
    });
  
    if (!res.ok) throw new Error("닉네임 중복");
    return res.json();
  }

export async function validateSession(sessionId: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/users/session/${sessionId}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) throw new Error("세션 확인에 실패했습니다.");
  const data = await res.json();
  return data.valid === true;
}
