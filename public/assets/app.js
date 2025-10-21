const state = {
  ws: null,
  reconnectTimeout: null,
};

const statusTextEl = () => document.querySelector('[data-status-text]');
const statusSpinnerEl = () => document.querySelector('[data-status-spinner]');

const setStatus = (text, busy = false) => {
  const textEl = statusTextEl();
  const spinnerEl = statusSpinnerEl();
  if (textEl) {
    textEl.textContent = text;
  }
  if (spinnerEl) {
    spinnerEl.classList.toggle('hidden', !busy);
  }
};

const appendLog = (containerId, content, { preserveWhitespace = false } = {}) => {
  const container = document.getElementById(containerId);
  if (!container) return;

  const entry = document.createElement(preserveWhitespace ? 'pre' : 'div');
  entry.className = 'text-sm text-gray-200 whitespace-pre-wrap break-words';
  entry.textContent = content;
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
};

const connectWebSocket = () => {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${protocol}://${location.host}/ws`;

  if (state.ws) {
    state.ws.close();
  }

  const ws = new WebSocket(url);
  state.ws = ws;

  ws.addEventListener('open', () => {
    setStatus('Connected', false);
  });

  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'ai_thought':
          appendLog('ai-thoughts-log', msg.content ?? event.data);
          break;
        case 'terminal_log':
          appendLog('terminal-log', msg.content ?? event.data, { preserveWhitespace: true });
          break;
        case 'status_update':
          if (msg.content !== 'heartbeat') {
            setStatus(msg.content || 'Status update', false);
          }
          break;
        default:
          appendLog('ai-thoughts-log', `[${msg.type ?? 'message'}] ${msg.content ?? event.data}`);
      }
    } catch (error) {
      appendLog('terminal-log', `Malformed WebSocket payload: ${event.data}`, { preserveWhitespace: true });
    }
  });

  ws.addEventListener('close', () => {
    setStatus('Disconnected - retrying…', true);
    state.reconnectTimeout = setTimeout(connectWebSocket, 5_000);
  });

  ws.addEventListener('error', () => {
    setStatus('WebSocket error', true);
  });
};

const invokePathway = async (pathway, payload) => {
  const response = await fetch(`/api/invoke/${encodeURIComponent(pathway)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errorPayload.error || errorPayload.message || 'Unknown error');
  }

  return response.json().catch(() => ({}));
};

const attachFormHandlers = () => {
  document.querySelectorAll('form[data-pathway]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const pathway = form.dataset.pathway;
      if (!pathway) return;

      const formData = new FormData(form);
      const payload = {};
      formData.forEach((value, key) => {
        if (value instanceof File) return;
        if (payload[key]) {
          if (Array.isArray(payload[key])) {
            payload[key].push(value);
          } else {
            payload[key] = [payload[key], value];
          }
        } else {
          payload[key] = value;
        }
      });

      setStatus(`Invoking ${pathway}…`, true);
      try {
        const result = await invokePathway(pathway, payload);
        appendLog('ai-thoughts-log', `✅ ${pathway} invoked successfully`);
        appendLog('terminal-log', JSON.stringify(result, null, 2), { preserveWhitespace: true });
        setStatus('Invocation complete', false);
      } catch (error) {
        appendLog('terminal-log', `Invocation failed: ${error instanceof Error ? error.message : error}`, {
          preserveWhitespace: true,
        });
        setStatus('Invocation failed', false);
      }
    });
  });
};

const attachPromptButtons = () => {
  document.querySelectorAll('[data-prompt-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-prompt-target');
      if (!targetId) return;
      const input = document.getElementById(targetId);
      if (!input) return;
      const text = button.getAttribute('data-prompt-text') ?? '';
      input.value = text;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
};

const attachHealthButton = () => {
  const button = document.querySelector('[data-health-check]');
  if (!button) return;
  const output = document.querySelector('[data-health-output]');
  button.addEventListener('click', async () => {
    setStatus('Running health checks…', true);
    try {
      const response = await fetch('/api/health');
      const json = await response.json();
      if (output) {
        output.textContent = JSON.stringify(json, null, 2);
      }
      setStatus(`Health status: ${json.status}`, false);
    } catch (error) {
      if (output) {
        output.textContent = `Health check failed: ${error instanceof Error ? error.message : error}`;
      }
      setStatus('Health check failed', false);
    }
  });
};

const setupStatusBarLink = () => {
  const bar = document.querySelector('[data-status-bar]');
  if (!bar) return;
  bar.addEventListener('click', () => {
    window.location.href = '/dashboard.html';
  });
};

window.addEventListener('DOMContentLoaded', () => {
  setupStatusBarLink();
  attachFormHandlers();
  attachPromptButtons();
  attachHealthButton();
  connectWebSocket();
});

window.repoAgentApp = {
  connectWebSocket,
};
