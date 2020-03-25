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
import execa from 'execa';

export const config = {
  maxLambdaSize: '50mb',
  basePath: '/',
};

export async function build({
  files,
  entrypoint,
  config: userConfig,
  workPath,
}: BuildOptions) {
  console.log('downloading user files...');
  await download(files, workPath);
  await runNpmInstall(__dirname, [
    '--production',
    '--modules-folder',
    join(workPath, 'node_modules'),
  ]);

  await execa('curl', ['-sOL', 'https://github.com/nathancahill/lambda-binaries/releases/download/postgrest/postgrest.tar.gz'], { cwd: workPath });
  await execa('tar', ['-xzf', 'postgrest.tar.gz'], { cwd: workPath });

  const binFiles = await glob('bin/**', workPath);
  const libFiles = await glob('lib/**', workPath);
  const nodeFiles = await glob('node_modules/**', workPath);

  const launcherPath = join(__dirname, 'launcher.js');
  let launcherData = await readFile(launcherPath, 'utf8');

  const basePath = userConfig.basePath || config.basePath;

  launcherData = launcherData
    .replace("'__NOW_PORT'", '3000')
    .replace('__NOW_BASE_PATH', `${basePath}`)
    .replace('__NOW_BINARY', `bin/postgrest ${entrypoint}`)
    .replace('__NOW_READY_TEXT', 'Connection successful');

  const lambda = await createLambda({
    files: {
      [entrypoint]: files[entrypoint],
      ...binFiles,
      ...libFiles,
      ...nodeFiles,
      'launcher.js': new FileBlob({ data: launcherData }),
    },
    handler: 'launcher.launcher',
    runtime: 'nodejs12.x',
  });

  return {
    [entrypoint]: lambda,
  };
}
