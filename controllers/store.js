import User from '../models/user'
import Domain from '../models/domain'
import log from '../services/log'
import Order from '../models/order'
import Credit from '../models/credit'
import Statistic from '../models/statistic'
import fakeData from '../utils/fakeObjectData'
import Promo from '../models/promo'
import passport from 'koa-passport'
import uuid from 'node-uuid'
import Promise from 'bluebird'
import paypal from '../services/paypal'
import whois from 'node-whois'
import * as mail from '../services/mailer'

Promise.promisifyAll(paypal)

const storeColumns = ['_id', 'tf', 'cf', 'ur', 'pa', 'da', 'majestic_ref_domains', 'ahrefs_ref_domains', 'sub_category', 'category', 'price', 'domain_type', 'last_date_whoischeck']

const DELAY = 2000 //ms
const THREADS = 1

export async function refillStore(ctx, next) {
  try {
    log.info('refilling store with fake data')
    let data = new fakeData('domains', 2000)
    let dataList = data.getAllData()
    let listOfDomains = []
    await Domain.remove({})
    dataList.forEach(chunk => {
      listOfDomains.push(chunk)
    })
    await Domain.collection.insert(dataList)
    ctx.status = 200
  } catch(err) {
    ctx.status = 500
    ctx.body = {error: err}
  }
  await next()
}

export async function fetchDomainData(ctx, next) {
  try {
    var domainType=ctx.params.domainType
    var filter;

    if(domainType!='all'){
      filter={'status': 'available', 'domain_type': domainType}
    }
    else{
      filter={'status': 'available'}
    }
    let domains = await Domain.find(filter, storeColumns.join(' '))
    let domainsAll = await Domain.find({})
    log.info(`# of available domains: ${domains.length}`)
    log.info('Total domains: ' + domainsAll.length)
    ctx.body = {message: domains}
    await next()
  } catch(err) {
    ctx.status = 500
    ctx.body = {error: err.message}
  }
}

export async function getAllDomains(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
    try {
      var mode=ctx.request.body.mode
      var row=ctx.request.body.row
      log.info('Inside getAllDomains')
      log.info('user email: ', user.email)
      if(user.type !== 'admin')
        throw new UserNotAdminError
      if(mode=='edit'){
          await Domain.findOneAndUpdate({url: row.url}, {$set: row})
          log.info('message:Data Updated Successfully')
      }
      if(mode=='delete'){
          let domains = await Promise.map(row, async domain_id => {
          let domain = await Domain.findById(domain_id.toString()).remove()
          return Promise.resolve(true)
        }, { concurrency: 10 })
        log.info('message:Data Deleted Successfully')
      }
      let domains = await Domain.find({})
      let users = await User.find({})
        domains = await Promise.map(domains, async domain => {
          domain.email=''
        if(domain.status == 'sold'){
          users = await Promise.map(users, async user => {
            if(user.domains.indexOf(domain._id) != -1)
                domain.email=user.email
               return Promise.resolve(true)
          }, { concurrency: 10 })
        }
          return Promise.resolve(domains)
        }, { concurrency: 10 })
      log.info('Total domains: ' + domains.length)
      ctx.body = {domains}
      ctx.status = 200
    }  catch(error) {
      log.warn('admin error: ', error)
      ctx.status = 422
      ctx.body = { error }
      await next
    }
  })(ctx, next)
}

export async function processCredit(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
    try {
      const email = user.email
      log.info('processCredit | User: ', user.email)
      log.info('processCredit | creditAmount: ', ctx.request.body)
      let creditAmount = ctx.request.body.creditAmount
      const credit_id = uuid.v4()
      // Generate paypal url and payment id (?)
      // Insert new payment row into Credit with status PROCESSING
      // Redirect user to paypal url
      // Wait for paypal callback
      // WAIT FOR PAYPAL
      let paypalPayment = {
        'intent': 'sale',
        'payer': {
          'payment_method': 'paypal'
        },
        'redirect_urls': {},
        'transactions': [{
          'amount': {
            'currency': 'USD'
          }
        }]
      }

      //paypal stuff
      paypalPayment.transactions[0].amount.total = creditAmount
      paypalPayment.redirect_urls.return_url = `${process.env.CLIENT_PROTOCOL}${process.env.CLIENT_HOST}/credit/execute?credit_id=${credit_id}`
      paypalPayment.redirect_urls.cancel_url =`${process.env.CLIENT_PROTOCOL}${process.env.CLIENT_HOST}/credit/cancel?credit_id=${credit_id}`
      paypalPayment.transactions[0].description = ''

      //paypal create
      let paypalResponse = await _createPaypal(paypalPayment)

      //create database object
      if (!paypalResponse) {
        throw new PaypalResponseError
      }
      let credit = {}

      credit.created_time = new Date()
      credit.state = paypalResponse.state
      credit.payment_id = paypalResponse.id
      const user_id = user._id
      credit.amount = creditAmount
      credit.description = ''
      credit.user_id = user_id
      credit.credit_id = credit_id
      const dbCredit = new Credit(credit)
      await dbCredit.save()


      let link = paypalResponse.links
      let approve_link = ''
      for (let i = 0; i < link.length; i++) {
        if (link[i].rel === 'approval_url') {
          approve_link = link[i].href
        }
      }
      log.info('approve_link', approve_link)
      // ctx.status = 200
      // status is to tell client to redirect to executeCredit
      ctx.body = {redirect: approve_link, res: paypalResponse}
      await next()

      // await next
    } catch(err) {
      log.warn('error message: ', err)
      ctx.body = {error: err.message}
      ctx.status = 422
      return await next()
    }
  })(ctx, next)
}

export async function processOrder(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
    try {
      log.info('processOrder | User: ', user.email)
      let cart = ctx.request.body.cart
      const order_id = uuid.v4()
      let domains = await Promise.map(cart, item_id => {
        return Domain.findById(item_id)
      }, { concurrency: 10 })
      await _checkDomains(domains, order_id)
      log.info('processOrder | domains.length: ', domains.length)
      let promo = null
      let promo_discount = 0
      if(ctx.request.body.promo_id) {
        promo = await Promo.findById(ctx.request.body.promo_id)
        if(promo)
          promo_discount = promo.discount
      }

      // free order flag to bypass paypal
      let totalCost = _calculateTotalCost(domains, promo_discount)
      log.info('processOrder | promo_discount: ', promo_discount)
      log.info('processOrder | totalCost: ', totalCost)
      if(totalCost === 0) {
        if(!promo) {
          promo = false
        }

        // Time to update all the collections! These functions are called in executeOrder but since we are bypassing it we call them here
        let order = _createOrderObject(order_id, domains, user, promo, totalCost)
        await order.save()

        //we'll use jsonDomains to return to the client for receipt display
        let jsonDomains = await _updateDomainsAndGetJSONAfterPurchase(domains, true)
        await _updateDomainsToSold(domains, user)
        await _updateUserAfterPurchase(user, domains)
        await _updatePromoCodeAfterPurchase(user, order.promo_id)
        await _sendProcessOrderEmail(user.email)
        let body = _createReceiptResponse(jsonDomains, totalCost, promo)

        // Go to receipt
        body.redirect = `${process.env.CLIENT_PROTOCOL}${process.env.CLIENT_HOST}/order/receipt`
        body.status = 'Complete' // the client checks for this string
        // We need to tell the client to redirect to receipt instead of execute
        ctx.body = body
        return await next()
      }

      log.info('user credit', user.credit)
      let body={}
      if(user.credit >= totalCost){
        //User have enough credit. Process domain checkout
        if(!promo) {
          promo = false
        }

        // Time to update all the collections! These functions are called in executeOrder but since we are bypassing it we call them here
        let order = _createOrderObject(order_id, domains, user, promo, totalCost)
        await order.save()

        //we'll use jsonDomains to return to the client for receipt display
        let jsonDomains = await _updateDomainsAndGetJSONAfterPurchase(domains, true)
        await _updateDomainsToSold(domains, user)
        await _updateUserAfterPurchase(user, domains)
        await _updatePromoCodeAfterPurchase(user, order.promo_id)
        let body = _createReceiptResponse(jsonDomains, totalCost, promo)

        //update user credit after purchase
        let myAmount = parseInt(user.credit)-parseInt(totalCost)
        await _updateUserCreditAfterPayment(user, myAmount)

        // Go to receipt
        body.redirect = `${process.env.CLIENT_PROTOCOL}${process.env.CLIENT_HOST}/order/receipt`
        body.status = 'Complete' // the client checks for this string
        // We need to tell the client to redirect to receipt instead of execute
        ctx.body = body
        return await next()

      }
      else{
        //User not have enough credit. Redirect user to myaccounts to update his credit
        body.status = 'Failed'
        ctx.body = body
        return await next()
      }
      await next()
    } catch(err) {
      log.warn('error message: ', err)
      ctx.body = {error: err.message}
      ctx.status = 422
      return await next()
    }
  })(ctx, next)
}

export async function executeCredit(ctx, next) {

    // On paypal callback:
    // - Update Credit status to 'COMPLETE'
  const unverifiedCap = process.env.STORE_UNVERIFIED_CAP ? process.env.STORE_UNVERIFIED_CAP : 0
  const verifiedCap = process.env.STORE_VERIFIED_CAP ? process.env.STORE_VERIFIED_CAP : 500

  const unverifiedOrderCap = process.env.STORE_UNVERIFIED_ORDER_CAP ? process.env.STORE_UNVERIFIED_ORDER_CAP : 0
  const verifiedOrderCap = process.env.STORE_VERIFIED_ORDER_CAP ? process.env.STORE_VERIFIED_ORDER_CAP : 500

  log.info('executing credit...')
  try {
    //update credit table
    const credit_id = ctx.request.body.data.credit_id
    const payment_id = ctx.request.body.data.paymentId
    const payer_id = ctx.request.body.data.PayerID
    let payer = { payer_id }
    let credit = await Credit.findOne({ credit_id })
    let paypalResponse = await _executePaypal(payment_id, payer)

    log.info('paypalResponse: ', paypalResponse)
    let autoProcessing = true
    let credit_status_message = ''
    //Find past orders of user to see how much he's spent today
    let dailyCredits = await Credit.find({'created_time':{$gt:new Date(Date.now() - 24*60*60 * 1000)}, user_id: credit.user_id, 'state':'approved'})
    let totalDailySpend = 0
    if(dailyCredits) {
      dailyCredits.map(credit => {
        totalDailySpend += credit.amount
      })
    }

    log.info('total spent today: ', totalDailySpend)

    let amount = totalDailySpend
    log.info('payer status: ', paypalResponse.payer.status)
    //check to see if user is verified and amount is less than the caps
    if(paypalResponse.payer.status != 'VERIFIED') {
      if(amount >= unverifiedCap) {
        credit_status_message = 'Unverified paypal account'
        autoProcessing = false
      }
      if(amount >= unverifiedOrderCap) {
        credit_status_message = 'Hit order spend cap.'
      }
    } else {
      if(amount >= verifiedCap) {
        credit_status_message = 'Hit daily spend cap.'
        autoProcessing = false
      }
      if(amount >= verifiedOrderCap) {
        credit_status_message = 'Hit order spend cap.'
        autoProcessing = false
      }
    }

    log.info('autoProcessing: ', autoProcessing)
    if(autoProcessing) {
      credit.state = paypalResponse.state
      let user = await User.findById(credit.user_id)
      let myAmount = parseInt(user.credit)+parseInt(credit.amount)
      await _updateUserCreditAfterPayment(user, myAmount)
    } else {
      credit.state = 'processing'
    }
    credit.create_time = paypalResponse.create_time
    await credit.save()
    log.info('No errors were thrown this transaction!')
    ctx.status = 200
    let body = {
      credit_status: 'Complete', totalCost: credit.amount
    }
    if(!autoProcessing) {
      body.credit_status = 'Processing'
      body.credit_status_message = credit_status_message
    }

    ctx.body = body
    await next()
  } catch(err) {
    log.info('error', err)
    switch(err.name) {
    case 'ExpiredOrderError':
      ctx.status = 500
      ctx.body = {error: err.message}
      break
    case 'DomainTakenError':
      ctx.status = 500
      ctx.body = {error: err.message}
      break
    case 'PaypalResponseError':
      ctx.status = 500
      ctx.body = {error: err.message}
      break
    default:
      ctx.status = 422
      log.error('ERROR: ', err)
      ctx.body = {error: err.message}
      break
    }
    await next()
  }
}

/*export async function executeOrder(ctx, next) {

    // On paypal callback:
    // - Update Order status to 'COMPLETE'
    // - Read domain ids from orders row, and change those domains statuses in Domains collection to 'Sold'
    // - Add domain ids to Users collection array
  const unverifiedCap = process.env.STORE_UNVERIFIED_CAP ? process.env.STORE_UNVERIFIED_CAP : 0
  const verifiedCap = process.env.STORE_VERIFIED_CAP ? process.env.STORE_VERIFIED_CAP : 500

  const unverifiedOrderCap = process.env.STORE_UNVERIFIED_ORDER_CAP ? process.env.STORE_UNVERIFIED_ORDER_CAP : 0
  const verifiedOrderCap = process.env.STORE_VERIFIED_ORDER_CAP ? process.env.STORE_VERIFIED_ORDER_CAP : 500

  log.info('executing order...')
  try {
    //update order table
    const order_id = ctx.request.body.data.order_id
    const payment_id = ctx.request.body.data.paymentId
    const payer_id = ctx.request.body.data.PayerID
    let payer = { payer_id }

    let order = await Order.findOne({ order_id })
    if(!order)
      throw new ExpiredOrderError
    // check if domains are still available

    log.info(`Order id: ${order._id}`)
    //update the domains
    let domains = await Promise.map(order.purchases, item_id => {
      return Domain.findById(item_id)
    })

    log.info(`Found ${domains.length} domains. Here are the urls:`)
    domains.forEach(domain => {
      log.info(`url: ${domain.url}`)
    })
    _checkDomains(domains)

    // update domains to sold status, or throw error if one of the domains is already sold
    await _updateDomainsToSold(domains)
    let paypalResponse = await _executePaypalOrder(payment_id, payer, domains)

    log.info('paypalResponse: ', paypalResponse)
    // log.info('paypal verified status: ', paypalResponse.payer.status)
    let autoProcessing = true
    let order_status_message = ''
    //Find past orders of user to see how much he's spent today
    let dailyOrders = await Order.find({'created_time':{$gt:new Date(Date.now() - 24*60*60 * 1000)}, user_id: order.user_id})
    let totalDailySpend = 0
    if(dailyOrders) {
      dailyOrders.map(order => {
        totalDailySpend += order.amount
      })
    }

    log.info('total spent today: ', totalDailySpend)
    log.info('payer status: ', paypalResponse.payer.status)
    let amount = totalDailySpend
    //check to see if user is verified and amount is less than the caps
    if(paypalResponse.payer.status != 'VERIFIED') {
      if(amount >= unverifiedCap) {
        order_status_message = 'Unverified paypal account'
        autoProcessing = false
      }
      if(amount >= unverifiedOrderCap) {
        order_status_message = 'Hit order spend cap.'
      }
    } else {
      if(amount >= verifiedCap) {
        order_status_message = 'Hit daily spend cap.'
        autoProcessing = false
      }
      if(amount >= verifiedOrderCap) {
        order_status_message = 'Hit order spend cap.'
        autoProcessing = false
      }
    }

    log.info('autoProcessing: ', autoProcessing)
    if(autoProcessing) {
      order.state = paypalResponse.state
    } else {
      order.state = 'processing'
    }
    order.create_time = paypalResponse.create_time
    await order.save()
    //get user row for updating domains column
    const user_id = order.user_id
    let user = await User.findById(user_id)
    //Lock domain row in Domain
    //Add domains to user row
    //Updates order_date column in Domain collection
    if(!user.domains) {
      user.domains= []
    }
    await _updateUserAfterPurchase(user, domains)
    let jsonDomains = await _updateDomainsAndGetJSONAfterPurchase(domains, autoProcessing, paypalResponse)
    // get promo info
    let promo = await Promo.findById(order.promo_id)
    // remove promo_id if there was one
    if(promo) {
      await _updatePromoCodeAfterPurchase(user, order.promo_id)
    }

    log.info('No errors were thrown this transaction!')
    ctx.status = 200
    let body = {
      order_status: 'Complete', cart: jsonDomains, totalCost: order.amount
    }
    if(!autoProcessing) {
      body.order_status = 'Processing'
      body.order_status_message = order_status_message
    }

    if(promo) {
      body.promo_discount = promo.discount
      body.promo_code = promo.code
    }

    ctx.body = body
    await next()
  } catch(err) {
    switch(err.name) {
    case 'ExpiredOrderError':
      ctx.status = 500
      ctx.body = {error: err.message}
      break
    case 'DomainTakenError':
      ctx.status = 500
      ctx.body = {error: err.message}
      break
    case 'PaypalResponseError':
      ctx.status = 500
      ctx.body = {error: err.message}
      break
    default:
      const order_id = ctx.request.body.data.order_id
      let order = await Order.findOne({ order_id })
      if(!order)
        throw new ExpiredOrderError
      // check if domains are still available

      //update the domains
      let domains = await Promise.map(order.purchases, item_id => {
        return Domain.findById(item_id)
      }, { concurrency: 30 })

      await Promise.map(domains, domain => {
        domain.status = 'available'
        return domain.save()
      }, { concurrency: 30 })

      ctx.status = 422
      log.error('ERROR: ', err)
      ctx.body = {error: err.message}
      break
    }
    await next()
  }
}*/

export async function cancelCredit(ctx, next) {
  try {
    let credit_id = ctx.request.body.credit.credit_id
    let credit = await Credit.findOne({credit_id})
    if(!credit)
      throw new OrderNotFound

    log.info('Cancelling order...')
    credit.state = 'cancelled'
    credit.save()

    ctx.status = 200
    ctx.body = {credit_status: 'Cancelled'}
    await next
  } catch(error) {
    switch(error) {
    case 'OrderNotFound':
      ctx.status = 200
      break
    default:
      ctx.status = 422
      break
    }
    ctx.body = {error: error.message}
    await next
  }
}

/*export async function cancelOrder(ctx, next) {
  try {
    let order_id = ctx.request.body.order.order_id
    let order = await Order.findOne({order_id})
    if(!order)
      throw new OrderNotFound

    log.info('Cancelling order...')
    order.state = 'cancelled'
    order.save()

    let domains = await Domain.find({order_id})
    await Promise.map(domains, domain => {
      domain.status = 'available'
      return domain.save()
    })
    ctx.status = 200
    ctx.body = {order_status: 'Cancelled'}
    await next
  } catch(error) {

    switch(error) {
    case 'OrderNotFound':
      ctx.status = 200
      break
    default:
      ctx.status = 422
      break
    }
    ctx.body = {error: error.message}
    await next
  }
}*/
/**
 * Filters out unavailable and not found domains. If one is found, then everything fails
 * @param  {[type]} responses [description]
 * @return {[type]}           [description]
 */
function _checkDomains(domains, order_id) {
  domains.forEach(row => {
    log.info('Inside _checkDomains')
    log.info('checking each row...')
    if(!row) {
      throw new Error('Cannot find a domain you\'re trying to purchase in the database. Please try again.')
    } else if(row.status === 'available') {
    } else {
      console.log('row: ', row)
      throw new Error('Sorry! One of the domains was picked up by another customer already. Please go back and reselect new domains.')
    }
  })
}

async function _updateDomainsToSold(domains, user) {
  return Promise.map(domains, domain => {
    log.info(`updating ${domain.url} to status sold...`)
    if(domain.status !== 'available')
      throw new DomainTakenError
    domain.status = 'sold'
    domain.buyer_name = user.bhwname
    return domain.save()
  })
}

async  function _updateUserCreditAfterPayment(user, amount) {
  user.credit=amount
  return user.save()
}

async  function _updateUserAfterPurchase(user, domains) {
  domains.forEach(domain => {
    user.domains.push(domain._id)
  })
  return user.save()
}

async function _updateDomainsAndGetJSONAfterPurchase(domains, autoProcessing, paypalResponse) {
  log.info('Updating domains...')

  //Domains for json response
  let jsonDomains = []
  await Promise.map(domains, domain => {
    if(!autoProcessing)
      domain.status = 'processing'

    // If it's being called from executeOrder, as it CAN be called from processOrder if the amount is $0

    domain.order_time = paypalResponse ? paypalResponse.create_time : Date.now()
    jsonDomains.push({
      id: domain._id,
      tf: domain.tf,
      cf: domain.cf,
      ur: domain.ur,
      majestic_ref_domains: domain.majestic_ref_domains,
      ahrefs_ref_domains: domain.ahrefs_ref_domains,
      sub_category: domain.sub_category,
      category: domain.category,
      price: domain.price,
      domain_type: domain.domain_type
    })
    return domain.save()
  })
  return jsonDomains
}

async function _updatePromoCodeAfterPurchase(user, promo_id) {
  let promo = await Promo.findById(promo_id)
  // remove promo_id if there was one
  if(promo) {
    let count = 0
    let newList = user.promos.filter(userPromo => {
      if(promo._id.toString() === userPromo.toString() && !count) {
        count++
        return false
      }
      return true
    })
    user.promos = newList
  }
  return user.save()
}

function _createCreditObject(credit_id, user, totalCost, paypalResponse) {
  let credit = {}
  credit.created_time = Date.now()
  credit.description = ''
  credit.user_id = user._id
  credit.credit_id = credit_id
  credit.amount = totalCost

  if(paypalResponse) {
    credit.state = paypalResponse.state
    credit.payment_id = paypalResponse.id
  } else {
    log.info('skipping paypal')
    credit.state = 'approved'
    credit.payment_id = uuid.v4()
  }

  return new Credit(credit)
}

async function _whoischeck(domains, statID) {
    var updated_count=0;
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
              updated_count=updated_count+1;
              setTimeout(resolve, DELAY)
            }
        })
        } catch(e) {
          reject('error: ', e)
          await Statistic.findOneAndUpdate({_id:statID}, {whoisCurrentlyRunning:'Failed', whoisLastError: e})
          setTimeout(resolve(), DELAY)
        }
    })
}, {concurrency: THREADS})
    console.log('done!')
    return updated_count
}


function _createOrderObject(order_id, domains, user, promo, totalCost, paypalResponse) {
  let order = {}
  let domain_ids = domains.map(domain => domain._id)
  order.purchases = domain_ids
  order.created_time = Date.now()
  order.description = ''
  order.user_id = user._id
  order.order_id = order_id
  order.promo_id = promo ? promo._id : undefined
  order.amount = totalCost

  if(paypalResponse) {
    order.state = paypalResponse.state
    order.payment_id = paypalResponse.id
  } else {
    log.info('skipping paypal')
    order.state = 'approved'
    order.payment_id = uuid.v4()
  }

  return new Order(order)
}

function _createReceiptResponse(domains, amount, promo) {

  let body = {
    order_status: 'Complete', cart: domains, totalCost: amount
  }

  if(promo) {
    body.promo_discount = promo.discount
    body.promo_code = promo.code
  }
  return body
}

function _calculateTotalCost(responses, discount) {
  let totalCost = 0
  responses.forEach(item => {
    totalCost += item.price
  })
  totalCost -= discount
  return (totalCost > 0) ? totalCost : 0
}

function _createPaypal(payment) {
  return new Promise((resolve, reject) => {
    paypal.payment.create(payment, {}, async (err, resp) => {
      if (err) {
        log.error('Paypal error: ', err)
        reject(err)
      }
      resolve(resp)
    })
  })
}

function _executePaypal(payment_id, payer) {
  return new Promise((resolve) => {
    paypal.payment.execute(payment_id, payer, {}, async (err, resp) => {
      if (err) {
        throw new PaypalResponseError
      }
      if (resp) {
        resolve(resp)
      }
    })
  })
}

function _executePaypalOrder(payment_id, payer, domains) {
  return new Promise((resolve) => {
    paypal.payment.execute(payment_id, payer, {}, async (err, resp) => {
      if (err) {
        await Promise.map(domains, domain => {
          domain.status = 'available'
          return domain.save()
        }, { concurrency: 30 })
        throw new PaypalResponseError
      }
      if (resp) {
        resolve(resp)
      }
    })
  })
}

// ADMIN
export function getStoreStats(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
    try {

      if(user.type !== 'admin')
        throw new UserNotFoundError
      // - Number of total accounts
      // - Total daily revenue
      // - Total daily new users
      // - Total inventory value
      // - Lifetime sales
      // - Monthly sales
      // - Weekly sales

      let numOfAccounts = await Domain.count({})
      let todayOrders  = await Order.aggregate({ $match : { created_time:{"$gte":new Date(Date.now() - 24*60*60 * 1000)}, state: 'approved' } },
      {
        $group:
          {
             _id: "$_id.state",
             totalAmount: { $sum: "$amount" }
          }
      })
      let weeklyOrders  = await Order.aggregate({ $match : { created_time:{"$gte":new Date(Date.now() - 24*60*60*7 * 1000)}, state: 'approved' } },
      {
        $group:
          {
           _id: "$_id.state",
           totalAmount: { $sum: "$amount" }
          }
      })
      let monthlyOrders  = await Order.aggregate({ $match : { created_time:{"$gte":new Date(Date.now() - 24*60*60*30 * 1000)}, state: 'approved' } },
      {
        $group:
          {
           _id: "$_id.state",
           totalAmount: { $sum: "$amount" }
          }
     })
      let allOrders = await Order.find({state: 'approved'})
      let todayRevenue = todayOrders[0]!=null?todayOrders[0].totalAmount:0,
          monthlyRevenue = monthlyOrders[0]!=null?monthlyOrders[0].totalAmount:0,
          weeklyRevenue = weeklyOrders[0]!=null?weeklyOrders[0].totalAmount:0
      let totalRevenue=0
      allOrders.map(order => {
        totalRevenue += order.amount
      })
      let dailyNewUsers = await User.count({'created_at':{$gt:new Date(Date.now() - 24*60*60 * 1000)}})
      let totalInventory = await Domain.count({status:'available'})

      let response = {
        totalAccounts: numOfAccounts,
        todayRevenue,
        weeklyRevenue,
        monthlyRevenue,
        totalRevenue,
        dailyNewUsers,
        totalInventory
      }
      ctx.status = 200
      ctx.body = response
      await next
    } catch(error) {
      log.warn('Error: ', error)
      ctx.status = 422
      ctx.body = {error}
      await next
    }
  })(ctx, next)
}

export async function getRecentTransactions(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
    try {
      log.info('Inside getRecentTransactions')
      log.info('user email: ', user.email)
      if(user.type !== 'admin')
        throw new UserNotAdminError

      let orders = await Order.find({}).sort({ created_time: -1 }).limit(100)
      ctx.status = 200
      ctx.body = {orders}
    }  catch(error) {
      log.warn('admin error: ', error)
      ctx.status = 422
      ctx.body = { error }
      await next
    }
  })(ctx, next)
}

export async function whoisUpdateDomains(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
    try {
      var is_update=ctx.params.is_update
      if(is_update==1)
      {
        var no_of_update=0;
        let whoisStartTime=Date.now()
        log.info('Inside whoisUpdateDomains')
        if(user.type !== 'admin')
          throw new UserNotAdminError
        let domains =  await Domain.find({'status': 'available', 'domain_type': 'pbn'})
       // numberof_domains_checked = domains.length
        console.log('Domain Length', domains.length);
        console.log('Loop started')
        const statistic = new Statistic({
        whoisStartTime, whoisCurrentlyRunning:'InProgress'
        })
        await statistic.save()
        let stat = await Statistic.find({}).sort({_id:-1}).limit(1)
        no_of_update=await _whoischeck(domains, stat[0]._id)
        console.log('Loop Done')
        let whoisEndTime=Date.now()
        let whoisLastUpdateNumber=no_of_update
        let whoisLastRemoveNumber=domains.length-no_of_update
        await Statistic.findOneAndUpdate({_id:stat[0]._id}, {whoisEndTime: whoisEndTime, whoisLastUpdateNumber: whoisLastUpdateNumber, whoisLastRemoveNumber: whoisLastRemoveNumber, whoisCurrentlyRunning:'Completed' })
      }
      let whoisdata = await Statistic.find({}).sort({_id:-1}).limit(10)
      ctx.status = 200
      ctx.body = {whoisdata}
     await next
    }  catch(error) {
      log.warn('admin error: ', error)
      ctx.status = 422
      ctx.body = { error }
     await next
    }
  })(ctx, next)
}

function _sendProcessOrderEmail(email) {
  return new Promise(async (resolve, reject) => {
    try {
      log.info('sending from: ', email)
      let message = {
        from: ` <${email}>`
      }
      await mail.sendProcessOrderEmail(message)
      resolve(true)
    } catch(err) {
      reject(err)
    }
  })
}

class OrderNotFound {
  constructor() {
    this.name = 'OrderNotFound'
    this.message = 'No order found'
    this.stack = new Error().stack
  }
}

class ExpiredOrderError {
  constructor() {
    this.name = 'ExpiredOrderError'
    this.message = 'Order expired.'
    this.stack = new Error().stack
  }
}

class DomainTakenError {
  constructor() {
    this.name = 'DomainTakenError'
    this.message = 'Order expired.'
    this.stack = new Error().stack
  }
}

class PaypalResponseError {
  constructor() {
    this.name = 'PaypalResponseError'
    this.message = 'There was an error with paypal. Please try the order again.'
    this.stack = new Error().stack
  }
}

class UserNotFoundError {
  constructor() {
    this.name = 'UserNotFoundError'
    this.message = 'Cannot find a user for this order.'
    this.stack = new Error().stack
  }
}

class UnverifiedUser {
  constructor() {
    this.name = 'UnverifiedUser'
    this.message = 'User is paypal unverified. Manual processing is required.'
    this.stack = new Error().stack
  }
}

UnverifiedUser.prototype = Object.create(Error.prototype)
UserNotFoundError.prototype = Object.create(Error.prototype)
PaypalResponseError.prototype = Object.create(Error.prototype)
DomainTakenError.prototype = Object.create(Error.prototype)
ExpiredOrderError.prototype = Object.create(Error.prototype)
OrderNotFound.prototype = Object.create(Error.prototype)