import dynamic from "next/dynamic";
import { useRef, useEffect } from "react";

const ReactCanvasConfetti = dynamic(() => import("react-canvas-confetti"), { ssr: false });

export default function GameEndOverlay({ isGameEnded }: { isGameEnded: boolean }) {
  const confettiInstance = useRef<any>(null);
  const ReactCanvasConfettiAny = ReactCanvasConfetti as any;
  function getInstance(instance: any) {
    confettiInstance.current = instance;
  }

  useEffect(() => {
    if (isGameEnded && confettiInstance.current) {
      confettiInstance.current({
        particleCount: 200,
        spread: 120,
        origin: { y: 0.6 },
      });
    }
  }, [isGameEnded]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      <ReactCanvasConfettiAny getInstance={getInstance} className="w-full h-full" />
    </div>
  );
}