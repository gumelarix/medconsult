import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const SocketContext = createContext(null);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const listenersRef = useRef(new Map());

  useEffect(() => {
    if (!token) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setConnected(false);
        setAuthenticated(false);
      }
      return;
    }

    const newSocket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
      setConnected(true);
      newSocket.emit('authenticate', { token });
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
      setConnected(false);
      setAuthenticated(false);
    });

    newSocket.on('authenticated', (data) => {
      console.log('Socket authenticated:', data);
      setAuthenticated(true);
    });

    newSocket.on('auth_error', (error) => {
      console.error('Socket auth error:', error);
      setAuthenticated(false);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token]);

  const joinSchedule = useCallback((scheduleId) => {
    if (socket && authenticated) {
      socket.emit('join_schedule', { scheduleId });
    }
  }, [socket, authenticated]);

  const leaveSchedule = useCallback((scheduleId) => {
    if (socket && authenticated) {
      socket.emit('leave_schedule', { scheduleId });
    }
  }, [socket, authenticated]);

  const joinCall = useCallback((callSessionId) => {
    if (socket && authenticated) {
      socket.emit('join_call', { callSessionId });
    }
  }, [socket, authenticated]);

  const on = useCallback((event, callback) => {
    if (socket) {
      socket.on(event, callback);
      const listeners = listenersRef.current.get(event) || [];
      listeners.push(callback);
      listenersRef.current.set(event, listeners);
    }
  }, [socket]);

  const off = useCallback((event, callback) => {
    if (socket) {
      socket.off(event, callback);
      const listeners = listenersRef.current.get(event) || [];
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
        listenersRef.current.set(event, listeners);
      }
    }
  }, [socket]);

  const value = {
    socket,
    connected,
    authenticated,
    joinSchedule,
    leaveSchedule,
    joinCall,
    on,
    off,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
