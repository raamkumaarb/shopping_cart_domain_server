import Promise from 'bluebird'
import log from 'winston'
import whois from 'node-whois'
import Domain from '../models/domain'

export async function whoischecker() {
  return new Promise(async (resolve, reject) => {
    try {
      let availableDomains = await Domain.find({'status': 'available', 'domain_type': 'pbn'})
      if(availableDomains==0) {
        log.warn('No available domains. Ending...')
        resolve(false)
        return
      }
      else{
        log.info(`Checking ${availableDomains.length} domains...`)
        await Promise.map(availableDomains, domain => {
         whois.lookup(domain.url, function(err, data) {
                    if ( !data.includes("No match for domain \""+ domain.url.toUpperCase()+"\"") ){
                      Domain.findOne({ url : domain.url }).remove().exec();
                      log.info('Removed URL :' + domain.url)
                    }
                    else{
                      Domain.findOneAndUpdate({url: domain.url}, {last_date_whoischeck: Date.now()}).exec();
                      log.info('Time Updated URL :' + domain.url)
                    }          
                }) 
         return
      }, {concurrency: 100})
      log.info('success')
      resolve(true)
      }
      
    } catch(e) {
      log.error('Error in whoischecker: ', e)
      reject(e)
    }
  })
}