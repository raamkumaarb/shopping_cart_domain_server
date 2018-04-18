#!/usr/bin/env babel-node
import env from 'dotenv'
env.config({ path: '../.env' })
import { updateDomains, removeAvailableAccounts, updateDeletedDomains } from '../services/csv'
import log from '../services/log'
import mongoose from 'mongoose'
import program from 'commander'
import inquirer from 'inquirer'
import Promise from 'bluebird'
Promise.promisifyAll(mongoose)
let prompt = inquirer.createPromptModule()
mongoose.connect(process.env.MONGODB_URI)

let domainType
const tumblrCsv = process.env.CSV_IMPORT_PATH
const mongoDbUri = process.env.MONGODB_URI
program
  .version('0.0.1')
  .option('-P, --production', 'Run this script against production database')
  .option('-u, --update', 'Only update accounts')
  .option('-I, --insert', 'Add new accounts and update existing accuonts')
  .option('-r, --remove', 'Remove all accounts that are not purchased')
  .option('-D, --updateDeleted', 'Update deleted accounts')
  .option('-t, --domainType [type]', 'Allow user to select either tumblr or pbn type accounts while import [type]')
  .parse(process.argv)

let productionFlag = false

run()

async function run() {
  try {
    domainType = program.domainType
    if(program.production) {
      productionFlag = await runProduction()
    }
    if(program.domainType) {
      log.info('test')
    }
    if(program.update) await runUpdate()
    if(program.insert) await runInsert()
    if(program.remove) await runRemove()
    if(program.updateDeleted) await updateDeleted()
    process.exit()
  } catch(error) {
    log.error('Error importing domains: ', error.message)
    process.exit()
  }
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

async function runUpdate() {
  return new Promise((resolve, reject) => {
    if(mongoDbUri.includes('sesprout') && !productionFlag) {
      log.info('You are running against a production db, not good, closing...')
      process.exit()
    }
    inquirer.prompt([
      {
        type: 'confirm',
        message:'Running database update. This will replace account metrics. Continue?',
        default: false,
        name: 'answer'
      }
    ]).then(async function (answers) {
      if(answers.answer) {
        await updateDomains(tumblrCsv, 'update', domainType, 'nul')
        log.info('Update complete!')
        resolve()
      }
    })
  })
}

async function runInsert() {
  return new Promise((resolve, reject) => {
    if(mongoDbUri.includes('sesprout') && !productionFlag) {
      log.info('You are running against a production db, not good, closing...')
      process.exit()
    }
    inquirer.prompt([
      {
        type: 'confirm',
        message:'Running database insert. This add new accounts as well as update current metrics. Continue?',
        default: false,
        name: 'answer'
      }
    ]).then(async function (answers) {
      if(answers.answer) {
        await updateDomains(tumblrCsv, 'insert', domainType, 'nul')
        log.info('Insert complete!')
        resolve()
      }
    })
  })
}

async function runRemove() {
  return new Promise((resolve) => {
    if(mongoDbUri.includes('sesprout') && !productionFlag) {
      log.info('You are running against a production db, not good, closing...')
      process.exit()
    }
    inquirer.prompt([
      {
        type: 'confirm',
        message:'Running database remove. This will remove all accounts that are not purchased! Continue?',
        default: false,
        name: 'answer'
      }
    ]).then(async function (answers) {
      if(answers.answer) {
        await removeAvailableAccounts()
        log.info('Remove complete!')
        resolve()
      }
    })
  })
}

async function updateDeleted() {
  return new Promise((resolve) => {
    if(mongoDbUri.includes('sesprout') && !productionFlag) {
      log.info('You are running against a production db, not good, closing...')
      process.exit()
    }
    inquirer.prompt([
      {
        type: 'confirm',
        message:'Updating deleted accounts.  Continue?',
        default: false,
        name: 'answer'
      }
    ]).then(async function (answers) {
      if(answers.answer) {
        await updateDeletedDomains(tumblrCsv)
        log.info('Remove complete!')
        resolve()
      }
    })
  })
}