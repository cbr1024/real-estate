import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import useMapStore from '../../stores/useMapStore';
import { getApartmentsByBounds } from '../../api/apartments';

const CLUSTER_GRID_SIZE = 100;

function clusterMarkers(apartments, map) {
  if (!map || !apartments?.length) return [];

  const zoom = map.getZoom();
  if (zoom >= 15) {
    return apartments.map((apt) => ({
      apartments: [apt],
      lat: apt.latitude,
      lng: apt.longitude,
      count: 1,
    }));
  }

  const projection = map.getProjection();
  const clusters = [];

  apartments.forEach((apt) => {
    const point = projection.fromCoordToOffset(
      new window.naver.maps.LatLng(apt.latitude, apt.longitude)
    );

    let added = false;
    for (const cluster of clusters) {
      const clusterPoint = projection.fromCoordToOffset(
        new window.naver.maps.LatLng(cluster.lat, cluster.lng)
      );
      const dx = point.x - clusterPoint.x;
      const dy = point.y - clusterPoint.y;
      if (Math.sqrt(dx * dx + dy * dy) < CLUSTER_GRID_SIZE) {
        cluster.apartments.push(apt);
        cluster.count += 1;
        added = true;
        break;
      }
    }

    if (!added) {
      clusters.push({
        apartments: [apt],
        lat: apt.latitude,
        lng: apt.longitude,
        count: 1,
      });
    }
  });

  return clusters;
}

function formatPrice(price) {
  if (!price) return '-';
  if (price >= 10000) {
    const eok = Math.floor(price / 10000);
    const remainder = price % 10000;
    return remainder > 0 ? `${eok}억 ${remainder.toLocaleString()}` : `${eok}억`;
  }
  return `${price.toLocaleString()}만`;
}

export default function NaverMap() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null);
  const navigate = useNavigate();

  const { center, zoom, bounds, filters, setCenter, setZoom, setBounds } = useMapStore();

  const [currentBounds, setCurrentBounds] = useState(null);

  const { data: apartments } = useQuery({
    queryKey: ['apartments', currentBounds, filters],
    queryFn: () => {
      if (!currentBounds) return [];
      return getApartmentsByBounds(currentBounds, {
        tradeType: filters.tradeType,
        minPrice: filters.priceRange[0],
        maxPrice: filters.priceRange[1],
        minArea: filters.areaRange[0],
        maxArea: filters.areaRange[1],
      });
    },
    enabled: !!currentBounds,
  });

  const updateBounds = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const mapBounds = map.getBounds();
    const sw = mapBounds.getSW();
    const ne = mapBounds.getNE();

    const newBounds = {
      sw: { lat: sw.lat(), lng: sw.lng() },
      ne: { lat: ne.lat(), lng: ne.lng() },
    };

    setBounds(newBounds);
    setCurrentBounds(newBounds);
  }, [setBounds]);

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
      if (mapInstanceRef.current) {
        window.naver.maps.Event.clearListeners(mapInstanceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !apartments?.length) {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      return;
    }

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    if (infoWindowRef.current) {
      infoWindowRef.current.close();
    }

    const clusters = clusterMarkers(apartments, map);

    clusters.forEach((cluster) => {
      let markerContent;
      if (cluster.count === 1) {
        const apt = cluster.apartments[0];
        markerContent = `
          <div style="
            padding: 6px 12px;
            background: #2563eb;
            color: white;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            cursor: pointer;
            text-align: center;
            line-height: 1.4;
          ">
            <div style="font-size: 11px;">${apt.name}</div>
            <div>${formatPrice(apt.latestPrice)}</div>
          </div>
        `;
      } else {
        markerContent = `
          <div style="
            width: 48px;
            height: 48px;
            background: #2563eb;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: 700;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            cursor: pointer;
            border: 3px solid white;
          ">
            ${cluster.count}
          </div>
        `;
      }

      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(cluster.lat, cluster.lng),
        map: map,
        icon: {
          content: markerContent,
          anchor: new window.naver.maps.Point(
            cluster.count === 1 ? 40 : 24,
            cluster.count === 1 ? 20 : 24
          ),
        },
      });

      if (cluster.count === 1) {
        const apt = cluster.apartments[0];
        window.naver.maps.Event.addListener(marker, 'click', () => {
          if (infoWindowRef.current) {
            infoWindowRef.current.close();
          }

          const infoWindow = new window.naver.maps.InfoWindow({
            content: `
              <div style="
                padding: 16px;
                min-width: 220px;
                font-family: -apple-system, 'Noto Sans KR', sans-serif;
              ">
                <h3 style="margin: 0 0 8px; font-size: 15px; font-weight: 700; color: #111;">
                  ${apt.name}
                </h3>
                <p style="margin: 0 0 4px; font-size: 13px; color: #666;">
                  ${apt.address || ''}
                </p>
                <p style="margin: 0 0 12px; font-size: 14px; color: #2563eb; font-weight: 600;">
                  ${filters.tradeType} ${formatPrice(apt.latestPrice)}만원
                </p>
                <button
                  onclick="window.__navigateToApartment__('${apt.id}')"
                  style="
                    width: 100%;
                    padding: 8px;
                    background: #2563eb;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                  "
                >
                  상세보기
                </button>
              </div>
            `,
            borderColor: '#e5e7eb',
            borderWidth: 1,
            backgroundColor: 'white',
            anchorSize: new window.naver.maps.Size(12, 12),
          });

          infoWindow.open(map, marker);
          infoWindowRef.current = infoWindow;
        });
      } else {
        window.naver.maps.Event.addListener(marker, 'click', () => {
          map.setCenter(new window.naver.maps.LatLng(cluster.lat, cluster.lng));
          map.setZoom(map.getZoom() + 2);
        });
      }

      markersRef.current.push(marker);
    });
  }, [apartments, filters.tradeType]);

  useEffect(() => {
    window.__navigateToApartment__ = (id) => {
      navigate(`/apartment/${id}`);
    };
    return () => {
      delete window.__navigateToApartment__;
    };
  }, [navigate]);

  return (
    <div className="w-full h-full relative">
      <div ref={mapRef} className="w-full h-full" />
    </div>
  );
}
