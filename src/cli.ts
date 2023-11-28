import { basename } from 'node:path';
import { parseArgs } from 'node:util';

import * as chalk from 'chalk';

interface Options {
  fileName: string;
  port: number;
  corsOrigin: string | true;
  extendURL: string | undefined;
  testCases : string;
  feature: string;
}

export function parseCLI(): Options {
  const [_, execPath] = process.argv;
  const execName = basename(execPath);

  const { values, positionals } = parser();

  if (values.help === false) {
    process.stderr.write(helpMessage());
    process.exit(0);
  }

  if (positionals.length > 1) {
    reportError('Please specify single SDL file');
  }

  let fileName = positionals[0];
  if (fileName == null) {
    fileName = values.extend
      ? './schema_extension.faker.graphql'
      : './schema.faker.graphql';
    process.stderr.write(
      chalk.yellow(
        `Default file ${chalk.magenta(fileName)} is used. ` +
          `Specify [SDLFile] as argument to change.`,
      ),
    );
  }

  return {
    fileName,
    port: parsePortNumber(values.port),
    corsOrigin: values['cors-origin'] ?? values.co ?? true,
    extendURL: values.extend,
    testCases: values["test-case"],
    feature: values["feature"],
  };

  function parsePortNumber(str: string): number {
    const value = Number.parseInt(str);
    if (!Number.isInteger(value) || value <= 0 || value.toString() !== str) {
      reportError('Invalid port number: ' + str);
    }
    return value;
  }

  function helpMessage(): string {
    return `${execName} [SDLFile]

    Positionals:
      SDLFile  path to file with SDL. If this argument is omitted Faker uses default
               file name                                                    [string]

    Options:
      --version            Show version number                             [boolean]
      -h, --help           Show help                                       [boolean]
      --port, -p           HTTP Port                        [number] [default: 9002]
      --open, -o           Open page with SDL editor and GraphiQL in browser
                                                                           [boolean]
      --cors-origin, --co  CORS: Specify the custom origin for the
                           Access-Control-Allow-Origin header, by default it is the
                           same as \`Origin\` header from the request
                                                                            [string]
      --extend, -e         URL to existing GraphQL server to extend         [string]
      --feature            Specify to run feature's main graphql            [string]
      --test-case          Specify to run particular test case              [string]
    `;
  }

  function parser() {
    try {
      return parseArgs({
        strict: true,
        allowPositionals: true,
        options: {
          help: {
            short: 'h',
            type: 'boolean',
          },
          port: {
            short: 'p',
            type: 'string',
            default: process.env.PORT || '9002',
          },
          open: {
            short: 'o',
            type: 'boolean',
          },
          'cors-origin': {
            type: 'string',
          },
          // alias for 'cors-origin'
          co: { type: 'string' },
          extend: {
            short: 'e',
            type: 'string',
          },
          "feature": {
            type: 'string',
            default: '',
          },
          "test-case" : {
            type: 'string',
            default: '1',
          }
        },
      });
    } catch (error) {
      reportError(error.message);
    }
  }

  function reportError(message: string): never {
    process.stderr.write(`${execName}: ${message}\n`);
    process.exit(1);
  }
}
