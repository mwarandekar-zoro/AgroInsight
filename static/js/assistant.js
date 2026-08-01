// AgroInsight AI — assistant chat

(function () {
  const form = document.getElementById('chatForm');
  if (!form) return;

  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSend');
  const messagesEl = document.getElementById('chatMessages');
  const suggestionsEl = document.getElementById('chatSuggestions');

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addUserMessage(text) {
    const el = document.createElement('div');
    el.className = 'chat-msg user';
    const initial = window.CURRENT_USER_INITIAL || 'U';
    el.innerHTML = `<div class="chat-avatar user">${initial}</div><div class="chat-bubble"></div>`;
    el.querySelector('.chat-bubble').textContent = text;
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function addBotMessage(text, redirectUrl) {
    const el = document.createElement('div');
    el.className = 'chat-msg bot';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = text;
    if (redirectUrl) {
      const link = document.createElement('a');
      link.className = 'chat-redirect';
      link.href = redirectUrl;
      link.textContent = 'Open →';
      bubble.appendChild(document.createElement('br'));
      bubble.appendChild(link);
    }
    el.innerHTML = `<div class="chat-avatar bot">🤖</div>`;
    el.appendChild(bubble);
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function addTyping() {
    const el = document.createElement('div');
    el.className = 'chat-msg bot';
    el.id = 'chatTyping';
    el.innerHTML = `<div class="chat-avatar bot">🤖</div><div class="chat-bubble chat-typing"><span></span><span></span><span></span></div>`;
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function removeTyping() {
    const el = document.getElementById('chatTyping');
    if (el) el.remove();
  }

  async function sendMessage(text) {
    if (!text.trim()) return;
    addUserMessage(text);
    input.value = '';
    sendBtn.disabled = true;
    suggestionsEl.style.display = 'none';
    addTyping();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      removeTyping();

      if (!res.ok) {
        addBotMessage(data.error || 'Something went wrong.', null);
        return;
      }
      addBotMessage(data.reply, data.redirect_url);

      if (data.examples) {
        suggestionsEl.innerHTML = data.examples.map(
          (e) => `<button type="button" class="chat-chip" data-prompt="${e}">${e}</button>`
        ).join('');
        suggestionsEl.style.display = 'flex';
        bindChips();
      }
    } catch (err) {
      removeTyping();
      addBotMessage('Could not reach the assistant — check your connection and try again.', null);
    } finally {
      sendBtn.disabled = false;
    }
  }

  function bindChips() {
    suggestionsEl.querySelectorAll('.chat-chip').forEach((chip) => {
      chip.addEventListener('click', () => sendMessage(chip.dataset.prompt));
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage(input.value);
  });

  bindChips();
})();
