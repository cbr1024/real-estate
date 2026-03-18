import { create } from 'zustand';

const useMapStore = create((set) => ({
  center: { lat: 37.5665, lng: 126.978 },
  zoom: 14,
  bounds: null,
  filters: {
    priceRange: [0, 500000],
    areaRange: [0, 200],
    tradeType: '매매',
    period: '1year',
  },

  setCenter: (center) => set({ center }),

  setZoom: (zoom) => set({ zoom }),

  setBounds: (bounds) => set({ bounds }),

  selectedApartment: null,

  setSelectedApartment: (apt) => set({ selectedApartment: apt }),

  setFilters: (filters) =>
    set((state) => ({
      filters: { ...state.filters, ...filters },
    })),
}));

export default useMapStore;
