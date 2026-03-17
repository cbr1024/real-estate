import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

export default function useSocket() {
  const socketRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
    });

    socket.on('newTrade', (data) => {
      console.log('New trade received:', data);

      // Invalidate relevant queries to refresh data
      if (data.apartmentId) {
        queryClient.invalidateQueries({
          queryKey: ['apartment', data.apartmentId],
        });
        queryClient.invalidateQueries({
          queryKey: ['trades', data.apartmentId],
        });
      }

      // Invalidate apartment list queries to update prices on the map
      queryClient.invalidateQueries({
        queryKey: ['apartments'],
      });
      queryClient.invalidateQueries({
        queryKey: ['apartmentList'],
      });
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    socket.on('connect_error', (err) => {
      console.log('Socket connection error:', err.message);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  const emit = useCallback((event, data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  return { socket: socketRef.current, emit };
}
