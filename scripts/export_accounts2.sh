#!/usr/bin/env babel-node
import env from 'dotenv'
env.config({ path: '../.env' })
import mongoose from 'mongoose'
import program from 'commander'
import inquirer from 'inquirer'
import Promise from 'bluebird'
import json2csv from 'json2csv'
import fs from 'fs'
import File from '../services/files'

Promise.promisifyAll(mongoose)
let prompt = inquirer.createPromptModule()
mongoose.connect(process.env.MONGODB_URI)

import Domain from '../models/domain'

const tumblrCsv = process.env.CSV_EXPORT_PATH
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
    log.error('Error exporting domains: ', error.message)
    process.exit()
  }
}

const columns = {
  tumblr: ['url', 'tf', 'pa', 'cf', 'ur', 'majestic_ref_domains', 'ahrefs-ref_domains', 'category', 'sub_category', 'domain_type', 'status', 'email']
}

log.info('before')

async function runexportAllDomains() {
   return new Promise(async (resolve, reject) => {
    try {
      console.log('Inside exportAllDomains')      
      var exportedDomains  = await Domain.aggregate([
        {
          $match: { "domain_type": { "$eq": 'pbn' } }
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
      runcreateCsvForExport(exportedDomains)
      console.log('success')
      resolve(true)
    }  catch(error) {
      log.warn('export All Domain error: ', error)
      reject(error)
    }
  })
}

async function runcreateCsvForExport(domains) {
  return new Promise(async (resolve, reject) => {
    try {
      domains = domains.filter(domain => domain)
      let newRows = domains.map(domain => {
        if(!domain)
          return false

        let exportDomainObj = {}
        domain.email = domain.userData.length > 0 ? domain.userData[0].email : undefined
        columns.tumblr.map(column => {
          return exportDomainObj[column] = domain[column]
        })
        return exportDomainObj
      })
      let file = new File()
      let path = await file.init('exportAccounts', 'csv')
      let resp = await _writeCsv(newRows, columns.tumblr, path)
      resolve(resp)
    } catch(error) {
      log.warn('error in createCsv: ', error)
      reject(error)
    }
  })
}

async function _writeCsv(data, columns, path) {
  return new Promise((resolve, reject) => {
    json2csv({ data, fields: columns }, function(err, csv) {
      if (err) reject(err)
      fs.writeFile(path, csv, function(err) {
        if (err)
          reject(err)
        else
          resolve(path)

      })
    })
  })
}