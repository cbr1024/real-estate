import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import useMapStore from '../../stores/useMapStore';
import { getApartmentsByBounds } from '../../api/apartments';

const CLUSTER_GRID_SIZE = 80;

// 모든 줌 레벨에서 프론트엔드 클러스터링 (모드 전환 없음)
function clusterMarkers(apartments, map) {
  if (!map || !apartments?.length) return [];

  const zoom = map.getZoom();

  // 줌 레벨 17 이상: 개별 마커
  if (zoom >= 17) {
    return apartments.map((apt) => ({
      apartments: [apt],
      lat: parseFloat(apt.latitude),
      lng: parseFloat(apt.longitude),
      count: 1,
    }));
  }

  const projection = map.getProjection();
  const gridSize = zoom >= 15 ? CLUSTER_GRID_SIZE : zoom >= 13 ? 120 : 160;
  const clusters = [];

  apartments.forEach((apt) => {
    const latNum = parseFloat(apt.latitude);
    const lngNum = parseFloat(apt.longitude);
    if (isNaN(latNum) || isNaN(lngNum)) return;

    const point = projection.fromCoordToOffset(
      new window.naver.maps.LatLng(latNum, lngNum)
    );

    let added = false;
    for (const cluster of clusters) {
      const clusterPoint = projection.fromCoordToOffset(
        new window.naver.maps.LatLng(cluster.lat, cluster.lng)
      );
      const dx = point.x - clusterPoint.x;
      const dy = point.y - clusterPoint.y;
      if (Math.sqrt(dx * dx + dy * dy) < gridSize) {
        cluster.apartments.push(apt);
        cluster.count += 1;
        added = true;
        break;
      }
    }

    if (!added) {
      clusters.push({
        apartments: [apt],
        lat: latNum,
        lng: lngNum,
        count: 1,
      });
    }
  });

  return clusters;
}

function formatArea(area) {
  if (!area) return '';
  const py = (Number(area) / 3.306).toFixed(0);
  return `${py}평`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;');
}

function formatPrice(price) {
  if (!price) return '-';
  const num = Number(price);
  if (num >= 10000) {
    const eok = num / 10000;
    const rounded = Math.round(eok * 10) / 10;
    return rounded % 1 === 0 ? `${rounded}억` : `${rounded}억`;
  }
  if (num >= 1000) {
    const cheon = Math.round(num / 1000 * 10) / 10;
    return cheon % 1 === 0 ? `${cheon}천` : `${cheon}천`;
  }
  return `${num}만`;
}

function roundCoord(v) {
  return Math.round(v * 10000) / 10000;
}

export default function NaverMap() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const highlightRef = useRef(null); // 검색 강조 마커
  const infoWindowRef = useRef(null);
  const debounceRef = useRef(null);
  const navigate = useNavigate();

  const { center, zoom, bounds, filters, selectedApartment, setCenter, setZoom, setBounds, setSelectedApartment } = useMapStore();

  // 공유 queryKey (MapPage와 동일)
  const { data: apiResponse, isFetching } = useQuery({
    queryKey: ['apartments', bounds, filters],
    queryFn: () => {
      if (!bounds) return { totalCount: 0, items: [] };
      return getApartmentsByBounds(bounds, {
        tradeType: filters.tradeType,
        minPrice: filters.priceRange[0],
        maxPrice: filters.priceRange[1],
        minArea: filters.areaRange[0],
        maxArea: filters.areaRange[1],
      });
    },
    enabled: !!bounds,
    staleTime: 10 * 1000,
    // 이전 데이터 유지 (마커 깜빡임 방지) — totalCount는 서버에서 계산하므로 안전
    placeholderData: (prev) => prev,
  });

  const items = apiResponse?.items || [];

  const updateBounds = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const mapBounds = map.getBounds();
      const sw = mapBounds.getSW();
      const ne = mapBounds.getNE();

      setBounds({
        sw: { lat: roundCoord(sw.lat()), lng: roundCoord(sw.lng()) },
        ne: { lat: roundCoord(ne.lat()), lng: roundCoord(ne.lng()) },
      });
    }, 300);
  }, [setBounds]);

  // 지도 초기화 (1회)
  useEffect(() => {
    if (!mapRef.current || !window.naver?.maps) return;

    const map = new window.naver.maps.Map(mapRef.current, {
      center: new window.naver.maps.LatLng(center.lat, center.lng),
      zoom: zoom,
      minZoom: 10,
      maxZoom: 20,
      zoomControl: true,
      zoomControlOptions: {
        position: window.naver.maps.Position.TOP_RIGHT,
      },
    });

    mapInstanceRef.current = map;

    window.naver.maps.Event.addListener(map, 'idle', () => {
      const mapCenter = map.getCenter();
      setCenter({ lat: mapCenter.lat(), lng: mapCenter.lng() });
      setZoom(map.getZoom());
      updateBounds();
    });

    updateBounds();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (mapInstanceRef.current) {
        window.naver.maps.Event.clearListeners(mapInstanceRef.current);
      }
    };
  }, []);

  // 마커 렌더링 — 항상 동일한 형식, 모드 전환 없음
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !items.length) {
      // 데이터가 없을 때만 마커 제거 (로딩 중에는 이전 마커 유지)
      if (!isFetching) {
        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = [];
      }
      return;
    }

    // 기존 마커 제거 후 새 마커 렌더링
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (infoWindowRef.current) {
      infoWindowRef.current.close();
    }

    const clusters = clusterMarkers(items, map);

    clusters.forEach((cluster) => {
      let markerContent;
      if (cluster.count === 1) {
        const apt = cluster.apartments[0];
        const price = formatPrice(apt.latestPrice);
        const area = formatArea(apt.latestArea || apt.area);
        const shortName = apt.name.length > 10 ? apt.name.slice(0, 10) + '...' : apt.name;
        markerContent = `
          <div style="cursor:pointer;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.15));">
            <div style="
              background:white;border-radius:8px;padding:6px 10px;
              border:1px solid #e5e7eb;white-space:nowrap;
              font-family:-apple-system,'Noto Sans KR',sans-serif;
            ">
              <div style="font-size:11px;font-weight:600;color:#111;line-height:1.3;">${shortName}</div>
              <div style="font-size:10px;color:#888;margin-top:1px;">${apt.address ? apt.address.split(' ').slice(-2).join(' ') : ''}</div>
              <div style="margin-top:4px;display:flex;align-items:center;gap:4px;">
                ${area ? `<span style="font-size:9px;color:#2563eb;background:#eff6ff;padding:1px 5px;border-radius:4px;font-weight:600;">${area}</span>` : ''}
                <span style="font-size:14px;font-weight:800;color:#7c3aed;">${price}</span>
              </div>
            </div>
            <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:7px solid white;margin:0 auto;position:relative;top:-1px;"></div>
          </div>
        `;
      } else {
        const tooltipLines = cluster.apartments.map(a => escapeHtml(a.name)).slice(0, 5).join('&#10;');
        const tooltipExtra = cluster.count > 5 ? `&#10;...외 ${cluster.count - 5}건` : '';
        markerContent = `
          <div title="${tooltipLines}${tooltipExtra}" style="cursor:pointer;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.15));">
            <div style="
              background:#2563eb;border-radius:20px;padding:6px 14px;
              white-space:nowrap;text-align:center;
              font-family:-apple-system,'Noto Sans KR',sans-serif;
            ">
              <div style="font-size:14px;font-weight:800;color:white;">${cluster.count}</div>
            </div>
            <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid #2563eb;margin:0 auto;"></div>
          </div>
        `;
      }

      const markerEl = document.createElement('div');
      markerEl.innerHTML = markerContent;
      const width = cluster.count === 1 ? 140 : 60;

      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(cluster.lat, cluster.lng),
        map,
        icon: {
          content: markerContent,
          anchor: new window.naver.maps.Point(cluster.count === 1 ? width / 2 : 30, cluster.count === 1 ? 60 : 50),
        },
      });

      if (cluster.count === 1) {
        const apt = cluster.apartments[0];

        // 클릭: 상세 페이지로 이동
        window.naver.maps.Event.addListener(marker, 'click', () => {
          window.__navigateToApartment__(apt.id);
        });
      } else {
        window.naver.maps.Event.addListener(marker, 'click', () => {
          map.setCenter(new window.naver.maps.LatLng(cluster.lat, cluster.lng));
          map.setZoom(map.getZoom() + 2);
        });
      }

      markersRef.current.push(marker);
    });
  }, [items, filters.tradeType]);

  useEffect(() => {
    window.__navigateToApartment__ = (id) => navigate(`/apartment/${id}`);
    return () => { delete window.__navigateToApartment__; };
  }, [navigate]);

  // 검색에서 아파트 선택 시 → 지도 이동 + InfoWindow 표시
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedApartment) return;

    const apt = selectedApartment;
    const lat = parseFloat(apt.latitude);
    const lng = parseFloat(apt.longitude);
    if (isNaN(lat) || isNaN(lng)) return;

    // 지도 이동
    map.setCenter(new window.naver.maps.LatLng(lat, lng));
    map.setZoom(17);

    // 기존 강조 마커 제거
    if (highlightRef.current) {
      highlightRef.current.setMap(null);
      highlightRef.current = null;
    }
    if (infoWindowRef.current) infoWindowRef.current.close();

    // 강조 펄스 마커 + InfoWindow
    const timer = setTimeout(() => {
      // 펄스 애니메이션 마커
      const pulseMarker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(lat, lng),
        map,
        icon: {
          content: `
            <div style="position:relative;width:60px;height:60px;pointer-events:none;">
              <div style="
                position:absolute;top:0;left:0;width:60px;height:60px;
                border-radius:50%;background:rgba(37,99,235,0.15);
                animation:pulse-ring 2s ease-out infinite;
              "></div>
              <div style="
                position:absolute;top:20px;left:20px;width:20px;height:20px;
                border-radius:50%;background:rgba(37,99,235,0.3);
                border:2px solid #2563eb;
              "></div>
            </div>
            <style>
              @keyframes pulse-ring {
                0% { transform:scale(0.5); opacity:1; }
                100% { transform:scale(1.8); opacity:0; }
              }
            </style>
          `,
          anchor: new window.naver.maps.Point(30, 30),
        },
        zIndex: 0,
      });

      highlightRef.current = pulseMarker;

      // 8초 후 펄스 제거
      setTimeout(() => {
        if (highlightRef.current) {
          highlightRef.current.setMap(null);
          highlightRef.current = null;
        }
      }, 8000);

      // InfoWindow
      const infoWindow = new window.naver.maps.InfoWindow({
        content: `
          <div style="padding:16px;min-width:220px;font-family:-apple-system,'Noto Sans KR',sans-serif;">
            <h3 style="margin:0 0 8px;font-size:15px;font-weight:700;color:#111;">${apt.name}</h3>
            <p style="margin:0 0 4px;font-size:13px;color:#666;">${apt.address || ''}</p>
            <p style="margin:0 0 12px;font-size:14px;color:#2563eb;font-weight:600;">${formatPrice(apt.latestPrice)}</p>
            <button onclick="window.__navigateToApartment__('${apt.id}')"
              style="width:100%;padding:8px;background:#2563eb;color:white;
              border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">
              상세보기
            </button>
          </div>
        `,
        borderColor: '#e5e7eb', borderWidth: 1,
        backgroundColor: 'white',
        anchorSize: new window.naver.maps.Size(12, 12),
      });

      infoWindow.open(map, new window.naver.maps.LatLng(lat, lng));
      infoWindowRef.current = infoWindow;
    }, 500);

    setSelectedApartment(null);
    return () => clearTimeout(timer);
  }, [selectedApartment]);

  return (
    <div className="w-full h-full relative">
      <div ref={mapRef} className="w-full h-full" />
    </div>
  );
}
