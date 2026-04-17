// Reintentar pedidos rechazados despues de los fixes en mapper
const http = require('http');

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

async function login() {
  const body = JSON.stringify({ usuario: ADMIN_USER, password: ADMIN_PASS });
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: 'localhost', port: 3000, path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j.ok && j.token) resolve(j.token);
            else reject(new Error(j.error || 'login failed'));
          } catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function emitir(pedidoId, token) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: 'localhost', port: 3000, path: `/api/dgii/ecf/emitir/${pedidoId}`, method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-token': token } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { resolve({ ok: false, raw: data }); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

async function main() {
  const token = await login();
  console.log('Token:', token.substring(0, 12) + '...');

  // Orden: E31 primero, luego E47, luego E33 (para que reference E31 nuevo)
  const orden = [
    { tipo: 'E31', pedidoId: 216 },
    { tipo: 'E47', pedidoId: 223 },
    { tipo: 'E33', pedidoId: 224 },
  ];

  for (const t of orden) {
    console.log(`\nEmitiendo ${t.tipo} (pedido ${t.pedidoId})...`);
    const r = await emitir(t.pedidoId, token);
    const ok = r.ok || r.estado === 'ACEPTADO';
    console.log(`  -> ${r.estado || (r.ok ? 'OK' : 'FAIL')} | eNCF=${r.encf || '-'} | ${r.message || r.error || ''}`);
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
