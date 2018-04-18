#!/usr/bin/env babel-node
import env from 'dotenv'
env.config({ path: '../.env' })
import User from '../models/user'
import Domain from '../models/domain'
import Promo from '../models/promo'
import Order from '../models/order'
import log from '../services/log'
import mongoose from 'mongoose'
import Promise from 'bluebird'
import program from 'commander'
import inquirer from 'inquirer'

Promise.promisifyAll(mongoose)
const mongoDbUri = process.env.MONGODB_URI
mongoose.connect(mongoDbUri)
program
  .version('0.0.1')
  .option('-P, --production', 'Run this script against production database')
  .option('--wipe [collection]', 'Wipe only a certain collection')
  .option('-wa, --wipeAll', 'Wipe everything! Scary stuff...')
  .parse(process.argv)

program
  .command('')
let productionFlag = false

async function run() {
  log.info('DB: ', mongoDbUri)
  try {
    if(program.production) {
      productionFlag = await runProduction()
    }
    if(program.wipe) {
      await runPartialWipe(program.wipe)
    } else if(program.wipeAll) {
      await runCompleteWipe()
    }
    process.exit()
  } catch(error) {
    log.error('Error importing domains: ', error.message)
    process.exit()
  }
}

async function runCompleteWipe() {
  return new Promise((resolve, reject) => {
    try {
      if(mongoDbUri.includes('sesprout') && !productionFlag) {
      log.info('You are running against a production db, not good, closing...')
      process.exit()
    }
    inquirer.prompt([
      {
        type: 'confirm',
        message:'Running a complete db wipe. There is no going back. Continue?',
        default: false,
        name: 'answer'
      }
      ]).then(async function (answers) {
        if(answers.answer) {
          await _runWipe()
          log.info('Complete wipe completed!')
          resolve()
        }
        resolve()
      })
    } catch(e) {
      log.error(e)
    }
  })
}

async function runPartialWipe(collection) {
  return new Promise(async (resolve, reject) => {
    try {
      if(mongoDbUri.includes('sesprout') && !productionFlag) {
      log.info('You are running against a production db, not good, closing...')
      process.exit()
    }
    inquirer.prompt([
      {
        type: 'confirm',
        message:'Deleting collection ' + collection + '. There is no going back. Continue?',
        default: false,
        name: 'answer'
      }
      ]).then(async function (answers) {
        log.info('answers: ', answers)
        if(answers.answer) {
          await _partialWipe(collection)
          log.info('Partial wipe completed!')
          resolve()
        }
        resolve()
      })
    } catch(e) {
      log.error(e)
    }
  })
}

function _partialWipe(collection) {
  return new Promise(async (resolve, reject) => {
    names = await mongoose.connection.db.listCollections().toArray()
    names.forEach(function(e) {
      if(e.name === collection)
        mongoose.connection.db.dropCollection(e.name);
    })
  })
}
function _runWipe() {
  return new Promise(async (resolve, reject) => {
    let queries = []
    queries.push(User.remove({}), Domain.remove({}), Promo.remove({}),
      Order.remove({}))
    await Promise.all(queries)
  })
}
function runProduction() {
  return new Promise(async (resolve, reject) => {
    log.info('run Production')
    inquirer.prompt([
    {
      type: 'confirm',
      message:'Running against production! Are you sure you want to continue?',
      default: false,
      name: 'answer'
    }
    ]).then(function (answers) {
      if(!answers.answer) {
        log.info('Good choice...exiting')
        process.exit()
      }
      inquirer.prompt([
      {
        type: 'input',
        message:'Please type out \'sesprout\' to confirm.',
        default: false,
        name: 'answer'
      }
      ]).then(function (answers) {
        if(answers.answer !== 'sesprout') {
          log.info('Wrong answer. Closing...')
        } else {
          log.warn('You are in production mode.')
          resolve(true)
        }
      })
    })
  })
}

run()