#!/usr/bin/env babel-node
import env from 'dotenv'
env.config({ path: '../.env' })
import { createCsvForExport  } from '../services/csv'
import log from '../services/log'
import fs from 'fs'
import File from '../services/files'
import json2csv from 'json2csv'
import mongoose from 'mongoose'
import program from 'commander'
import inquirer from 'inquirer'
import Promise from 'bluebird'

Promise.promisifyAll(mongoose)
let prompt = inquirer.createPromptModule()
mongoose.connect(process.env.MONGODB_URI)

import Domain from '../models/domain'

const mongoDbUri = process.env.MONGODB_URI
var filePath;

program
  .version('0.0.1')
  .option('-P, --production', 'Run this script against production database')  
  .option('-R, --remove', 'Remove accounts')
  .option('-f, --fileName [name]', 'Allow user to add file path [name]')
  .parse(process.argv)

let productionFlag = false

run()

async function run() {
  try {
    filePath = program.fileName
    console.log('set filepath to: ', filePath)
    if(program.production) {
      productionFlag = await runProduction()
    }
    if(program.remove) await runremoveDomains()    
    process.exit()
  } catch(error) {
    console.log('Error removing domains: ', error.message)
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

async function runremoveDomains() {
  return new Promise((resolve, reject) => {
    if(mongoDbUri.includes('sesprout') && !productionFlag) {
      log.info('You are running against a production db, not good, closing...')
      process.exit()
    }
    inquirer.prompt([
    {
      type: 'confirm',
      message:'Running Remove Items Script. This will compare domains from text file with DB and remove all available domains from DB. Continue?',
      default: false,
      name: 'answer'
    }
    ]).then(async function (answers) {
      if(answers.answer) {
        log.info('calling readFile')
        try {
          let allDomains = await File.readFile(filePath)
          await Promise.map(allDomains, domain => {
            return Domain.findOne({ url: domain, status:'available' }).remove()
          }, {concurrency: 100})      
          console.log('success - All available domains removed from DB')
          resolve(true)
        } catch(e) {
          console.log('ERROR: ', e)
        }
      }
    })
  })
}

