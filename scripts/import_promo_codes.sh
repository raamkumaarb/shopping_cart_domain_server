#!/usr/bin/env babel-node
/**
 * Usage: ./import_promo_codes.sh [--new|--assign] [txt file]
 * options:
 *   --new:     adds new promo codes
 *   --assign   assigns codes to users
 * file syntax:
 *   --new:     code:discount:note
 *               - per line. If a promo code is present, it will not create a new one
 *               - discount is the amount of $ off. percentage isn't a feature yet
 *   --assign   email:code per line.
 *
 * Examples:
 * ./import_promo_codes.sh --new ../data/import/codes/new-codes.txt
 * ./import_promo_codes.sh --assign ../data/import/codes/assign-codes.txt
 *
 */

import env from 'dotenv'
env.config({ path: '../.env.prod' })
import log from '../services/log'
import file from '../services/files'
import mongoose from 'mongoose'
import Promo from '../models/promo'
import User from '../models/user'
import Promise from 'bluebird'
mongoose.Promise = Promise

mongoose.connect(process.env.MONGODB_URI)
let args = process.argv.slice(2)
let CONCURRENCY = 20

if(args.length !== 2) {
  log.warn('Wrong number of parameters. Check the help stupid.')
  process.exit()
}

if(!file.exists(args[1])) {
  log.warn('File doesn\'t exist. Check yoself')
  process.exit()
}
switch(args[0]) {
case '--new':
  log.info('inserting new codes...')
  insertCodes(args[1]).then(() => {
    log.info('Added codes succesfully!')
    process.exit()
  }).catch(error => {
    log.error('Error inserting codes: ', error.message)
    process.exit()
  })
  break
case '--assign':
  log.info('assigning codes to users...')
  assignCodes(args[1]).then(() => {
    log.info('Assigned codes successfully!')
    process.exit()
  }).catch(error => {
    log.error('Error assigning codes: ', error.message)
    process.exit()
  })
  break
default:
  log.warn('Invalid parameters. Read comments in this file.')
  process.exit()
  break
}


async function insertCodes(filename) {
  return new Promise(async (resolve, reject) => {
    try {
      let lines = await file.readFile(filename)
      await Promise.map(lines, async line => {
        if(line.split(':').length !== 3) {
          log.warn('Cannot read line...skipping')
          return resolve()
        }
        let [code, discount, note] = line.split(':')

        let promoRow = await Promo.findOne({code: code})
        if(promoRow) {
          log.warn('Promo code already in database. Skipping...')
          return resolve()
        }
        return new Promo({code, discount, note}).save()
      }, {concurrency: CONCURRENCY})
      resolve(true)
    } catch(error) {
      reject(error.message)
    }
  })
}


async function assignCodes(filename) {
  return new Promise(async (resolve, reject) => {
    try {
      let lines = await file.readFile(filename)
      await Promise.map(lines, async (line) => {
        let bhwname = line.split(':')[0]
        let code = line.split(':')[1]
        let promoRow = await Promo.findOne({code: code})
        if(!promoRow) {
          log.warn('No promo code found: ', code)
          return
        }

        let user = await User.findOne({ bhwname })
        if(!user) {
          log.warn('No user found: ', bhwname)
          return
        }
        if(!user.promos) {
          user.promos = []
        } else {
          let isNotSet = user.promos.every(promoId => {
            if(promoRow._id.equals(promoId)) {
              log.warn('Promo: ', promoRow.code, ' already assigned to: ', user.email)
              return false
            }
            return true
          })
          if(!isNotSet) {
            return false
          }
        }
        user.promos.push(promoRow._id)
        await user.save()
        log.info('Successfully assigned ', user.email , ' to: ', promoRow.code)
      })
      resolve(true)
    } catch(error) {
      reject(error.message)
    }
  })
}

class InvalidTextFileError {
  constructor() {
    this.name = 'InvalidTextFileError'
    this.message = 'There\'s an error in the text file.'
    this.stack = new Error().stack
  }
}

class NoPromoCodeFound {
  constructor() {
    this.name = 'NoPromoCodeFound'
    this.message = 'Could not find promo code.'
    this.stack = new Error().stack
  }
}

class NoUserFoundError {
  constructor() {
    this.name = 'NoUserFoundError'
    this.message = 'Couldn\'t find a user.'
    this.stack = new Error().stack
  }
}

NoUserFoundError.prototype = Object.create(Error.prototype)
NoPromoCodeFound.prototype = Object.create(Error.prototype)
InvalidTextFileError.prototype = Object.create(Error.prototype)