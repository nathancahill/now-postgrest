// https://github.com/nathancahill/lambda-binaries/releases/latest/download/postgrest.tar.gz
import { join } from 'path';
import { readFile } from 'fs-extra';
import {
  createLambda,
  glob,
  download,
  FileBlob,
  BuildOptions,
  runNpmInstall,
} from '@now/build-utils';

export const config = {
  maxLambdaSize: '5mb',
  port: 5000,
  binary: 'bin/handler',
  readyText: '',
};

export async function build({
  files,
  entrypoint,
  workPath,
}: BuildOptions) {
  console.log('downloading user files...');
  await download(files, workPath);
  await runNpmInstall(__dirname, [
    '--modules-folder',
    join(workPath, 'node_modules'),
  ]);

  let outputFiles = await glob('**', workPath);

  const launcherPath = join(__dirname, 'launcher.js');
  let launcherData = await readFile(launcherPath, 'utf8');

  launcherData = launcherData
    .replace("'__NOW_PORT'", '3000')
    .replace('__NOW_BINARY', `bin/postgrest ${entrypoint}`)
    .replace('__NOW_READY_TEXT', 'Connection successful');

  const launcherFiles = {
    'launcher.js': new FileBlob({ data: launcherData }),
  };

  const lambda = await createLambda({
    files: { ...outputFiles, ...launcherFiles },
    handler: 'launcher.launcher',
    runtime: 'nodejs12.x',
    environment: {},
  });

  return {
    [entrypoint]: lambda,
  };
}
