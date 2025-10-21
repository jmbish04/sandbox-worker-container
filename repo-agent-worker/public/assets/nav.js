const NAV_PLACEHOLDER_SELECTOR = '[data-nav-placeholder]';
const NAV_PARTIAL_PATH = '/_nav.html';

async function loadNavigation() {
  const host = document.querySelector(NAV_PLACEHOLDER_SELECTOR);
  if (!host) return;

  try {
    const response = await fetch(NAV_PARTIAL_PATH);
    if (!response.ok) {
      throw new Error(`Failed to fetch navigation (${response.status})`);
    }
    const html = await response.text();
    host.innerHTML = html;
  } catch (error) {
    host.innerHTML = `\n      <div class="bg-red-100 text-red-700 px-4 py-2 rounded">\n        Navigation failed to load: ${error instanceof Error ? error.message : error}\n      </div>\n    `;
  }
}

window.addEventListener('DOMContentLoaded', loadNavigation);
