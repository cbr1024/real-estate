import { create } from 'zustand';

const MAX_COMPARE = 3;

const useCompareStore = create((set, get) => ({
  apartments: [],

  addApartment: (apt) => {
    const { apartments } = get();
    if (apartments.length >= MAX_COMPARE) return false;
    if (apartments.some((a) => a.id === apt.id)) return false;
    set({ apartments: [...apartments, apt] });
    return true;
  },

  removeApartment: (id) => {
    set((state) => ({
      apartments: state.apartments.filter((a) => a.id !== id),
    }));
  },

  clearAll: () => set({ apartments: [] }),
}));

export default useCompareStore;
