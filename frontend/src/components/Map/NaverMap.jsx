import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import useMapStore from '../../stores/useMapStore';
import { getApartmentsByBounds } from '../../api/apartments';
import { getNearbyPlaces } from '../../api/places';
import client from '../../api/client';

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

// 거래 유형별 색상
const TRADE_TYPE_COLORS = {
  '매매': { price: '#2563eb', badge: '#2563eb', badgeBg: '#eff6ff', cluster: '#2563eb', clusterArrow: '#2563eb' },
  '전세': { price: '#059669', badge: '#059669', badgeBg: '#ecfdf5', cluster: '#059669', clusterArrow: '#059669' },
  '월세': { price: '#d97706', badge: '#d97706', badgeBg: '#fffbeb', cluster: '#d97706', clusterArrow: '#d97706' },
};

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

  const overlayMarkersRef = useRef([]);
  const myLocationMarkerRef = useRef(null);
  const [locating, setLocating] = useState(false);
  const { center, zoom, bounds, filters, overlays, selectedApartment, setCenter, setZoom, setBounds, setSelectedApartment } = useMapStore();

  // 공유 queryKey (MapPage와 동일) — filters 객체 전체를 key에 포함하므로 필터 변경 시 자동 재조회
  const { data: apiResponse, isFetching } = useQuery({
    queryKey: ['apartments', bounds, filters],
    queryFn: () => {
      if (!bounds) return { totalCount: 0, items: [] };
      const params = {
        tradeType: filters.tradeType,
        minPrice: filters.priceRange[0],
        maxPrice: filters.priceRange[1],
        minArea: filters.areaRange[0],
        maxArea: filters.areaRange[1],
      };
      if (filters.buildYearRange[0] > 0) params.minBuildYear = filters.buildYearRange[0];
      if (filters.buildYearRange[1] > 0) params.maxBuildYear = filters.buildYearRange[1];
      if (filters.floorRange[0] > 0) params.minFloor = filters.floorRange[0];
      if (filters.floorRange[1] > 0) params.maxFloor = filters.floorRange[1];
      if (filters.minUnits > 0) params.minUnits = filters.minUnits;
      if (filters.minTradeCount > 0) params.minTradeCount = filters.minTradeCount;
      return getApartmentsByBounds(bounds, params);
    },
    enabled: !!bounds,
    staleTime: 10 * 1000,
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
      scaleControl: false,
      zoomControl: true,
      zoomControlOptions: {
        position: window.naver.maps.Position.RIGHT_CENTER,
        style: window.naver.maps.ZoomControlStyle.SMALL,
      },
    });

    // 줌 컨트롤을 아파트 목록 패널(380px) 왼쪽으로 밀기
    setTimeout(() => {
      const ctrl = mapRef.current?.querySelector('.naver-map-zoom-control, [class*="zoom"]');
      if (ctrl) ctrl.style.right = '390px';
    }, 500);

    mapInstanceRef.current = map;

    // 지도 로드 추적
    client.post('/apartments/track-map-load').catch(() => {});

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
    if (!map) return;

    // 로딩 중이면 이전 마커 유지
    if (isFetching) return;

    if (!items.length) {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      return;
    }

    // 기존 마커 제거 후 새 마커 렌더링
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (infoWindowRef.current) {
      infoWindowRef.current.close();
    }

    const clusters = clusterMarkers(items, map);

    const colors = TRADE_TYPE_COLORS[filters.tradeType] || TRADE_TYPE_COLORS['매매'];

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
              border:2px solid ${colors.badge};white-space:nowrap;
              font-family:-apple-system,'Noto Sans KR',sans-serif;
            ">
              <div style="font-size:11px;font-weight:600;color:#111;line-height:1.3;">${shortName}</div>
              <div style="font-size:10px;color:#888;margin-top:1px;">${apt.address ? apt.address.split(' ').slice(-2).join(' ') : ''}</div>
              <div style="margin-top:4px;display:flex;align-items:center;gap:4px;">
                ${area ? `<span style="font-size:9px;color:${colors.badge};background:${colors.badgeBg};padding:1px 5px;border-radius:4px;font-weight:600;">${area}</span>` : ''}
                <span style="font-size:14px;font-weight:800;color:${colors.price};">${price}</span>
              </div>
            </div>
            <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:7px solid ${colors.badge};margin:0 auto;position:relative;top:-1px;"></div>
          </div>
        `;
      } else {
        const tooltipLines = cluster.apartments.map(a => escapeHtml(a.name)).slice(0, 5).join('&#10;');
        const tooltipExtra = cluster.count > 5 ? `&#10;...외 ${cluster.count - 5}건` : '';
        markerContent = `
          <div title="${tooltipLines}${tooltipExtra}" style="cursor:pointer;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.15));">
            <div style="
              background:${colors.cluster};border-radius:20px;padding:6px 14px;
              white-space:nowrap;text-align:center;
              font-family:-apple-system,'Noto Sans KR',sans-serif;
            ">
              <div style="font-size:14px;font-weight:800;color:white;">${cluster.count}</div>
            </div>
            <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${colors.clusterArrow};margin:0 auto;"></div>
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
  }, [items, filters, isFetching]);

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

  // 학교/지하철 오버레이 마커 — 지도 영역 전체 커버
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // 기존 오버레이 마커 제거
    overlayMarkersRef.current.forEach((m) => m.setMap(null));
    overlayMarkersRef.current = [];

    const activeTypes = Object.entries(overlays).filter(([, v]) => v).map(([k]) => k);
    if (activeTypes.length === 0) return;

    const mapBounds = map.getBounds();
    const sw = mapBounds.getSW();
    const ne = mapBounds.getNE();
    const cLat = (sw.lat() + ne.lat()) / 2;
    const cLng = (sw.lng() + ne.lng()) / 2;

    // 지도 영역을 9등분하여 검색 (중앙 + 8방향)
    const searchPoints = [
      { lat: cLat, lng: cLng },                                    // 중앙
      { lat: sw.lat() + (ne.lat() - sw.lat()) * 0.25, lng: cLng }, // 하단
      { lat: sw.lat() + (ne.lat() - sw.lat()) * 0.75, lng: cLng }, // 상단
      { lat: cLat, lng: sw.lng() + (ne.lng() - sw.lng()) * 0.25 }, // 좌측
      { lat: cLat, lng: sw.lng() + (ne.lng() - sw.lng()) * 0.75 }, // 우측
    ];

    const seenNames = new Set();

    activeTypes.forEach((type) => {
      const icon = type === 'school' ? '🏫' : '🚇';
      const bgColor = type === 'school' ? '#dcfce7' : '#dbeafe';
      const borderColor = type === 'school' ? '#86efac' : '#93c5fd';

      searchPoints.forEach((point) => {
        getNearbyPlaces(point.lat, point.lng, type)
          .then((data) => {
            if (!data.places) return;
            data.places.forEach((place) => {
              if (!place.lat || !place.lng) return;
              // 중복 방지
              if (seenNames.has(place.name)) return;
              seenNames.add(place.name);
              // 지도 영역 내인지 확인
              if (place.lat < sw.lat() || place.lat > ne.lat() || place.lng < sw.lng() || place.lng > ne.lng()) return;

              const marker = new window.naver.maps.Marker({
                position: new window.naver.maps.LatLng(place.lat, place.lng),
                map,
                icon: {
                  content: `
                    <div style="cursor:default;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.1));">
                      <div style="background:${bgColor};border:1px solid ${borderColor};border-radius:8px;padding:4px 8px;white-space:nowrap;font-family:-apple-system,'Noto Sans KR',sans-serif;display:flex;align-items:center;gap:4px;">
                        <span style="font-size:14px;">${icon}</span>
                        <span style="font-size:11px;font-weight:600;color:#374151;">${place.name}</span>
                      </div>
                    </div>
                  `,
                  anchor: new window.naver.maps.Point(40, 15),
                },
                zIndex: -1,
              });
              overlayMarkersRef.current.push(marker);
            });
          })
          .catch(() => {});
      });
    });
  }, [overlays, center]);

  const goToMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        // localStorage에 저장 (다음 접속 시 자동 적용)
        localStorage.setItem('userLocation', JSON.stringify({ lat, lng }));

        // 로그인 사용자면 DB에도 저장
        client.put('/users/location', { lat, lng }).catch(() => {});

        const map = mapInstanceRef.current;
        if (map) {
          map.setCenter(new window.naver.maps.LatLng(lat, lng));
          map.setZoom(15);

          // 내 위치 마커
          if (myLocationMarkerRef.current) {
            myLocationMarkerRef.current.setMap(null);
          }
          myLocationMarkerRef.current = new window.naver.maps.Marker({
            position: new window.naver.maps.LatLng(lat, lng),
            map,
            icon: {
              content: `
                <div style="position:relative;width:40px;height:40px;">
                  <div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.15);animation:loc-pulse 2s ease-out infinite;"></div>
                  <div style="position:absolute;top:12px;left:12px;width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>
                </div>
                <style>@keyframes loc-pulse{0%{transform:scale(0.5);opacity:1}100%{transform:scale(2);opacity:0}}</style>
              `,
              anchor: new window.naver.maps.Point(20, 20),
            },
            zIndex: 100,
          });
        }
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  return (
    <div className="w-full h-full relative">
      <div ref={mapRef} className="w-full h-full" />
      {/* 내 위치 버튼 */}
      <button
        onClick={goToMyLocation}
        disabled={locating}
        className="absolute bottom-6 left-4 z-10 bg-white/50 backdrop-blur-md hover:bg-white/70 w-11 h-11 rounded-full shadow-lg border border-white/40 flex items-center justify-center transition-all active:scale-95"
        title="내 위치로 이동"
      >
        {locating ? (
          <div className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
        ) : (
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
          </svg>
        )}
      </button>
    </div>
  );
}
