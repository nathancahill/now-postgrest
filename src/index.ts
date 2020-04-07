import { join } from 'path'
import { readFile } from 'fs-extra'
import {
    createLambda,
    download,
    FileBlob,
    glob,
    BuildOptions,
    AnalyzeOptions,
} from '@now/build-utils'
import crypto from 'crypto'
import execa from 'execa'

export const version = 3

export async function analyze({ files, entrypoint, config }: AnalyzeOptions) {
    return crypto
        .createHash('sha1')
        .update(
            `
    ${entrypoint}
    ${files[entrypoint].digest}
    ${JSON.stringify(config)}
  `,
        )
        .digest('base64')
}

export async function build({
    files,
    entrypoint,
    workPath,
    meta = {},
}: BuildOptions) {
    await download(files, workPath, meta)

    let lambdaFiles = {}

    if (!meta.isDev) {
        console.log('Installing postgrest...')
        await execa(
            'curl',
            [
                '-sOL',
                'https://github.com/nathancahill/lambda-binaries/releases/download/postgrest/postgrest.tar.gz',
            ],
            { cwd: workPath },
        )
        await execa('tar', ['-xzf', 'postgrest.tar.gz'], { cwd: workPath })

        const binFiles = await glob('bin/**', workPath)
        const libFiles = await glob('lib/**', workPath)

        lambdaFiles = {
            ...binFiles,
            ...libFiles,
        }
    }

    let launcherData = await readFile(join(__dirname, 'launcher', 'index.js'), 'utf8')
    let confData = await readFile(join(workPath, entrypoint), 'utf8')

    let basePath = '/'
    const basePathRegex = /^\s*base-url\s*=\s*"(.*?)"\s*$/
    const confLines = confData.split(/[\r\n]+/)

    confLines.forEach(line => {
        if (basePathRegex.test(line)) {
            const match = line.match(basePathRegex)

            if (match) {
                basePath = match[1]
            }
        }
    })

    confData = 'server-port = "$(PGRST_SERVER_PORT)"\n' + confData

    launcherData = launcherData
        .replace('__NOW_BINARY', meta.isDev ? 'postgrest' : 'bin/postgrest')
        .replace('__NOW_CONF', entrypoint)
        .replace('__NOW_BASE_PATH', basePath)

    const lambda = await createLambda({
        files: {
            ...lambdaFiles,
            'launcher.js': new FileBlob({ data: launcherData }),
            [entrypoint]: new FileBlob({ data: confData }),
        },
        handler: 'launcher.launcher',
        runtime: 'nodejs12.x',
    })

    return {
        output: lambda,
    }
}
