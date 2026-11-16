/**
 * Le crochet qui tient l'état de la partie et son chat à jour dans le navigateur.
 */
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export function useGame(code) {
  const [game, setGame] = useState(null);
  const [chat, setChat] = useState({ enabled: true, messages: [] });
  const socketRef = useRef(null);

  useEffect(() => {
    if (!code) return;

    const socket = io({ transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join', code, (reply) => {
        if (reply.game) setGame(reply.game);
        // On REMPLACE le chat : l'ack contient déjà tous les messages gardés.
        if (reply.chat) setChat(reply.chat);
      });
    });

    socket.on('state', setGame);

    // Forme fonction : sinon on lirait toujours le chat vide du premier rendu.
    socket.on('chat:message', (message) => {
      setChat((chat) => ({ ...chat, messages: [...chat.messages, message] }));
    });

    socket.on('chat:enabled', (enabled) => {
      setChat((chat) => ({ ...chat, enabled }));
    });

    return () => {
      socket.disconnect();
    };
  }, [code]);

  /** Envoie un message au chat. Retourne une promesse de la réponse, {} ou { error }. */
  function sendMessage(nickname, text) {
    return socketRef.current.emitWithAck('chat:send', { nickname, text });
  }

  return { game, chat, sendMessage };
}