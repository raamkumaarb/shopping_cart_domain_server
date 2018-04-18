#!/usr/bin/env babel-node
import env from 'dotenv'
env.config({ path: '.env' })
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

const export_path = process.env.CSV_EXPORT_PATH
const mongoDbUri = process.env.MONGODB_URI
var domainType='tumblr'

program
  .version('0.0.1')
  .option('-P, --production', 'Run this script against production database')  
  .option('-E, --export', 'Export all domains')
  .option('-t, --domainType', 'Allow user to select either tumblr or pbn type accounts while export')
  .parse(process.argv)

let productionFlag = false
if (process.argv[3] == '-t' && typeof process.argv[4] != 'undefined'){
  domainType=process.argv[4]
}

run()

async function run() {
  try {
    if(program.production) {
      productionFlag = await runProduction()
    }
    if(program.export) await runexportAllDomains()    
    process.exit()
  } catch(error) {
    console.log('Error exporting domains: ', error.message)
    process.exit()
  }
}

async function runexportAllDomains() {
            
   return new Promise((resolve, reject) => {
    if(mongoDbUri.includes('sesprout') && !productionFlag) {
      log.info('You are running against a production db, not good, closing...')
      process.exit()
    }
    inquirer.prompt([
      {
        type: 'confirm',
        message:'Running Domains Export. This will generate a csv file in tmp/tumblr_exports folder. Continue?',
        default: false,
        name: 'answer'
      }
    ]).then(async function (answers) {
      if(answers.answer) {      
      let exportedDomains  = await Domain.aggregate([
        {
          $match: { "domain_type": { "$eq": domainType } }
        },
        { 
            $lookup: 
            {
              from : "users",
              localField : "_id",
              foreignField : "domains",
              as: "userData"  
            }            
        }
      ])
      log.info('calling createCsv')
      await createCsvForExport(exportedDomains, domainType)
      console.log('success')
      resolve(true)
      }
    })
  })
}

