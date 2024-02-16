import winston from 'winston';
import fs from 'fs';

const { combine, timestamp, label, printf, colorize } = winston.format;

const myFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level}: ${message}`;
});

const logger = new winston.createLogger({
  level: 'info',
  format: combine(timestamp(), myFormat),
  defaultMeta: { service: 'user-service' },
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), timestamp(), myFormat),
    }),
    new winston.transports.File({ filename: 'server.log' }),
  ],
  exitOnError: false,
});

fs.writeFile('server.log', '', () => {});

export { logger };
