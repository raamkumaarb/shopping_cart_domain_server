import winston from 'winston'
const PATH = `${__dirname}/../logs/`

const log = new (winston.Logger)({
  transports: [
    new (winston.transports.File)({
      name: 'info-file',
      filename: `${PATH}/filelog-info.log`,
      level: 'info',
      prettyPrint: true
    }),
    new (winston.transports.File)({
      name: 'error-file',
      filename: `${PATH}/filelog-error.log`,
      level: 'error'
    }),
    new (winston.transports.File)({
      name: 'debug-file',
      filename: `${PATH}/filelog-debug.log`,
      level: 'debug'
    }),
    new (winston.transports.Console)({ colorize: true })
  ]
})

log.level = 'debug'

export default log