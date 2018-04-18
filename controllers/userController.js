import User from '../models/user'
import Domain from '../models/domain'
import Promo from '../models/promo'
import Order from '../models/order'
import Credit from '../models/credit'
import log from '../services/log'
import passport from 'koa-passport'
import {createCsv, updateDomains} from '../services/csv'
import Promise from 'bluebird'
import Fs from 'fs'
import File from '../services/files'
import * as mail from '../services/mailer'
import bcrypt from 'bcrypt-nodejs'

const fs = Promise.promisifyAll(Fs)


export async function getUserInfo(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
    let userObject = {
      email: user.email,
      bhwname: user.bhwname,
      amount: user.credit
    }
    ctx.body = userObject
    ctx.status = 200
    await next()
  })(ctx, next)
}

export async function getUserItems(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
    try {
      var domainType=ctx.params.domainType
      log.info('')
      log.info('domains length: ', user.domains.length)
      if(user.domains.length < 1) {
        ctx.status = 200
        ctx.body = {orders: []}
        return await next()
      }
      let domains = await Promise.map(user.domains, async domain_id => {
        let domain = await Domain.findById(domain_id.toString())
        if(!domain) {
          log.info('WE COULD NOT FIND: ', domain_id.toString())
          return Promise.resolve(null)
        }
        return Promise.resolve(domain)
      }, { concurrency: 10 })
      if(domains.length < 1) {
        ctx.status = {message: 'No past items found'}
      }
      let purchasedDomains = []
      log.info('fetched user items before filtering: ', domains.length)
      purchasedDomains = domains.filter(domain => {
        if(!domain) {
          log.info('Could not find domain: ', domain)
          return false
        }
        log.info('================')
        log.info('_id: ', domain._id.toString())
        log.info('domain url: ', domain.url)
        log.info('domain status: ', domain.status)
        if(domain.status !== 'available' && domain.domain_type===domainType) {
          return true
        } else {
          log.info('WTF: domain.status: ', domain.status)
        }
      })
      log.info('fetched user items after filtering: ', purchasedDomains.length)
      ctx.body = {items: purchasedDomains}
      ctx.status = 200
      await next()
    } catch(error) {
      log.warn('error: ', error)
      ctx.status = 422
      ctx.body = {error: error.message}
      await next()
    }
  })(ctx, next)
}

export async function getUserOrders(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
    try {

      const orders = await Order.find({user_id: user._id})
      if(!orders)
        throw new NoOrdersFoundError

      let ordersObject = []
      ordersObject = orders.map(order => {
        if(order.state === 'created')
          return null

        let obj = {}
        obj.order_date = order.created_time
        obj.order_id = order.order_id
        obj.state = order.state
        obj.amount = order.amount
        obj.description = order.description
        return obj
      })

      ordersObject = ordersObject.filter(order => order)

      ctx.body = {orders: ordersObject}
      ctx.status = 200
      await next()
    } catch(error) {
      switch(error.name) {
      case 'NoOrdersFoundError':
        ctx.status = 200
        ctx.body = {orders: []}
        break
      default:
        log.warn('error: ', error)
        ctx.status = 422
        ctx.body = {error: error.message}
      }
      await next()
    }
  })(ctx, next)
}

export async function getUserCreditHistory(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
    try {

      const credits = await Credit.find({user_id: user._id})
      if(!credits)
        throw new NoOrdersFoundError

      let creditObject = []
      creditObject = credits.map(credit => {
        if(credit.state === 'created')
          return null

        let obj = {}
        obj.credit_date = credit.created_time
        obj.credit_id = credit.credit_id
        obj.state = credit.state
        obj.amount = credit.amount
        obj.description = credit.description
        return obj
      })

      creditObject = creditObject.filter(credit => credit)

      ctx.body = {credits: creditObject}
      ctx.status = 200
      await next()
    } catch(error) {
      switch(error.name) {
      case 'NoOrdersFoundError':
        ctx.status = 200
        ctx.body = {orders: []}
        break
      default:
        log.warn('error: ', error)
        ctx.status = 422
        ctx.body = {error: error.message}
      }
      await next()
    }
  })(ctx, next)
}

export async function exportDomains(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
    try {
      var domainType=ctx.params.domainType
      if(!user)
        throw new UserNotFoundError

      let domainIds = user.domains

      if(!domainIds)
        throw new DomainsNotFoundError

      let domains = await Promise.map(domainIds, domainId => {
        return Domain.findOne({ _id: domainId, domain_type:domainType})
      })

      if(domains.length < 1) {
        throw new DomainsNotFoundError
      }

      let csvPath = await createCsv(domains, user.email, domainType)
      let name = csvPath.replace(/^.*[\\\/]/, '')
      // ctx.set('Content-type', 'text/csv')
      // ctx.attachment(csvPath)
      // ctx.body = await fs.createReadStream(csvPath)
      ctx.status = 200
      ctx.body = { filename: name }
      //file.delete
      // await next
    } catch(error) {
      log.error('error: ', error.message)
      switch(error.name) {
      case 'DomainsNotFoundError':
      case 'UserNotFoundError':
        ctx.status = 200
        break
      default:
        ctx.status = 422
        break
      }
      ctx.body = {error: error.message}
      await next
    }

  })(ctx, next)
}

export async function download(ctx, next) {
  try {
    let { filename } = ctx.query
    filename = decodeURIComponent(filename)
    let filepath = await File.exists(filename)
    if(!filepath) {
      log.info('file not found')
      throw new FileNotFoundError
    }
    if(filepath.includes('..')) {
      log.info('file not found')
      throw new FileNotFoundError
    }
    ctx.set('Content-type', 'text/csv')
    ctx.attachment(filepath)
    ctx.body = await fs.createReadStream(filepath)
    await next
    if(filename!='serverLog'){
      await File.cleanup(filepath)
    }
  } catch(error) {
    ctx.status = 422
    ctx.body = {error: error}
  }
}

export async function getServerLogs(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
    try {
      var mode=ctx.request.body.mode
      var filename=ctx.request.body.filename
      log.info('Inside getServerLogs', filename)

      if(user.type !== 'admin')
        throw new UserNotAdminError

      filename = decodeURIComponent(filename)
      let filepath = await File.exists(filename)
      if(!filepath) {
        log.info('file not found')
        throw new FileNotFoundError
      }
      if(filepath.includes('..')) {
        log.info('file not found')
        throw new FileNotFoundError
      }

      if(mode=='clear'){
        fs.truncate(filepath, 0, function(){console.log('done')})
      }

      // read all lines:
      let serverlogs= await File.readFile(filepath)
      ctx.body = {serverlogs}
      ctx.status = 200
    }  catch(error) {
      log.warn('admin error: ', error)
      ctx.status = 422
      ctx.body = { error }
      await next
    }
  })(ctx, next)
}

export async function addPromoCode(ctx, next) {
  try {
    const email = ctx.request.body.email
    const code = ctx.request.body.code
    const discount = ctx.request.body.discount

    let newPromo = await new Promo({code, discount, note: 'test promo code'}).save()
    const user = await User.findOne({ email })
    if(!user.promos)
      user.promos = []
    user.promos.push(newPromo._id)
    await user.save()
    ctx.status = 200
    ctx.body = {message: 'successfully added new promo code!'}

  } catch(error) {
    log.warn(error)
    ctx.status = 500
  }
  await next
}

export async function checkPromoCode(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
    try {
      const submittedCode = ctx.request.body.code
      if( !user.promos || user.promos.length < 1) {
        throw new InvalidPromoCodeError
      }

      let promoSearch = await Promise.map(user.promos, promo_id => {
        return Promo.findById(promo_id)
      })
      let promo = promoSearch.find(row => {
        if(row.code === submittedCode) {
          return true
        }
        return false
      })

      if(!promo) {
        throw new InvalidPromoCodeError
      }
      ctx.status = 200
      ctx.body = {discount: promo.discount, code: promo.code, id: promo._id}
      await next
    } catch(error) {
      if(error.name === 'InvalidPromoCodeError') {
        ctx.status = 200
        ctx.body = {discount: 0, code: '', error: error.message, activated: false}
      } else {
        log.warn('error: ', error)
        ctx.status = 422
        ctx.body = {error}
      }
      await next
    }
  })(ctx, next)
}

// admin
export async function getPendingOrders(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
    try {
      if(user.type !== 'admin')
        throw new UserNotAdminError

      let pendingOrders = await Order.find({state: 'processing'})
      if(!pendingOrders)
        throw new NoPendingOrders
      let pendingOrdersWithEmail = await Promise.map(pendingOrders, async order => {
        return _getUserInfoFromOrder(order)
      }, {concurrency: 30})
      pendingOrdersWithEmail = pendingOrdersWithEmail.filter(order => order)
      let orders = pendingOrdersWithEmail.map(order => {
        let obj = {}
        obj.order_date = order.created_time
        obj.order_id = order.order_id
        obj.user = order.user
        obj.bhwname = order.bhwname
        obj.state = order.state
        obj.amount = order.amount
        obj.promo_code = order.promo_code
        obj.number_of_items = order.purchases.length
        obj.description = order.description
        return obj
      })
      ctx.body = { orders }
      ctx.status = 200
      await next
    } catch(error) {
      switch(error.name) {
      case 'NoPendingDomains':
        log.info('No pending domains found')
        ctx.status = 200
        ctx.body = {orders: []}
        break
      default:
        log.warn('error: ', error)
        ctx.status = 422
        ctx.body = { error }
        break
      }
      await next
    }
  })(ctx, next)
}

export async function approveOrders(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
    try {
      if(user.type !== 'admin')
        throw new UserNotAdminError

      let order_ids = ctx.request.body.order_ids

      let orders = await Promise.map(order_ids, id => {
        return Order.findOneAndUpdate({order_id: id}, {state: 'approved'})
      }, {concurrency: 50})

      orders.forEach(order => {
        log.info('order user: ' , order.user_id)
      })
      let domain_count = 0
      let domains = Promise.map(orders, order => {
        let purchase_ids = order.purchases
        return Promise.map(purchase_ids, async id => {
          domain_count++
          let domain = await Domain.findById({_id: id})
          if(!domain) {
            log.warn('Could not find a domain in the db')
            return Promise.resolve()
          }
          let soldDomain = new Domain(domain)
          await soldDomain.save()
          return domain.remove()
        })
      }, {concurrency: 50})

      if(!domains || !orders)
        throw new Error('Domains or orders could not be updated')

      let emails = await Promise.map(orders, order => {
        console.log('')
        return _getEmailFromId(order.user_id)
      })
      let emailSet = [ ...new Set(emails) ]
      log.info('emailSet: ', emailSet)
      await Promise.map(emailSet, email => {
        return _sendOrderApprovedEmail(email)
      })
      ctx.status = 200
      ctx.body = {status: 'Success!', processed_domains: domain_count, processed_orders: orders.length}
      await next
    } catch(error) {
        switch(error.name) {
        default:
          log.warn('error: ', error)
          ctx.status = 422
          ctx.body = { error }
          break
        }
        await next
      }
  })(ctx, next)
}

export async function denyOrders(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
    try {
      if(user.type !== 'admin')
        throw new UserNotAdminError

      let order_ids = ctx.request.body.order_ids

      let orders = await Promise.map(order_ids, id => {
        return Order.findOneAndUpdate({order_id: id}, {state: 'denied'})
      }, {concurrency: 50})

      let domain_count = 0
      let updatedDomains = Promise.map(orders, order => {
        let purchase_ids = order.purchases
        return Promise.map(purchase_ids, id => {
          domain_count++
          return Domain.findOneAndUpdate({_id: id}, { status: 'available' })
        })
      }, {concurrency: 50})

      let updatedUsers = Promise.map(orders, order=> {
        return _saveUpdatedPurchasesInUserCollection(order)
      })

      if(!updatedDomains || !orders || !updatedUsers)
        throw new Error('Domains or orders could not be updated')

      ctx.status = 200
      ctx.body = {status: 'Success!', processed_domains: domain_count, processed_orders: orders.length}
      await next
    } catch(error) {
        switch(error.name) {
        default:
          log.warn('error: ', error)
          ctx.status = 422
          ctx.body = { error }
          break
        }
        await next
      }
  })(ctx, next)
}


export async function getAllUsers(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
    try {
      log.info('Inside getAllUsers')
      log.info('user email: ', user.email)
      if(user.type !== 'admin')
        throw new UserNotAdminError
      let users = await User.find({})
      if(!users)
        throw new UserNotFoundError
      users = users.map(user => {
        let obj = {}
        obj._id = user._id
        obj.promos = user.promos
        obj.domains = user.domains
        obj.type = user.type
        obj.email = user.email
        obj.bhwname = user.bhwname
        obj.signup_ip = user.signup_ip
        obj.last_ip = user.last_ip
        obj.last_login_at = user.last_login_at
        obj.last_password_reset_at = user.last_password_reset_at
        obj.lockUntil = user.lockUntil ? user.lockUntil : 0
        obj.created_at = user.created_at
        obj.promoCount = user.promos.length ? user.promos.length : 0
        obj.domainCount = user.domains.length ? user.domains.length : 0
        // if(obj.domainCount > 0) {
        //   let domains = await Promise.map(user.domains, domain => {
        //     return Domain.findById(domain)
        //   })
        //   obj.totalSpend = domains.reduce((prev, curr) => prev + curr)
        // } else {
        //   obj.totalSpend = 0
        // }
        return obj
      })
      ctx.status = 200
      ctx.body = {users}
    }  catch(error) {
      log.warn('admin error: ', error)
      ctx.status = 422
      ctx.body = { error }
      await next
    }
  })(ctx, next)
}

export async function getAllPromoCodes(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
    try {
      if(user.type !== 'admin')
        throw new UserNotAdminError

      let promos = await Promo.find({}, '_id code discount note')
      if(!promos)
        throw new UserNotFoundError
      promos = promos.map(promo => {
        let obj = {}
        obj._id = promo._id
        obj.code = promo.code
        obj.discount = promo.discount
        obj.note = promo.note
        return obj
      })

      ctx.status = 200
      ctx.body = {promos}
    }  catch(error) {
      log.warn('admin error: ', error)
      ctx.status = 422
      ctx.body = { error }
      await next
    }
  })(ctx, next)
}

export async function assignPromoCodes(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
    try {

      if(user.type !== 'admin')
        throw new UserNotAdminError

      let promos = ctx.request.body.promos
      let users = ctx.request.body.users

      console.log('users: ', users)
      console.log('promos: ', promos)
      if(!promos || !users)
        throw new NotENoughParametersError

      Promise.map(users, async user_id => {
        console.log('user: ', user)
        let userRow = await User.findById(user_id)
        if(!userRow) {
          log.warn('Cannot find user')
          Promise.reject()
        }
        promos.forEach(promo_id => {
          userRow.promos.push(promo_id)
        })
        return userRow.save()
      })

      ctx.status = 200
      ctx.body = {message: 'success!'}
      await next
    } catch(error) {
      log.warn('admin error: ', error)
      ctx.status = 422
      ctx.body = { error }
      await next
    }
  })(ctx, next)
}

export async function getMoreInfoUser(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (admin) => {
    try {
      if(admin.type !== 'admin')
        throw new UserNotAdminError

      let userid = ctx.request.body.id
      if(userid.length === 0)
        throw new UserNotFoundError
      let user = await User.findById(userid)

      if(!user)
        throw UserNotFoundError
      let returnObj = {
        id: user._id,
        email: user.email,
        bhwname: user.bhwname,
        signup_ip: user.signup_ip,
        verified: user.verified,
        created_at: user.created_at,
        last_ip: user.last_ip,
        domains: [],
        orders: [],
        promos: [],
        currentPromoCode: '',
        totalSpend: 0,
        promosUsed: 0
      }

      let orders = await Order.find({user_id: user._id}, 'created_time state payment_id amount purchases order_id')
      returnObj.orders = orders.map(order => {
        let obj = {}
        obj.created_time = order.created_time
        obj.state = order.state
        obj.payment_id = order.payment_id
        obj.amount = order.amount
        obj.purchases = order.purchases
        obj.order_id = order.order_id
        if(order.amount === 0)
          returnObj.promosUsed++
        return obj
      })
      if(user.domains.length > 0) {
        let domains = await Promise.map(user.domains, domain => {
          return Domain.findById(domain)
        }, {concurrency: 20})
        // domains = domains.filter(domain => domain)
        returnObj.domains = domains.map(d => {
          let o = {}
          if(!d) {
            return null
          }
          o.url = d.url
          o.username = d.username
          o.password = d.password
          o.email = d.email
          o.ur = d.ur
          o.pa = d.pa
          o.cf = d.cf
          o.majestic_ref_domains = d.majestic_ref_domains
          o.ahrefs_ref_domains = d.ahrefs_ref_domains
          o.category = d.category
          o.sub_category = d.sub_category
          o.price = d.price
          o.status = d.status
          o.updatedAt = d.updatedAt
          return o
        })
      }
      if(user.promos && user.promos.length > 0) {
        let promos = await Promise.map(user.promos, code => {
          return Promo.findById(code)
        }, {concurrency: 20})
        returnObj.promos = promos.map(p => {
          let o = {}
          o.code = p.code
          o.discount = p.discount
          o.note = p.note
          return o
        })
      }
      if(returnObj.orders.length > 0) {
        returnObj.orders.forEach(order => {
          if(order.state === 'approved')
            returnObj.totalSpend += order.amount
        })
      }
      ctx.status = 200
      ctx.body = returnObj
    } catch(error) {
      log.warn('error in getMoreInfoUsers: ', error)
      ctx.status = 422
      ctx.body = {error}
    }
  })(ctx, next)
}

function _sendOrderApprovedEmail(email) {
  return new Promise(async (resolve, reject) => {
    try {
      log.info('sending to: ', email)
      let message = {
        to: ` <${email}>`
      }
      await mail.sendApprovedOrderEmail(message)
      resolve(true)
    } catch(err) {
      reject(err)
    }
  })
}

function _getEmailFromId(id) {
  return new Promise(async (resolve, reject) => {
    try {
      let user = await User.findById(id)
      let email = user.email
      resolve(email)
    } catch(err) {
      reject(err)
    }
  })
}
async function _getUserInfoFromOrder(order) {
  return new Promise(async (resolve)=> {
    try {
      let user = await User.findById(order.user_id)
      order.user = user.email
      order.bhwname = user.bhwname
      resolve(order)
    } catch(e) {
      log.warn('no user found...')
      resolve(null)
    }
  })
}

async function _saveUpdatedPurchasesInUserCollection(order) {
  return new Promise(async (resolve) => {
    try {
      let user = await User.findById(order.user_id)
      let domainsArray = user.domains.filter(domain => {
        for(let i=0; i<order.purchases.length; i++) {
          if(domain.equals(order.purchases[i])) {
            return false
          }
        }
        return true
      })
      user.domains = domainsArray
      await user.save()
      resolve(user)
    } catch(e) {
      log.warn('error updating users domains')
      resolve(false)
    }
  })
}

export async function changepassword(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
  try {
    const currentPassword = ctx.request.body.currentPassword
    const newPassword = ctx.request.body.newPassword
    const changepassword = new User({_userId: user._id})
    let userDetails = await User.findById(user._id)
    var res=bcrypt.compareSync(currentPassword, userDetails.password)
    if(res==true){
    user.password = newPassword
    user.last_password_reset_at = Date.now()
    await user.save()
    ctx.body = { message: 'Password Changed Successfully.'}
    ctx.status = 200
    }
    else{
      ctx.status = 422
      ctx.body = {error: 'Current password not valid'}
    }
    await next
  } catch(err) {
    log.info('ERROR: ', err)
    ctx.status = 422
    ctx.body = {error: 'There was a server error. Please try again.'}
    await next
  }
  await next()
  })(ctx, next)
}

export async function addProduct(ctx, next) {
  return passport.authenticate('jwt', {session: false}, async (user) => {
  try {
    var fileData=ctx.request.body.files.domain_file;
    var domain_type=ctx.request.body.fields.domain_type
    var action_type=ctx.request.body.fields.action_type

    await updateDomains(fileData.path, 'insert', domain_type, action_type)
    log.info('Insert complete!')
    ctx.body = { message: 'File Uploaded Successfully.'}
    ctx.status = 200
    await next
  } catch(err) {
    log.info('ERROR: ', err)
    ctx.status = 422
    ctx.body = {error: 'There was a server error. Please try again.'}
    await next
  }
  await next()
  })(ctx, next)
}

// TODO: Move to errors file
class InvalidPromoCodeError {
  constructor() {
    this.name = 'InvalidPromoCodeError'
    this.message = 'Invalid promo code.'
    this.stack = new Error().stack
  }
}

class UserNotFoundError {
  constructor() {
    this.name = 'UserNotFoundError'
    this.message = 'User not found.'
    this.stack = new Error().stack
  }
}

class DomainsNotFoundError {
  constructor() {
    this.name = 'DomainsNotFoundError'
    this.message = 'No domains found.'
    this.stack = new Error().stack
  }
}

class FileNotFoundError {
  constructor() {
    this.name = 'FileNotFoundError'
    this.message = 'File not found.'
    this.stack = new Error().stack
  }
}
class NoOrdersFoundError {
  constructor() {
    this.name = 'NoOrdersFoundError'
    this.message = 'File not found.'
    this.stack = new Error().stack
  }
}

class UserNotAdminError {
  constructor() {
    this.name = 'UserNotAdminError'
    this.message = 'You\'re not an admin. Abort!'
    this.stack = new Error().stack
  }
}

class NoPendingOrders {
  constructor() {
    this.name = 'NoPendingOrders'
    this.message = 'No pending domains.'
    this.stack = new Error().stack
  }
}
class NotENoughParametersError {
  constructor() {
    this.name = 'NotENoughParametersError'
    this.message = 'Request was fucked up.'
    this.stack = new Error().stack
  }
}


NotENoughParametersError.prototype = Object.create(Error.prototype)
NoPendingOrders.prototype = Object.create(Error.prototype)
InvalidPromoCodeError.prototype = Object.create(Error.prototype)
UserNotFoundError.prototype = Object.create(Error.prototype)
DomainsNotFoundError.prototype = Object.create(Error.prototype)
UserNotAdminError.prototype = Object.create(Error.prototype)
NoOrdersFoundError.prototype = Object.create(Error.prototype)
FileNotFoundError.prototype = Object.create(Error.prototype)