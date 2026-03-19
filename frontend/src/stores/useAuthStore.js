import { create } from 'zustand';

const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,

  login: (user) => {
    set({ user, isAuthenticated: true });
  },

  logout: () => {
    set({ user: null, isAuthenticated: false });
  },

  setUser: (user) => {
    set({ user, isAuthenticated: !!user });
  },

  updateSubscription: (subscription) => {
    set((state) => ({
      user: state.user ? { ...state.user, subscription } : null,
    }));
  },
}));

export default useAuthStore;
