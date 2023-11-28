#!/usr/bin/env node

import * as bodyParser from 'body-parser';
import * as chalk from 'chalk';
import * as cors from 'cors';
import * as express from 'express';
import * as fs from 'fs';
import * as open from 'open';
import * as path from 'path';

import { express as voyagerMiddleware } from 'graphql-voyager/middleware';
import { printSchema, Source } from 'graphql';
import { graphqlHTTP } from 'express-graphql';
import { parseCLI } from './cli';
import { buildWithFakeDefinitions, ValidationErrors } from './fake_definition';
import { fakeFieldResolver, fakeTypeResolver } from './fake_schema';
import { getProxyExecuteFn } from './proxy';
import { getRemoteSchema } from './utils';

const log = console.log;
const cliOptions = parseCLI();
const { extendURL, testCases, feature } = cliOptions;

log(`\n\n🚀 Running ${chalk.bgBlueBright(feature)} feature for test case: ${chalk.blue(` ${testCases}`)}`);

if (extendURL) {
  // run in proxy mode
  getRemoteSchema(extendURL)
    .then((schema) => {
      const remoteSDL = new Source(
        printSchema(schema),
        `Introspection from "${extendURL}"`,
      );

      let body = fs.readFileSync(
        path.join(__dirname, "features", feature, "main.graphql"),
        'utf-8',
      );

      let userSDL = getModifiedSDL(body);
      const executeFn = getProxyExecuteFn(extendURL);

      runServer(cliOptions, userSDL, remoteSDL, executeFn);
    })
    .catch((error) => {
      log(chalk.red(error.stack));
      process.exit(1);
    });
} else {
  //this will use local schema
  let body = fs.readFileSync(
    path.join(__dirname, 'local_schema.graphql'),
    'utf-8',
  );
  const remoteSDL = new Source(body);

  let featureBody = fs.readFileSync(
    path.join(__dirname, "features", feature, "main.graphql"),
    'utf-8',
  );

  let userSDL = getModifiedSDL(featureBody);

  runServer(cliOptions, userSDL, remoteSDL);
}

function getModifiedSDL(body:any){
  let featureSpecificTestJson = fs.readFileSync(
    path.join(__dirname, "features", feature, testCases + '.json'),
    'utf-8',
  );

  let testCaseJson = JSON.parse(featureSpecificTestJson);
  let onlykeys = Object.keys(testCaseJson);

  for (let i = 0; i < onlykeys.length; i++) {
    const placeholder = "$" + onlykeys[i];
    const replacement = JSON.stringify(testCaseJson[onlykeys[i]]);

    //remove double quotes as gql value directive works without it
    const unquoted = replacement.replace(/"([^"]+)":/g, '$1:');
    body = body.replaceAll(placeholder, unquoted);
    
  }
  log(`\n${chalk.cyan(body)}`);
  return new Source(body);
}

function runServer(
  options,
  userSDL: Source,
  remoteSDL?: Source,
  customExecuteFn?,
) {
  const { port, openEditor } = options;
  const corsOptions = {
    credentials: true,
    origin: options.corsOrigin,
  };
  const app = express();

  let schema;
  try {
    schema = remoteSDL
      ? buildWithFakeDefinitions(remoteSDL, userSDL)
      : buildWithFakeDefinitions(userSDL);
  } catch (error) {
    if (error instanceof ValidationErrors) {
      prettyPrintValidationErrors(error);
      process.exit(1);
    }
  }

  app.options('/graphql', cors(corsOptions));
  app.use(
    '/graphql',
    cors(corsOptions),
    graphqlHTTP(() => ({
      schema,
      typeResolver: fakeTypeResolver,
      fieldResolver: fakeFieldResolver,
      customExecuteFn,
      graphiql: { headerEditorEnabled: true },
    })),
  );

  app.get('/user-sdl', (_, res) => {
    res.status(200).json({
      userSDL: userSDL.body,
      remoteSDL: remoteSDL?.body,
    });
  });

  app.use('/user-sdl', bodyParser.text({ limit: '8mb' }));
  app.post('/user-sdl', (req, res) => {
    try {
      const fileName = userSDL.name;
      fs.writeFileSync(fileName, req.body);
      userSDL = new Source(req.body, fileName);
      schema = remoteSDL
        ? buildWithFakeDefinitions(remoteSDL, userSDL)
        : buildWithFakeDefinitions(userSDL);

      const date = new Date().toLocaleString();
      log(
        `${chalk.green('✚')} schema saved to ${chalk.magenta(
          fileName,
        )} on ${date}`,
      );

      res.status(200).send('ok');
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  app.use('/editor', express.static(path.join(__dirname, 'editor')));
  app.use('/voyager', voyagerMiddleware({ endpointUrl: '/graphql' }));
  app.use(
    '/voyager.worker.js',
    express.static(
      path.join(
        __dirname,
        '../node_modules/graphql-voyager/dist/voyager.worker.js',
      ),
    ),
  );

  const server = app.listen(port);

  const shutdown = () => {
    server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log(`\n${chalk.green('✔')} Your GraphQL Fake API is ready to use 🚀
  Here are your links:

  ${chalk.blue('❯')} Interactive Editor: http://localhost:${port}/editor
  ${chalk.blue('❯')} GraphQL API:        http://localhost:${port}/graphql
  ${chalk.blue('❯')} GraphQL Voyager:    http://localhost:${port}/voyager

  `);

  if (openEditor) {
    setTimeout(() => open(`http://localhost:${port}/editor`), 500);
  }
}

function prettyPrintValidationErrors(validationErrors: ValidationErrors) {
  const { subErrors } = validationErrors;
  log(
    chalk.red(
      subErrors.length > 1
        ? `\nYour schema contains ${subErrors.length} validation errors: \n`
        : `\nYour schema contains a validation error: \n`,
    ),
  );

  for (const error of subErrors) {
    const [message, ...otherLines] = error.toString().split('\n');
    log([chalk.yellow(message), ...otherLines].join('\n') + '\n\n');
  }
}
