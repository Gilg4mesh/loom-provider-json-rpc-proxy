import http from 'http'
import fs from 'fs'
import path from 'path'
import { CryptoUtils, LoomProvider, Client, ClientEvent } from 'loom-js'
import { IEthRPCPayload } from 'loom-js/dist/loom-provider'

// Default chain id
const chainId = process.env.CHAIN_ID || 'default'

// Default chain
const chainEndpoint = process.env.CHAIN_ENDPOINT || 'wss://plasma.dappchains.com'

// Default port
const port = process.env.PORT || 8080

// Initialize Client and LoomProvider
let privateKey = null

try {
  const privateKeyStr = fs.readFileSync(path.join(__dirname, '../private_key'), 'utf-8')
  privateKey = CryptoUtils.B64ToUint8Array(privateKeyStr)
} catch (e) {
  console.log(path.join(__dirname, '../private_key') + ' not exists, use random privatekey.')
  privateKey = CryptoUtils.generatePrivateKey()
}

const client = new Client(chainId, `${chainEndpoint}/websocket`, `${chainEndpoint}/queryws`)
const loomProvider = new LoomProvider(client, privateKey)

// Used by Remix https://remix.ethereum.org
loomProvider.addCustomMethod('net_listening', (payload: IEthRPCPayload) => true)

client.on(ClientEvent.Error, msg => {
  console.error('Error on client:', msg)
})

console.log(`Proxy calls from HTTP port ${port} to WS ${chainEndpoint}`)

// Let's serve the Proxy
http
  .createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Request-Method', '*')
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST')
    res.setHeader('Access-Control-Allow-Headers', '*')

    // POST is accepted otherwise BAD GATEWAY
    if (req.method === 'POST') {
      try {
        let body = ''

        req.on('data', chunk => {
          body += chunk.toString()
        })

        req.on('end', async () => {
          try {
            // Proxy JSON RPC to LoomProvider
            const result = await loomProvider.sendAsync(JSON.parse(body))
            res.end(JSON.stringify(result))
          } catch (err) {
            console.error(err)
            res.statusCode = 500 // INTERNAL ERROR
            res.end(err.data ? err.data : err.message)
          }
        })
      } catch (err) {
        console.error(err)
        res.statusCode = 500 // INTERNAL ERROR
        res.end()
      }
    } else if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
    } else {
      res.statusCode = 502 // BAD GATEWAY
      res.end()
    }
  })
  .listen(port)
