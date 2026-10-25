import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const mode = process.argv[2]
if (mode !== 'dev' && mode !== 'start') {
  throw new Error('Usage: node scripts/run-local.mjs <dev|start>')
}

const root = process.cwd()
const serviceDir = path.join(root, 'mini-services/session-service')
const dev = mode === 'dev'
if (!dev && !existsSync(path.join(root, '.next/standalone/server.js'))) {
  throw new Error('Production build not found. Run `npm run build` first.')
}

const localSessionUrl = 'http://127.0.0.1:3003'
const localEnv = {
  ...process.env,
  SESSION_SERVICE_URL: localSessionUrl,
  NEXT_PUBLIC_SESSION_SERVICE_URL: localSessionUrl,
}

let service
let web
let stopping = false
const children = []

function stop(exitCode = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  }
  setTimeout(() => process.exit(exitCode), 250).unref()
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

async function sessionServiceStatus() {
  try {
    const response = await fetch(`${localSessionUrl}/healthz`, { signal: AbortSignal.timeout(1000) })
    if (response.status === 404) return 'wrong-service'
    const body = await response.json().catch(() => null)
    return response.ok && body?.ok === true ? 'healthy' : 'unhealthy'
  } catch {
    return 'offline'
  }
}

function startSessionService() {
  const child = spawn('bun', dev ? ['--hot', 'index.ts'] : ['run', 'start'], {
    cwd: serviceDir,
    env: { ...localEnv, PORT: '3003' },
    stdio: 'inherit',
  })
  children.push(child)
  child.on('error', (error) => {
    console.error(`Could not start Bun session service: ${error.message}`)
    stop(1)
  })
  return child
}

try {
  let status = await sessionServiceStatus()
  if (status === 'wrong-service') {
    throw new Error('Port 3003 is serving an old or different service. Stop that process, then retry.')
  }
  if (status !== 'healthy') {
    service = startSessionService()
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      if (service.exitCode !== null || service.signalCode !== null) {
        throw new Error('Session service exited before it became healthy. Check whether port 3003 is already in use.')
      }
      status = await sessionServiceStatus()
      if (status === 'healthy') break
      if (status === 'wrong-service') {
        throw new Error('Port 3003 is serving an old or different service. Stop that process, then retry.')
      }
      await delay(300)
    }
    if (status !== 'healthy') throw new Error('Session service did not become healthy on port 3003 within 15 seconds.')
    service.on('exit', (code) => {
      if (!stopping) {
        console.error(`Session service stopped${code === null ? '' : ` (exit ${code})`}.`)
        stop(code ?? 1)
      }
    })
  }

  console.log('Session service is healthy at http://127.0.0.1:3003')
  web = spawn(
    process.execPath,
    dev ? ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-p', '3000'] : ['.next/standalone/server.js'],
    {
      cwd: root,
      env: { ...localEnv, NODE_ENV: dev ? 'development' : 'production', PORT: '3000' },
      stdio: 'inherit',
    },
  )
  children.push(web)
  web.on('error', (error) => {
    console.error(`Could not start Next.js: ${error.message}`)
    stop(1)
  })
  web.on('exit', (code) => stop(code ?? 1))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  stop(1)
}
