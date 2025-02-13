const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function registerUser(nickname: string) {
    const res = await fetch(`${API_URL}/user/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname }),
    });
  
    if (!res.ok) throw new Error("닉네임 중복");
    return res.json();
  }
  