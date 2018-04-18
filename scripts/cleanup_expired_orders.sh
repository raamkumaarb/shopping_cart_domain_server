#!/usr/bin/env babel-node
/**
 * This is supposed to be run as a cronjob. Deletes 'created' orders more than 3 hours old.
 */
import env from 'dotenv'
env.config({ path: '../.env' })

import log from '../services/log'
import file from '../services/files'
import mongoose from 'mongoose'
import Promo from '../models/promo'
import User from '../models/user'
// import program from 'commander'
import Promise from 'bluebird'
Promise.promisifyAll(mongoose)

mongoose.connect(process.env.MONGODB_URI)
let EXPIRE_TIME = 1 // minutes

import Order from '../models/order'


run()

function cleanupOrders() {
  return new Promise(async (resolve, reject) => {
    try {
      let orders = await Order.find({created_time: {$lt: new Date((new Date())-1000*60*EXPIRE_TIME)}, state: 'created'}).remove()
      log.info(orders.result.ok, ' orders removed.')
      resolve(orders)
    } catch(e) {
      log.error('error: ', e)
      reject(e)
    }
  })
}

function numberExpiredOrders() {
  return new Promise(async (resolve, reject) => {
    try {
      let orders = await Order.find({created_time: {$lt: new Date((new Date())-1000*60*EXPIRE_TIME)}, state: 'created'}).count()
      log.info('Orders expired: ', orders)
      resolve(orders)
    } catch(e) {
      log.error(e)
      reject(e)
    }
  })
}

async function run() {
  let expired = await numberExpiredOrders
  if(expired) {
    await cleanupOrders()
    log.info('Orders clean...')
    process.exit()
  } else {
    log.info('No expired orders to remove.')
  }
}