import env from 'dotenv'
env.config()
import mongoose from 'mongoose'
mongoose.Promise = global.Promise
mongoose.connect(`${process.env.MONGODB_URI}`)

import whois from 'node-whois'
import Domain from '../models/domain'
import Promise from 'bluebird'

const DELAY = 2000 //ms
const THREADS = 1

async function run() {
  var domains = await Domain.find({'status': 'available', 'domain_type': 'pbn'})
    await Promise.map(domains, domain => {
      return new Promise(async (resolve, reject) => {
        try {
          whois.lookup(domain.url, async function(err, data) {
            if(err) {
              console.log("ERROR")
            }
            if ( !data.includes("No match for domain \""+ domain.url.toUpperCase()+"\"") ){
              await Domain.findOne({ url : domain.url }).remove()
               console.log('Removed URL :' + domain.url)
              setTimeout(resolve, DELAY)
            }
            else{
              await Domain.findOneAndUpdate({url: domain.url}, {last_date_whoischeck: Date.now()})
              console.log('Time Updated URL :' + domain.url)
              setTimeout(resolve, DELAY)
            }
        })
        } catch(e) {
          reject('error: ', e)
          setTimeout(resolve(), DELAY)
        }
    })
}, {concurrency: THREADS})
    console.log('done!')
    process.exit()
  }

run()