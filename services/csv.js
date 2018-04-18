import { Converter } from 'csvtojson'
import json2csv from 'json2csv'
import fs from 'fs'
import log from 'winston'
import Promise from 'bluebird'
import _ from 'lodash'
import Domain from '../models/domain'
import File from './files'

const columns = {
  tumblr: [ 'domain_type', 'url', 'username', 'email', 'password', 'tf', 'pa', 'cf', 'ur', 'majestic_ref_domains', 'category', 'sub_category'],
  pbn: ['domain_type', 'url', 'email', 'tf', 'pa', 'cf', 'ur', 'majestic_ref_domains', 'category', 'sub_category'],
  stats: ['price', 'occurs', 'stock_percent', 'revenue_percent', 'total_revenue']
}

const exportColumns = {
  tumblrPbn: ['url', 'username', 'password', 'tf', 'pa', 'cf', 'ur', 'majestic_ref_domains', 'ahrefs-ref_domains', 'category', 'sub_category', 'domain_type', 'status', 'email', 'bhwname']
}

/***
  metric_name: {
    metric: price
  }
***/
const pbnPriceTable={
  pbnPrice:10
}

const tumblrpriceTable = {
  tumblr : {
    tf: {
      1: 1,
      2: 1,
      3: 1,
      4: 2,
      5: 2,
      6: 2,
      7: 3,
      8: 3,
      9: 3,
      10: 4,
      11: 4,
      12: 4,
      13: 5,
      14: 6,
      15: 7,
      16: 8,
      17: 10,
      18: 11,
      19: 12,
      20: 13,
      21: 14,
      22: 15,
      23: 16,
      24: 17,
      25: 18,
      26: 20,
      27: 22,
      28: 24,
      29: 26,
      30: 28
    },
    ur: {
      10: 1,
      11: 2,
      12: 3,
      13: 4,
      14: 5,
      15: 6,
      16: 7,
      17: 8,
      18: 9,
      19: 10,
      20: 11,
      21: 12,
      22: 13,
      23: 13,
      24: 14,
      25: 14,
      26: 15,
      27: 15,
      28: 16,
      29: 16,
      30: 17,
      31: 17,
      32: 18,
      33: 18,
      34: 19,
      36: 19,
      37: 20,
      38: 21,
      39: 22,
      40: 23
    }
  }
}

export function updateDomains(file, action, domainType, actionType) {
  return new Promise(async (resolve, reject) => {
    log.info('domainType csv: ', domainType)
    try {
      if(action == 'update' || action == 'insert')
      {
      let rows = await _readCsv(file)
      log.info('Number of rows to be processed: ', rows.length)
      let formattedRows = rows.map(row => {
        let newRow = {...row}
        let category = row.category.split('/')[0] ? row.category.split('/')[0] : 'Uncategorized'
        let sub_category = row.category.split('/')[1] ? row.category.split('/')[1] : 'Uncategorized'
        newRow.category = category
        newRow.sub_category = sub_category
        if(domainType === 'tumblr')
          newRow.price = _getPriceForTumblr(row)
        if(domainType === 'pbn'){
          newRow.price = _getPriceForPbn()
          newRow.last_date_whoischeck = Date.now()
        }
        newRow.status = 'available'
        newRow.domain_type  = domainType
        newRow.pa = row.pa ? row.pa : 1
        newRow = _removeUselessDomains(newRow)
        return newRow
      })
      // filter out removed rows
      let numOfUpdates = 0
      let numOfInserts = 0
      formattedRows = formattedRows.filter(row => row)
      if(actionType === 'deletewrite'){
            await Domain.update({url: {$ne: 0}},{$set: {domain_state: 'inactive'}},{multi: true})
      }
      await Promise.map(formattedRows, async row => {
        if(action === 'update') {
          let dom = await Domain.findOne({url: row.url})
          if(!dom)
            return Promise.resolve()
          row.status = dom.status
          numOfUpdates++
          return Domain.findOneAndUpdate({url: row.url}, {$set: row})
        }
        else if(action === 'insert') {
          let dom = await Domain.findOne({url: row.url})
          log.info('Inserting: ', row.url)
          if(!dom) {
            row.status = 'available'
            row.domain_state = 'active'
            numOfInserts++
            return Domain.update({url: row.url}, {$setOnInsert: row}, {upsert: true})
          }
          else{
            return Domain.findOneAndUpdate({url: row.url}, {ur: row.ur, pa: row.pa, cf: row.cf, tf: row.tf, price: row.price, domain_state: 'active'})
          }

          return Promise.resolve()
        }
      }, {concurrency: 20})

      if(actionType === 'deletewrite'){
            await Domain.remove({ domain_state: 'inactive' })
            log.info('Deleted all invalid domains')
      }

      if(action === 'insert')
        log.info(`${numOfInserts} accounts inserted successfully!`)
      else if(action === 'update')
        log.info(`${numOfUpdates} accounts updated successfully!`)
      let statsArray = _.map(formattedRows, 'price')
      let revenue = _.reduce(statsArray, function(s, entry) {
        return s + parseFloat(entry)
      }, 0)
      let inventory = statsArray.length
      log.info('total revenue: ', revenue)
      let statsRows = _.countBy(statsArray, Math.floor)
      let statsArr = []
      let path = `${process.env.CSV_STORE_STAT_PATH}`
      _.forEach(statsRows, (value, key)=> {
        let newObj = {}
        let totalPrice = key * value
        newObj.price = '$' + key
        newObj.occurs = value
        newObj.revenue_percent = '%' + Math.round((totalPrice / revenue) * 100)
        newObj.stock_percent= '%' + Math.round((value / inventory) * 100)
        newObj.total_revenue = '$' + totalPrice
        statsArr.push(newObj)
      })

      await _writeCsv(statsArr, columns.stats, path)
      let stream = fs.createWriteStream(path, {'flags': 'a'})
      stream.once('open', () => {
        stream.write('\n\n\n')
        for(let i=0; i<columns.stats.length-2; i++) {
          stream.write('"",')
        }
        stream.write('"Total Inventory",')
        stream.write(`"${inventory}"`)
        stream.write('\n')
        for(let i=0; i<columns.stats.length-2; i++) {
          stream.write('"",')
        }
        stream.write('"Total Revenue",')
        stream.write(`"$${revenue}"`)
        log.info('done! you can close this now.')
        stream.end()
        stream.close()
        resolve(true)
        return
      })

      stream.on('close', () => {
        resolve(true)
      })
    }
  } catch(error) {
      reject(error)
    }
  })
}

export function updateDeletedDomains(file) {
  return new Promise(async (resolve, reject) => {
    try {
      let rows = await _readCsv(file)
      log.info('rows.length: ', rows.length)
      let urls = rows.map(row => row.url)
      log.info('128')
      let domains = await Domain.find({})
      log.info('130')
      log.info(`Domain count: ${domains.length}`)
      log.info(`Spreadsheet count: ${urls.length}`)
      let domainsToRemove = []
      domains.map(async domain => {
        if(!urls.includes(domain.url) && domain.status === 'available') {
          log.info(`domain ${domain} not found. deleting...`)
          domainsToRemove.push(domain)
        }
      })
      await Promise.map(domainsToRemove, async domain => {
        let removeMe = await Domain.findOne({'url': domain.url})
        return removeMe.remove()
      }, { concurrency: 20 })

      let newDomains = await Domain.find({})
      log.info(`New domain count: ${newDomains.length}`)
      resolve()
    } catch(error) {
      reject(error)
    }
  })
}

export async function removeAvailableAccounts() {
  return new Promise(async (resolve, reject) => {
    try {
      let availableDomains = await Domain.find({status: 'available'})
      if(!availableDomains) {
        log.warn('No available domains. Ending...')
        resolve(false)
        return
      }
      log.info(`Removing ${availableDomains.length} domains...`)
      await Promise.map(availableDomains, domain => {
        return domain.remove({})
      }, {concurrency: 100})
      log.info('success')
      resolve(true)
    } catch(e) {
      log.error('Error in removeIdleAccounts: ', e)
      reject(e)
    }
  })
}

export async function createCsv(domains, email, domain_type) {
  return new Promise(async (resolve, reject) => {
    try {
      var domainType = domain_type=='tumblr'? domain_type:'expiredDomains'
      domains = domains.filter(domain => domain)
      let newRows = domains.map(domain => {
        if(!domain)
          return false
        let exportDomainObj = {}
        if(domainType =='tumblr')
        {
          columns.tumblr.map(column => {
            return exportDomainObj[column] = domain[column]=='tumblr'? 'Tumblr': domain[column]
          })

        }
        else{
          columns.pbn.map(column => {
            return exportDomainObj[column] = domain[column]=='pbn'? 'Expired Domain': domain[column]
          })
        }

        return exportDomainObj
      })
      let file = new File()
      let path = await file.init(email+'-'+domainType, 'csv')
      let resp
      if(domainType=='tumblr'){
         resp = await _writeCsv(newRows, columns.tumblr, path)
      }
      else{
         resp = await _writeCsv(newRows, columns.pbn, path)
      }
      resolve(resp)
    } catch(error) {
      log.warn('error in createCsv: ', error)
      reject(error)
    }
  })
}

function _readCsv(file) {
  return new Promise((resolve, reject) => {
    let rows = []
    let rs = fs.createReadStream(file)
    let csvConverter = new Converter({
      workerNum: 10,
      flatKeys: true
    })
    rs.pipe(csvConverter)
    csvConverter.on('record_parsed', (resultRow) => {
      rows.push(resultRow)
    })
    csvConverter.on('end_parsed', () => {
      if(rows.length < 1) reject('No data in csv.')
      resolve(rows)
    })
  })
}

function _writeCsv(data, columns, path) {
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

export async function createCsvForExport(domains, domainType) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log(0)
      domains = domains.filter(domain => domain)
      let newRows = domains.map(domain => {
        if(!domain)
          return false
        log.info(domains)
        let exportDomainObj = {}
        domain.email = domain.userData.length > 0 ? domain.userData[0].email : undefined
        domain.bhwname = domain.userData.length > 0 ? domain.userData[0].bhwname : undefined
        exportColumns.tumblrPbn.map(column => {
          return exportDomainObj[column] = domain[column]
        })
        return exportDomainObj
      })
      let file = new File()
      let path = await file.init('export_'+domainType+'_Domains', 'csv')
      let resp = await _writeExportCsv(newRows, columns.tumblrPbn, path)
      resolve(resp)
    } catch(error) {
      log.info('error',error)
      log.warn('error in createCsv: ', error)
      reject(error)
    }
  })
}

async function _writeExportCsv(data, columns, path) {
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

function _getPriceForTumblr(account) {
  let price = 1
  _.each(tumblrpriceTable.tumblr, (metricNameVal, metricName) => {
    _.each(metricNameVal, (metricPrice, metricValue) => {

      // if row metric >= tumblrpriceTable metric value
      if(account[metricName] >= metricValue) {
        if(price < metricPrice) {
          price = metricPrice
        }
      }
    })
  })
  return price
}

function _getPriceForPbn() {
  let price=pbnPriceTable.pbnPrice
  return price
}

function _removeUselessDomains(domain) {
  if(domain.price === 1 && domain.cf <= 1 && domain.tf <= 1 && domain.ur <= 1)
    return null
  else
    return domain
}