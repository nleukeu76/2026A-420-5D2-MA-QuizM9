/**
 * Le temps réel, avec Socket.IO : une connexion par onglet, greffée au
 * serveur HTTP d'Express (même port, 3000, chemin /socket.io).
 *
 * Les ACTIONS restent en HTTP (rejoindre, avancer, répondre). Socket.IO sert
 * à l'autre sens : le serveur PRÉVIENT les navigateurs qu'une partie a
 * changé, au lieu d'attendre qu'ils le lui demandent.
 *
 * Ce que Socket.IO fait à notre place, comparé au WebSocket de la semaine 7 :
 * - des ÉVÉNEMENTS nommés plutôt qu'un champ `type`, sans JSON.parse ;
 * - les SALONS (rooms) : socket.join(code), puis io.to(code).emit(...) ;
 * - l'ACCUSÉ DE RÉCEPTION (ack) : une fonction qui répond à CET envoi ;
 * - la reconnexion automatique, côté navigateur.
 *
 * Les événements :
 *
 *   navigateur → serveur   'join', code, ack     suivre cette partie
 *                                                ack({ game }) ou ack({ error })
 *   serveur → navigateur   'state', game         l'état public complet
 *
 * À chaque changement, tout le salon reçoit l'état complet, pas seulement ce
 * qui a changé : un navigateur qui se reconnecte est ainsi à jour d'un seul
 * message.
 */
/**
 * Le temps réel, avec Socket.IO : une connexion par onglet, greffée au
 * serveur HTTP d'Express (même port, 3000, chemin /socket.io).
 *
 * Les événements :
 *
 *   navigateur → serveur   'join', code, ack     ack({ game, chat }) ou ack({ error })
 *   serveur → navigateur   'state', game         l'état public complet
 *   navigateur → serveur   'chat:send', { nickname, text }, ack
 *                                                ack({}) ou ack({ error })
 *   serveur → navigateur   'chat:message', { id, nickname, text, sentAt }
 *   serveur → navigateur   'chat:enabled', enabled
 */
import { Server } from 'socket.io';
import * as repository from './repository/index.js';
import { closeQuestionIfExpired, publicState } from './game.js';

/** Le serveur Socket.IO ; null tant que attachRealtime n'a pas été appelé. */
let io = null;

/** Le chat de chaque partie, en mémoire : code → { enabled, messages }. */
const chats = new Map();
let nextMessageId = 1;

/** Retourne le chat de cette partie. Le crée, actif et vide, au premier appel. */
function chatOf(code) {
  if (!chats.has(code)) {
    chats.set(code, { enabled: true, messages: [] });
  }
  return chats.get(code);
}

/** Greffe Socket.IO au serveur HTTP (celui que retourne app.listen). */
export function attachRealtime(server) {
  io = new Server(server);

  io.on('connection', (socket) => {
    socket.on('join', async (code, ack) => {
      if (typeof ack !== 'function') return;

      try {
        const game = await repository.findGameByCode(String(code));
        if (!game) {
          return ack({ error: 'Partie introuvable.' });
        }
        // Une connexion suit une seule partie : on quitte les autres salons.
        for (const room of socket.rooms) {
          if (room !== socket.id) socket.leave(room);
        }
        socket.join(game.code);
        socket.data.code = game.code; // 'chat:send' lira ici la partie de CETTE connexion

        await closeQuestionIfExpired(game);
        ack({ game: await publicState(game.code), chat: chatOf(game.code) });
      } catch (err) {
        console.error(err);
        ack({ error: 'Erreur du serveur.' });
      }
    });

    socket.on('chat:send', async (message, ack) => {
      if (typeof ack !== 'function') return;

      try {
        // 1. La partie
        const code = socket.data.code;
        if (!code) {
          return ack({ error: 'Suivez d’abord une partie.' });
        }

        // 2. Le texte
        const text = typeof message?.text === 'string' ? message.text.trim() : '';
        if (text === '' || text.length > 200) {
          return ack({ error: 'Le message doit contenir entre 1 et 200 caractères.' });
        }

        // 3. Le joueur
        const game = await repository.findGameByCode(code);
        if (!game) {
          return ack({ error: 'Partie introuvable.' });
        }
        const player = await repository.findPlayer(game.id, message?.nickname);
        if (!player) {
          return ack({ error: 'Joueur inconnu dans cette partie.' });
        }

        // Jalon 3 : c'est le serveur qui refuse, griser le champ ne protège rien.
        const chat = chatOf(code);
        if (!chat.enabled) {
          return ack({ error: 'Le chat est désactivé.' });
        }

        // 4. Le message
        const chatMessage = {
          id: nextMessageId++,
          nickname: message.nickname,
          text,
          sentAt: Date.now(),
        };

        // 5. Conserver, diffuser à tout le salon, répondre
        chat.messages.push(chatMessage);
        if (chat.messages.length > 50) chat.messages.shift(); // jalon 2
        io.to(code).emit('chat:message', chatMessage);
        ack({});
      } catch (err) {
        console.error(err);
        ack({ error: 'Erreur du serveur.' });
      }
    });
  });

  return io;
}

/** Envoie l'état de la partie à toutes les connexions qui la suivent. */
export async function broadcastState(code) {
  if (!io?.sockets.adapter.rooms.has(code)) return;

  io.to(code).emit('state', await publicState(code));
}

/** Le serveur clôt la question à son échéance, puis prévient le salon. */
export function closeAtDeadline(code, deadline) {
  const timer = setTimeout(async () => {
    try {
      const game = await repository.findGameByCode(code);
      await closeQuestionIfExpired(game);
      await broadcastState(code);
    } catch (err) {
      console.error(err);
    }
  }, deadline - Date.now() + 100);

  timer.unref();
}

/** Désactive ou réactive le chat de la partie, puis prévient tout le salon. */
export function setChatEnabled(code, enabled) {
  chatOf(code).enabled = enabled;
  io?.to(code).emit('chat:enabled', enabled);
}