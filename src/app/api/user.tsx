const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function registerUser(nickname: string) {
    console.log("API_URL: ", process.env.NEXT_PUBLIC_API_URL);
    const res = await fetch(`${API_URL}/users/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname }),
    });
  
    if (!res.ok) throw new Error("닉네임 중복");
    return res.json();
  }
  