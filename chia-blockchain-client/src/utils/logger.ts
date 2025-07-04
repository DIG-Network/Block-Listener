import * as winston from 'winston';

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
  trace: 'magenta'
};

winston.addColors(logColors);

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

export class Logger {
  private winston: winston.Logger;

  constructor(label: string) {
    this.winston = winston.createLogger({
      levels: logLevels,
      level: process.env.LOG_LEVEL || 'info',
      format: logFormat,
      defaultMeta: { service: 'chia-client', label },
      transports: [
        new winston.transports.Console({
          format: consoleFormat
        })
      ]
    });

    // Add file transport in production
    if (process.env.NODE_ENV === 'production') {
      this.winston.add(
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error'
        })
      );
      this.winston.add(
        new winston.transports.File({
          filename: 'logs/combined.log'
        })
      );
    }
  }

  error(message: string, meta?: any): void {
    this.winston.error(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.winston.warn(message, meta);
  }

  info(message: string, meta?: any): void {
    this.winston.info(message, meta);
  }

  debug(message: string, meta?: any): void {
    this.winston.debug(message, meta);
  }

  trace(message: string, meta?: any): void {
    this.winston.log('trace', message, meta);
  }

  // Helper for logging with context
  withContext(context: Record<string, any>): Logger {
    const childLogger = Object.create(this);
    childLogger.winston = this.winston.child(context);
    return childLogger;
  }

  // Performance logging
  startTimer(): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.debug(`Operation completed in ${duration}ms`);
    };
  }
}

// Factory function for creating loggers
export function createLogger(label: string): Logger {
  return new Logger(label);
}

// Default logger instance
export const logger = createLogger('main');