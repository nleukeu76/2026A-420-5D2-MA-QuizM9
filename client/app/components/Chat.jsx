import { useState } from 'react';
import { setChatEnabled } from '../api.js';

/** Affiche le chat de la partie. Un joueur lit et écrit ; l'animateur lit seulement. */
export default function Chat({ code, chat, sendMessage, nickname, isHost }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);

  async function send(event) {
    event.preventDefault();
    const reply = await sendMessage(nickname, text);
    if (reply.error) {
      setError(reply.error);
    } else {
      setText('');
      setError(null);
    }
  }

  async function toggle() {
    try {
      await setChatEnabled(code, !chat.enabled);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <section className="card chat">
      <h2>Chat</h2>
      <ul className="chat-messages">
        {chat.messages.map((m) => (
          <li key={m.id}>
            <strong>{m.nickname}</strong> {m.text}
          </li>
        ))}
      </ul>

      {!chat.enabled && <p className="notice">Chat désactivé par l'animateur.</p>}
      {isHost && (
        <button className="secondary" onClick={toggle}>
          {chat.enabled ? 'Désactiver le chat' : 'Réactiver le chat'}
        </button>
      )}

      {nickname && (
        <form className="chat-form" onSubmit={send}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!chat.enabled}
          />
          <button disabled={!chat.enabled}>Envoyer</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}