var faker = require('faker')
import log from '../services/log'
import _ from 'lodash'
const DOMAINS = 'domains'
const USERS = 'users'
const PAYMENTS = 'payments'

class FakeObjectDataListStore {
  constructor(type, size){
    this.size = size || 2000
    this._cache = []
    this.data = []

    switch(type) {

    case DOMAINS:
      for(let i=0; i<size; i++) {
        log.info('fake data: ')
        this.data.push(this.createFakeDomainData(i))
        console.log('this.data.')
      }
      break

    case USERS:
      break

    case PAYMENTS:
      break

    default:
      break
    }
  }
  getAllData() {
    return this.data
  }

  getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min
}

  uniq(a) {
   return Array.from(new Set(a));
}

getRandomPrice(prices) {
  return prices[Math.floor(Math.random() * (prices.length - 1)) + 1]
}

  createFakeDomainData(/*number*/ index) /*object*/ {
    log.info('ok we here: ', faker.internet.domainName())
    return {
      url: faker.internet.domainName(),
      email: faker.internet.email,
      password: faker.internet.userName,
      email_password: faker.internet.userName,
      tf: this.getRandomInt(1, 30),
      cf: this.getRandomInt(1,30),
      ur: this.getRandomInt(1,25),
      category: 'gardening',
      sub_category: 'eh',
      price: _.sample(['5','10', '15', '20']),
      status: _.sample(['sold', 'available', 'processing'])
    }
  }

  getObjectAt(/*number*/ index) /*?object*/ {
    if (index < 0 || index > this.size){
      return undefined
    }
    if (this._cache[index] === undefined) {
      this._cache[index] = this.createFakeDomainData(index)
    }
    return this._cache[index]
  }

  /**
  * Populates the entire cache with data.
  * Use with Caution! Behaves slowly for large sizes
  * ex. 100,000 rows
  */
  getAll() {
    if (this._cache.length < this.size) {
      for (var i = 0; i < this.size; i++) {
        this.getObjectAt(i)
      }
    }
    return this._cache.slice()
  }

  getSize() {
    return this.size
  }
}

module.exports = FakeObjectDataListStore