import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/nunito/latin-900.css';
import './styles.css';
import './progression.css';
import { App } from './game/app';

async function boot(): Promise<void> {
  const loader = document.getElementById('loader') as HTMLElement;
  try {
    // Canvas text only uses a web font once it has loaded, so load before the first frame.
    await Promise.all([document.fonts.load('20px "Lilita One"'), document.fonts.load('800 14px Nunito')]);
  } catch {
    // Fall back to system fonts rather than block the game.
  }
  try {
    const app = new App();
    if (new URLSearchParams(location.search).get('capture') === '1') {
      (window as unknown as { __sl: App }).__sl = app;
    }
    await app.boot();
    loader.classList.add('done');
    window.setTimeout(() => loader.remove(), 400);
  } catch (err) {
    console.error(err);
    loader.innerHTML = `<p class="load-err">This game needs WebGL 2, which your browser or device has turned off.<br/>Try the latest Chrome, Edge, Firefox or Safari.</p>`;
  }
}

void boot();
