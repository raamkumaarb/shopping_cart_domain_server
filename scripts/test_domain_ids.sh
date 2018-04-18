#!/usr/bin/env babel-node

import env from 'dotenv'
env.config({ path: '../.env' })

import log from '../services/log'
import file from '../services/files'
import mongoose from 'mongoose'
import Domain from '../models/domain'
import Promise from 'bluebird'
mongoose.Promise = Promise

mongoose.connect(process.env.MONGODB_URI)
const filename = '../data/import/domain-ids.txt'



async function run() {
  await checkIds()
  process.exit()
}
function checkIds() {
  return new Promise(async (resolve, reject) => {
    try {
      log.info('we in here')
      let lines = await file.readFile(filename)
      log.info(`loaded ${lines.length} ids from text file.`)
      let domains = await Promise.map(lines, async id => {
        let domain = await Domain.findById(id)
        if(domain) {
          log.info('found domain for ', id)
          return Promise.resolve(true)
        }
        if(!domain) {
          let newDomain = 
          log.warn(`we could not find ${id} in the db!!!`)
          return Promise.resolve(false)
        }
      }, {concurrency: 50})

      log.info(`${domains.length} checked.`)
    } catch(er) {
      log.info('motha fuckin error')
      reject(er)
    }
  })
}


run()