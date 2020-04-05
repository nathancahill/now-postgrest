import { join } from 'path';
import { readFile } from 'fs-extra';
import {
  createLambda,
  glob,
  download,
  FileBlob,
  BuildOptions,
  runNpmInstall,
  AnalyzeOptions,
  PrepareCacheOptions,
  Files,
} from '@now/build-utils';
import crypto from 'crypto'
import execa from 'execa';

export const config = {
  maxLambdaSize: '50mb',
  basePath: '/',
};

export const version = 3;

export async function analyze({
  files,
  entrypoint,
  config,
}: AnalyzeOptions) {
  return crypto.createHash('sha1').update(`
    ${entrypoint}
    ${files[entrypoint].digest}
    ${JSON.stringify(config)}
  `).digest('base64')
}

export async function prepareCache({
  workPath,
}: PrepareCacheOptions): Promise<Files> {
  const cache = await glob('node_modules/**', workPath);
  return cache;
}

export async function build({
  files,
  entrypoint,
  config: userConfig,
  workPath,
  meta = {},
}: BuildOptions) {
  await download(files, workPath, meta);
  console.log('Installing dependencies...');

  await runNpmInstall(
    __dirname,
    [
      '--production',
      '--modules-folder',
      join(workPath, 'node_modules'),
    ],
  );

  let lambdaFiles = {
    [entrypoint]: files[entrypoint],
  }

  if (!meta.isDev) {
    await execa('curl', ['-sOL', 'https://github.com/nathancahill/lambda-binaries/releases/download/postgrest/postgrest.tar.gz'], { cwd: workPath });
    await execa('tar', ['-xzf', 'postgrest.tar.gz'], { cwd: workPath });

    const binFiles = await glob('bin/**', workPath);
    const libFiles = await glob('lib/**', workPath);

    lambdaFiles = {
      ...lambdaFiles,
      ...binFiles,
      ...libFiles,
    }
  }

  const nodeFiles = await glob('node_modules/**', workPath);

  const confData = await readFile(join(__dirname, '..', 'postgrest.conf'), 'utf8');
  let launcherData = await readFile(join(__dirname, 'launcher.js'), 'utf8');

  launcherData = launcherData
    .replace("'__NOW_PORT'", '3000')
    .replace('__NOW_BASE_PATH', `${userConfig.basePath || config.basePath}`)
    .replace('__NOW_BINARY', meta.isDev ? 'postgrest' : 'bin/postgrest')
    .replace('__NOW_READY_TEXT', 'Connection successful');

  const lambda = await createLambda({
    files: {
      ...lambdaFiles,
      ...nodeFiles,
      'launcher.js': new FileBlob({ data: launcherData }),
      'postgrest.conf': new FileBlob({ data: confData })
    },
    handler: 'launcher.launcher',
    runtime: 'nodejs12.x',
  });

  return {
    output: lambda,
  };
}
