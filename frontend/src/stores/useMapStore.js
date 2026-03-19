import { create } from 'zustand';

// localStorage에서 저장된 위치 복원
function getSavedLocation() {
  try {
    const saved = localStorage.getItem('userLocation');
    if (saved) {
      const { lat, lng } = JSON.parse(saved);
      if (lat && lng) return { lat, lng };
    }
  } catch (_) {}
  return { lat: 37.5665, lng: 126.978 }; // 기본: 서울
}

const useMapStore = create((set) => ({
  center: getSavedLocation(),
  zoom: 14,
  bounds: null,
  filters: {
    priceRange: [0, 500000],
    areaRange: [0, 200],
    tradeType: '매매',
    period: '1year',
    buildYearRange: [0, 0],   // [0,0] = 전체, e.g. [2015, 0] = 2015년 이후
    floorRange: [0, 0],       // [0,0] = 전체
    minUnits: 0,              // 0 = 전체
    minTradeCount: 0,         // 0 = 전체
  },

  setCenter: (center) => set({ center }),

  setZoom: (zoom) => set({ zoom }),

  setBounds: (bounds) => set({ bounds }),

  overlays: { school: false, subway: false },

  setOverlays: (overlays) =>
    set((state) => ({
      overlays: { ...state.overlays, ...overlays },
    })),

  toggleOverlay: (type) =>
    set((state) => ({
      overlays: { ...state.overlays, [type]: !state.overlays[type] },
    })),

  selectedApartment: null,

  setSelectedApartment: (apt) => set({ selectedApartment: apt }),

  setFilters: (filters) =>
    set((state) => ({
      filters: { ...state.filters, ...filters },
    })),
}));

export default useMapStore;
