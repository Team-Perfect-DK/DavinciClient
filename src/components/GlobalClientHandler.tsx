'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { leaveRoom } from '@/app/api/room';
import { disconnectSocket } from '@/utils/stompClient';

const GlobalClientHandler = () => {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const roomCodeMatch = pathname.match(/^\/room\/(.+)/);
    const isInRoom = Boolean(roomCodeMatch);
    const roomCode = roomCodeMatch?.[1];
    const userId = typeof window !== 'undefined' ? localStorage.getItem('sessionId') : null;

    if (!isInRoom || !roomCode || !userId) return;

    const confirmMessage = '게임을 나가시겠습니까?';
    const handlePopState = () => {
      const confirmed = window.confirm(confirmMessage);
      if (confirmed) {
        leaveRoom(roomCode, userId).catch(() => { });
        disconnectSocket();
        router.push('/lobby');
        return;
      } else {
        history.pushState(null, '', pathname);
      }
    };

    history.pushState(null, '', pathname);

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [pathname, router]);

  return null;
};

export default GlobalClientHandler;
