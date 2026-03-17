import { useEffect, useRef } from 'react';

function formatPrice(price) {
  if (!price) return '-';
  if (price >= 10000) {
    const eok = Math.floor(price / 10000);
    const remainder = price % 10000;
    return remainder > 0 ? `${eok}억 ${remainder.toLocaleString()}` : `${eok}억`;
  }
  return `${price.toLocaleString()}만`;
}

export default function ApartmentMarker({ map, apartment, onClick }) {
  const markerRef = useRef(null);
  const infoWindowRef = useRef(null);

  useEffect(() => {
    if (!map || !apartment || !window.naver?.maps) return;

    const markerContent = `
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
        <div style="font-size: 11px;">${apartment.name}</div>
        <div>${formatPrice(apartment.latestPrice)}</div>
      </div>
    `;

    const marker = new window.naver.maps.Marker({
      position: new window.naver.maps.LatLng(apartment.latitude, apartment.longitude),
      map: map,
      icon: {
        content: markerContent,
        anchor: new window.naver.maps.Point(40, 20),
      },
    });

    const infoWindow = new window.naver.maps.InfoWindow({
      content: `
        <div style="padding: 16px; min-width: 220px; font-family: -apple-system, 'Noto Sans KR', sans-serif;">
          <h3 style="margin: 0 0 8px; font-size: 15px; font-weight: 700;">${apartment.name}</h3>
          <p style="margin: 0 0 4px; font-size: 13px; color: #666;">${apartment.address || ''}</p>
          <p style="margin: 0 0 8px; font-size: 14px; color: #2563eb; font-weight: 600;">
            ${formatPrice(apartment.latestPrice)}만원
          </p>
          ${apartment.buildYear ? `<p style="margin: 0; font-size: 12px; color: #999;">건축년도: ${apartment.buildYear}</p>` : ''}
        </div>
      `,
      borderColor: '#e5e7eb',
      borderWidth: 1,
      backgroundColor: 'white',
    });

    window.naver.maps.Event.addListener(marker, 'click', () => {
      if (infoWindowRef.current?.getMap()) {
        infoWindowRef.current.close();
      } else {
        infoWindow.open(map, marker);
        infoWindowRef.current = infoWindow;
      }
      if (onClick) onClick(apartment);
    });

    markerRef.current = marker;

    return () => {
      if (markerRef.current) {
        markerRef.current.setMap(null);
      }
      if (infoWindowRef.current) {
        infoWindowRef.current.close();
      }
    };
  }, [map, apartment, onClick]);

  return null;
}
