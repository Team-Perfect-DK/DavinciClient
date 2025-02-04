"use client"

import { useState, useEffect } from 'react';

const Home = () => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<{ text: string, isMine: boolean }[]>([]);
  const [username, setUsername] = useState<string>('User ' + Math.floor(Math.random() * 1000));

  useEffect(() => {
    const ws = new WebSocket('wss://davinci-code.net/ws');  // 서버의 WebSocket URL

    ws.onopen = () => {
      console.log("WebSocket 연결 성공");
      setSocket(ws);
    };

    ws.onmessage = (event: MessageEvent) => {
      const receivedMessage = event.data;
      // 수신된 메시지에 상대방이 보낸 것인지 구별
      if (!receivedMessage.includes(`(${username})`)) {
        setMessages(prevMessages => [
          ...prevMessages, 
          { text: receivedMessage, isMine: false }
        ]);  // 상대방 메시지
      }
    };

    ws.onerror = (error: Event) => {
      console.error("WebSocket 에러: ", error);
    };

    ws.onclose = () => {
      console.log("WebSocket 연결 종료");
    };

    return () => {
      ws.close();
    };
  }, [username]);

  const sendMessage = () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      // 클라이언트가 보낸 메시지에 `isMine` 속성 추가
      const messageWithSender = `${message} (${username})`;  // 메시지에 username을 포함시킴
      setMessages(prevMessages => [...prevMessages, { text: message, isMine: true }]);  // 내 메시지
      socket.send(messageWithSender);  // 서버로 메시지 전송
      setMessage('');  // 메시지 입력란 초기화
    }
  };

  return (
    <div>
      <h1>실시간 채팅</h1>

      {/* 메시지 입력 */}
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="메시지를 입력하세요..."
      />
      <button onClick={sendMessage}>전송</button>

      {/* 메시지 표시 */}
      <div style={{ marginBottom: '20px' }}>
        {messages.map((msg, index) => (
          <div 
            key={index} 
            style={{
              textAlign: msg.isMine ? 'right' : 'left', // 내 메시지는 오른쪽, 상대는 왼쪽
              margin: '10px',
              padding: '10px',
              backgroundColor: msg.isMine ? '#d1f7c4' : '#f0f0f0',  // 내 메시지와 상대방 메시지 색상 구분
              borderRadius: '10px',
              maxWidth: '60%',
              marginLeft: msg.isMine ? 'auto' : '0', // 내 메시지는 오른쪽 끝 정렬
              marginRight: msg.isMine ? '0' : 'auto', // 상대방 메시지는 왼쪽 끝 정렬
            }}>
            {msg.text}
          </div>
        ))}
      </div>


    </div>
  );
};

export default Home;
