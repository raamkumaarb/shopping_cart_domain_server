import env from 'dotenv'
env.config()
import mongoose from 'mongoose'
import json2csv from 'json2csv'
import fs from 'fs'
import File from '../services/files'
mongoose.Promise = global.Promise
mongoose.connect(`${process.env.MONGODB_URI}`)
import Domain from '../models/domain'

//var domains = Domain.find({'status': 'available', 'domain_type': 'pbn'})

const columns = {
  tumblr: ['url', 'tf', 'pa', 'cf', 'ur', 'majestic_ref_domains', 'ahrefs-ref_domains', 'category', 'sub_category', 'domain_type', 'status', 'email']
}

/***
  metric_name: {
    metric: price
  }
***/
const priceTable = {
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
console.log('before')
exportAllDomains()
console.log('after')

export async function exportAllDomains() {
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
      console.log('calling createCsv')  
      createCsvForExport(exportedDomains)
      console.log('success')
      resolve(true)
    }  catch(error) {
      log.warn('export All Domain error: ', error)
      reject(error)
    }
  })
}

export async function createCsvForExport(domains) {
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
      console.log('path here', path)
      let resp = await _writeCsv(newRows, columns.tumblr, path)
      resolve(resp)
    } catch(error) {
      log.warn('error in createCsv: ', error)
      reject(error)
    }
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