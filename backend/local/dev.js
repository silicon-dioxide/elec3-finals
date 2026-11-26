process.env.TABLE_NAME ||= 'Ratings'
process.env.DYNAMODB_ENDPOINT = 'http://localhost:8000'

const { start, stop } = await import('./db.js')
const { startServer, stopServer } = await import('./server.js')

await start()
await startServer()
console.log('Local ratings API listening at http://localhost:3001')

async function shutdown() {
  await stopServer()
  await stop()
  process.exit(0)
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
