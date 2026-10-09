import { useEffect, useRef } from 'react';

const chatUrl = import.meta.env.VITE_MINNIT_CHAT_URL
  ?? 'https://organizations.minnit.chat/729157311861813/c/Main?embed';

export default function EventChat() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const embed = document.createElement('span');
    embed.className = 'minnit-chat-sembed';
    embed.dataset.chatname = chatUrl;
    embed.dataset.style = 'width:100%; height:500px; max-height:90vh;';
    embed.dataset.version = '1.55';
    embed.textContent = 'Chat';

    const script = document.createElement('script');
    script.src = 'https://minnit.chat/js/embed.js?c=1772345192';
    script.defer = true;

    const attribution = document.createElement('p');
    attribution.className = 'powered-by-minnit';
    attribution.innerHTML = '<a href="https://minnit.chat" target="_blank" rel="noreferrer">Chat powered by Minnit</a>';

    element.append(embed, attribution, script);
    return () => { element.replaceChildren(); };
  }, []);

  return (
    <section className="panel event-chat" aria-labelledby="chat-heading">
      <div className="section-heading">
        <div><p className="eyebrow">COMMUNITY</p><h2 id="chat-heading">Event chat</h2></div>
        <span className="muted">Talk to the team</span>
      </div>
      <div className="chat-container" ref={container} />
      <p className="chat-notice">Please be respectful. Chat is provided and processed by Minnit Chat.</p>
    </section>
  );
}
