'use client';

import { useEffect, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet CSS pone `.leaflet-container { position: relative }` pero sin
// z-index propio — position:relative SIN z-index no arma stacking context
// nuevo, así que los z-index internos de Leaflet (controles ~1000, panes
// ~200-700) se comparan contra el documento entero en vez de quedar
// contenidos adentro del mapa. Un modal con z-50 (ej. DeliverModal) puede
// terminar por DEBAJO de un mapa de la página detrás suyo — el mapa "se
// escapa" del backdrop. Con z-index explícito acá, .leaflet-container arma
// su propio stacking context y sus hijos quedan contenidos adentro.
if (typeof document !== 'undefined') {
  const styleId = 'delivery-map-stacking-fix';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = '.leaflet-container { z-index: 0; }';
    document.head.appendChild(style);
  }
}

// Ícono inline (SVG en data URI) — evita el bug clásico de Leaflet+bundlers
// donde las imágenes por defecto del marcador (marker-icon.png) no se
// resuelven con Webpack/Next, sin depender de ningún asset externo.
const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
  <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.3 21.7 0 14 0z" fill="#e11d48"/>
  <circle cx="14" cy="14" r="6" fill="#fff"/>
</svg>`;

const pinIcon = L.icon({
  iconUrl: `data:image/svg+xml;base64,${typeof window !== 'undefined' ? window.btoa(PIN_SVG) : ''}`,
  iconSize: [28, 40],
  iconAnchor: [14, 40],
  popupAnchor: [0, -36],
});

function DragHandler({ onDragEnd }: { onDragEnd?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onDragEnd?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// MapContainer solo usa `center` para crear el mapa la primera vez — no
// reacciona a cambios posteriores del prop (limitación de react-leaflet).
// Sin esto, cargar coordenadas desde un input aparte (ej. el usuario tipea
// lat/lng a mano) movería el pin pero dejaría la vista del mapa centrada en
// el punto viejo, o incluso fuera de cuadro.
function RecenterOnChange({ position }: { position: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(position);
  }, [position, map]);
  return null;
}

export interface DeliveryMapInnerProps {
  latitude: number;
  longitude: number;
  draggable?: boolean;
  onDragEnd?: (lat: number, lng: number) => void;
  zoom?: number;
  height?: number | string;
}

export default function DeliveryMapInner({
  latitude,
  longitude,
  draggable = false,
  onDragEnd,
  zoom = 15,
  height = 220,
}: DeliveryMapInnerProps) {
  const [position, setPosition] = useState<[number, number]>([latitude, longitude]);

  // Sincroniza el pin cuando lat/lng cambian desde afuera (ej. un input de
  // coordenadas separado, no el drag/click de este mismo mapa — eso ya
  // actualiza `position` directo, sin pasar por acá). Ajuste de estado
  // durante el render en vez de un efecto — mismo patrón que recomienda
  // React para "adjusting state when a prop changes" sin el render extra
  // de un useEffect.
  const [[prevLat, prevLng], setPrevLatLng] = useState([latitude, longitude]);
  if (latitude !== prevLat || longitude !== prevLng) {
    setPrevLatLng([latitude, longitude]);
    setPosition([latitude, longitude]);
  }

  return (
    <div style={{ height, width: '100%', borderRadius: 12, overflow: 'hidden' }}>
      <MapContainer
        center={position}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={draggable}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RecenterOnChange position={position} />
        <Marker
          position={position}
          icon={pinIcon}
          draggable={draggable}
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target as L.Marker;
              const { lat, lng } = marker.getLatLng();
              setPosition([lat, lng]);
              onDragEnd?.(lat, lng);
            },
          }}
        />
        {draggable && (
          <DragHandler
            onDragEnd={(lat, lng) => {
              setPosition([lat, lng]);
              onDragEnd?.(lat, lng);
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
