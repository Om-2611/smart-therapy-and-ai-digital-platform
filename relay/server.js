// Standalone Sarvam speech-to-text WebSocket relay.
//
// Runs as its own always-on process (Fly.io), separate from the Next.js app
// (Vercel). Sarvam's streaming STT WebSocket only accepts the API key as an
// HTTP *header*, and browsers cannot set headers on a WebSocket, so the
// browser connects here (no key, but a Firebase ID token instead), and this
// process opens the upstream Sarvam socket with the header and relays audio
// frames up and transcript messages back down. The Sarvam key never reaches
// the client.
//
// This used to be bundled inside the main app's server.js alongside the
// Next.js app itself. Split out so the app can run on serverless (Vercel)
// while this one persistent-connection piece runs on a small always-on host.

const { createServer } = require('http')
const { parse } = require('url')
const { WebSocketServer, WebSocket } = require('ws')
const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')

const firebaseApp = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
})
const auth = getAuth(firebaseApp)

const PORT = parseInt(process.env.PORT || '8080', 10)
const SARVAM_WS = 'wss://api.sarvam.ai/speech-to-text/ws'
// Query params we forward through to Sarvam (everything except our own).
const PASS_PARAMS = ['model', 'mode', 'high_vad_sensitivity', 'vad_signals', 'language_code']

function openSarvam(query) {
  const params = new URLSearchParams()
  for (const k of PASS_PARAMS) {
    const v = query.get(k)
    if (v != null) params.set(k, v)
  }
  return new WebSocket(`${SARVAM_WS}?${params.toString()}`, {
    headers: { 'api-subscription-key': process.env.SARVAM_API_KEY || '' },
  })
}

async function authenticate(query) {
  const token = query.get('token')
  if (!token) return null
  try {
    return await auth.verifyIdToken(token)
  } catch (e) {
    console.error('[stt-relay] token verification failed:', e.message)
    return null
  }
}

async function handleProxyConnection(client, query) {
  if (!process.env.SARVAM_API_KEY) {
    client.close(1011, 'STT not configured')
    return
  }

  const decoded = await authenticate(query)
  if (!decoded) {
    client.close(4401, 'Unauthorized')
    return
  }

  const upstream = openSarvam(query)
  const queue = [] // browser audio that arrives before Sarvam is ready
  let upstreamOpen = false

  upstream.on('open', () => {
    upstreamOpen = true
    for (const m of queue) upstream.send(m)
    queue.length = 0
  })
  upstream.on('message', (data) => {
    if (client.readyState === WebSocket.OPEN) client.send(data.toString())
  })
  upstream.on('unexpected-response', (_req, res) => {
    console.error('[stt-relay] Sarvam handshake failed:', res.statusCode)
    try { client.close(1011, 'Upstream auth failed') } catch {}
  })
  upstream.on('error', (e) => {
    console.error('[stt-relay] upstream error:', e.message)
    try { client.close(1011, 'Upstream error') } catch {}
  })
  upstream.on('close', () => { try { client.close() } catch {} })

  client.on('message', (data) => {
    const msg = data.toString()
    if (upstreamOpen && upstream.readyState === WebSocket.OPEN) upstream.send(msg)
    else queue.push(msg)
  })
  client.on('close', () => { try { upstream.close() } catch {} })
  client.on('error', () => { try { upstream.close() } catch {} })
}

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
    return
  }
  res.writeHead(404)
  res.end()
})

const wss = new WebSocketServer({ noServer: true })
wss.on('connection', (ws, req) => {
  const { query } = parse(req.url, true)
  const sp = new URLSearchParams(query)
  handleProxyConnection(ws, sp)
})

server.on('upgrade', (req, socket, head) => {
  const { pathname } = parse(req.url)
  if (pathname === '/api/sarvam-stream') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  } else {
    socket.destroy()
  }
})

server.listen(PORT, () => {
  console.log(`> STT relay ready on port ${PORT}`)
})
