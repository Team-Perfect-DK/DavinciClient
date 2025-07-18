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
    


    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "F5" ||
        (e.ctrlKey && e.key === "r") ||
        (e.metaKey && e.key === "r")
      ) {
        e.preventDefault();
        const confirmed = window.confirm(confirmMessage);
        if (confirmed) {
          leaveRoom(roomCode, userId).catch(() => { });
          disconnectSocket();
          router.push('/lobby');
        }
      }
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = confirmMessage;
      handleUnload();
      return confirmMessage;
    };
    const handleUnload = () => {
      leaveRoom(roomCode, userId).catch(() => { });
      disconnectSocket();
      router.push('/lobby')
    };

    const handlePopState = (event: PopStateEvent) => {
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

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [pathname]);

  return null;
};

export default GlobalClientHandler;
