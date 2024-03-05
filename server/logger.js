import winston from 'winston';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const { combine, timestamp, printf, colorize } = winston.format;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = __dirname;

// Apply colors to log levels
const colorizer = colorize({ all: true });

const myFormat_console = printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level}: ${message}`;
});

const logger = new winston.createLogger({
  level: 'info',
  defaultMeta: { service: 'user-service' },
  transports: [
    new winston.transports.Console({
      format: combine(colorizer, timestamp(), myFormat_console),
    }),
    new winston.transports.File({
      filename: 'server.log',
      format: combine(timestamp(), myFormat_console),
    }),
  ],
  exitOnError: false,
});

fs.writeFile('server.log', '', () => {});

function formatLogArguments(args) {
  args = Array.prototype.slice.call(args);
  var stackInfo = getStackInfo(1);
  if (stackInfo) {
    // get file path relative to project root
    var calleeStr =
      '[' +
      stackInfo.relativePath +
      ':' +
      stackInfo.line +
      ':' +
      stackInfo.pos +
      ']';
    if (typeof args[0] === 'string') {
      args[0] = calleeStr + ' ' + args[0];
    } else {
      args.unshift(calleeStr);
    }
  }
  return args;
}
/**
 * Parses and returns info about the call stack at the given index.
 */
function getStackInfo(stackIndex) {
  // get call stack, and analyze it
  // get all file, method, and line numbers
  var stacklist = new Error().stack.split('\n').slice(3);
  // stack trace format:
  // http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
  var stackReg = /at\s+(.*)\s+\((.*):(\d*):(\d*)\)/gi;
  var stackReg2 = /at\s+()(.*):(\d*):(\d*)/gi;
  var s = stacklist[stackIndex] || stacklist[0];
  var sp = stackReg.exec(s) || stackReg2.exec(s);
  sp[2] = sp[2].slice(6);
  if (sp && sp.length === 5) {
    return {
      method: sp[1],
      relativePath: path.relative(ROOT, sp[2]),
      line: sp[3],
      pos: sp[4],
      file: path.basename(sp[2]),
      stack: stacklist.join('\n'),
    };
  }
}

const info = function () {
  logger.info.apply(logger, formatLogArguments(arguments));
};
const warn = function () {
  logger.warn.apply(logger, formatLogArguments(arguments));
};
const error = function () {
  logger.error.apply(logger, formatLogArguments(arguments));
};

const log = {
  info,
  warn,
  error,
};

export { logger, log };
