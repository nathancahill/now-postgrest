import { APIGatewayProxyEvent, Context } from 'aws-lambda'
import { join } from 'path'
import waitOn from 'wait-on'
import { PassThrough } from 'stream'
import { spawn } from 'child_process'
import getPort from 'get-port'
import { pathExists, writeFile } from 'fs-extra'
import { IncomingHttpHeaders, OutgoingHttpHeaders, request } from 'http'

interface NowProxyEvent {
    Action: string
    body: string
}

export interface NowProxyRequest {
    isApiGateway?: boolean
    method: string
    path: string
    headers: IncomingHttpHeaders
    body: Buffer
}

export interface NowProxyResponse {
    statusCode: number
    headers: OutgoingHttpHeaders
    body: string
    encoding: string
}

function normalizeNowProxyEvent(event: NowProxyEvent): NowProxyRequest {
    let bodyBuffer: Buffer | null
    const { method, path, headers, encoding, body } = JSON.parse(event.body)

    if (body) {
        if (encoding === 'base64') {
            bodyBuffer = Buffer.from(body, encoding)
        } else if (encoding === undefined) {
            bodyBuffer = Buffer.from(body)
        } else {
            throw new Error(`Unsupported encoding: ${encoding}`)
        }
    } else {
        bodyBuffer = Buffer.alloc(0)
    }

    return { isApiGateway: false, method, path, headers, body: bodyBuffer }
}

function normalizeAPIGatewayProxyEvent(
    event: APIGatewayProxyEvent,
): NowProxyRequest {
    let bodyBuffer: Buffer | null
    const { httpMethod: method, path, headers, body } = event

    if (body) {
        if (event.isBase64Encoded) {
            bodyBuffer = Buffer.from(body, 'base64')
        } else {
            bodyBuffer = Buffer.from(body)
        }
    } else {
        bodyBuffer = Buffer.alloc(0)
    }

    return { isApiGateway: true, method, path, headers, body: bodyBuffer }
}

function normalizeEvent(
    event: NowProxyEvent | APIGatewayProxyEvent,
): NowProxyRequest {
    if ('Action' in event) {
        if (event.Action === 'Invoke') {
            return normalizeNowProxyEvent(event)
        } else {
            throw new Error(`Unexpected event.Action: ${event.Action}`)
        }
    } else {
        return normalizeAPIGatewayProxyEvent(event)
    }
}

const BINARY = '__NOW_BINARY'
const CONF = '__NOW_CONF'
const BASE_PATH = '__NOW_BASE_PATH'

process.on('unhandledRejection', err => {
    console.error('Unhandled rejection:', err)
    process.exit(1)
})

export async function launcher(
    event: NowProxyEvent | APIGatewayProxyEvent,
    context: Context,
): Promise<NowProxyResponse> {
    let isDev = process.env.NOW_REGION === 'dev1'
    let port = '3000'
    let running = false
    const pidPath = join('/tmp', 'NOWPID')

    if (isDev) {
        const portN = await getPort({ port: 3000 })
        port = `${portN}`
    } else {
        // check if container is reused
        running = await pathExists(pidPath)
    }

    context.callbackWaitsForEmptyEventLoop = false
    const { isApiGateway, method, path, headers, body } = normalizeEvent(event)

    let basePath = BASE_PATH

    if (basePath.startsWith('$(') && basePath.endsWith(')')) {
        const basePathEnv = basePath.substring(2, basePath.length - 1)
        basePath = process.env[basePathEnv] || '/'
    }

    const opts = {
        hostname: '127.0.0.1',
        port: parseInt(port),
        path: path.startsWith(basePath)
            ? `/${path.substring(basePath.length)}`
            : path,
        method,
        headers,
    }

    if (!running) {
        const subprocess = spawn(BINARY, [CONF], {
            stdio: ['pipe', 'pipe', 'inherit'],
            detached: !isDev,
            env: {
                ...process.env,
                PGRST_SERVER_PORT: port,
            },
        })

        const inherit = new PassThrough()
        const watcher = new PassThrough()

        if (subprocess.stdout) {
            subprocess.stdout.pipe(inherit)
            subprocess.stdout.pipe(watcher)
        }

        inherit.pipe(process.stdout)

        await new Promise(resolve => {
            watcher.on('data', (chunk: Buffer) => {
                if (chunk.toString('utf8').includes('Connection successful')) {
                    return resolve()
                }
            })
        })

        await waitOn({
            resources: [`tcp:127.0.0.1:${port}`],
            tcpTimeout: 50,
            interval: 50,
        })

        if (!isDev) {
            await writeFile(pidPath, `${subprocess.pid}`)
        }
    }

    // eslint-disable-next-line consistent-return
    return new Promise((resolve, reject) => {
        const req = request(opts, res => {
            const response = res
            const respBodyChunks: Buffer[] = []
            response.on('data', chunk =>
                respBodyChunks.push(Buffer.from(chunk)),
            )
            response.on('error', reject)
            response.on('end', () => {
                const bodyBuffer = Buffer.concat(respBodyChunks)
                delete response.headers.connection

                if (isApiGateway) {
                    delete response.headers['content-length']
                } else if (response.headers['content-length']) {
                    response.headers['content-length'] = String(
                        bodyBuffer.length,
                    )
                }

                resolve({
                    statusCode: response.statusCode || 200,
                    headers: response.headers,
                    body: bodyBuffer.toString('base64'),
                    encoding: 'base64',
                })
            })
        })

        req.on('error', error => {
            setTimeout(() => {
                // this lets express print the true error of why the connection was closed.
                // it is probably 'Cannot set headers after they are sent to the client'
                reject(error)
            }, 2)
        })

        if (body) req.write(body)
        req.end()
    })
}
