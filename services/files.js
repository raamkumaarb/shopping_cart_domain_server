import tmp from 'tmp'
import Promise from 'bluebird'
import log from './log'
import fs from 'fs'
import lineReader from 'line-reader'

const export_path = './tmp/tumblr_exports/'

export default class Files {
  constructor() {
  }

  init = async (prefix, ext) => {
    await this._makeDir(`${export_path}`)
    return await this._generateFilename(prefix, ext)
  }

  _generateFilename = (prefix, ext) => {
    return new Promise(async (resolve, reject) => {
      tmp.tmpName({ mode: 644, prefix: `${prefix}-`, postfix: `.${ext}`, dir: `${export_path}` }, (err, path) => {
        if (err) reject(err)
        log.debug('File: ', path)
        let name = path.replace(/^.*[\\\/]/, '')
        log.debug('name: ', name)
        resolve(path)
      })
    })
  }

  _makeDir = (path) => {
    return new Promise((resolve, reject) => {
      fs.mkdir(path, 750, function(err) {
        if (err) {
          if (err.code == 'EEXIST') resolve(null) // ignore the error if the folder already exists
          else reject(err) // something else went wrong
        } else resolve(null) // successfully created folder
      })
    })
  }

  static readFile = (inputFile) => {
    return new Promise((resolve, reject) => {
      let lines = []
      lineReader.eachLine(inputFile, function(line, last) {
        lines.push(line)
        if (last) {
          resolve(lines)
          return false
        }
      })
    })
  }

  static exists = (filename) => {
    return new Promise((resolve, reject) => {
      var filepath;
      if(filename!='serverLog'){
         filepath = `${process.env.CSV_EXPORT_PATH}/${filename}`
      }
      else{
         filepath = `${process.env.SERVER_LOG_PATH}`
      }
      fs.stat(filepath, function(err) {
        if(err == null) {
          resolve(filepath)
        } else if(err.code == 'ENOENT') {
          resolve(false)
        } else {
          reject(err)
        }
      })
    })
  }

  static cleanup = async (filepath) => {
    return new Promise((resolve, reject) => {
      fs.unlink(filepath, (err) => {
        if(err) reject(err)
        resolve()
      })
    })
  }
}

class DirectoryNotFoundError {
  constructor() {
    this.name = 'DirectoryNotFoundError'
    this.message = 'Tmp directory not found'
    this.stack = new Error().stack
  }
}

DirectoryNotFoundError.prototype = Object.create(Error.prototype)