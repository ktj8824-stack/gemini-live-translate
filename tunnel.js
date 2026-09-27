import localtunnel from 'localtunnel';

async function startTunnel() {
  try {
    const tunnel = await localtunnel({ port: 3000, subdomain: 'gemini-live-translate-app' });
    console.log('--------------------------------------------------');
    console.log('🚀 Mobile Tunnel URL:', tunnel.url);
    console.log('🔑 Tunnel Password (IP): 125.191.86.189');
    console.log('--------------------------------------------------');

    tunnel.on('close', () => {
      console.log('Tunnel closed. Reconnecting in 3s...');
      setTimeout(startTunnel, 3000);
    });

    tunnel.on('error', (err) => {
      console.error('Tunnel error:', err);
    });
  } catch (err) {
    console.error('Failed to open tunnel, retry in 5s...', err);
    setTimeout(startTunnel, 5000);
  }
}

startTunnel();
