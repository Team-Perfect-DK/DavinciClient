import { create } from "zustand";

type UserState = {
  nickname: string;
  sessionId: string;
  setUser: (nickname: string, sessionId: string) => void;
};

export const useUserStore = create<UserState>((set) => ({
  nickname: "",
  sessionId: "",
  setUser: (nickname, sessionId) => set({ nickname, sessionId }),
}));
