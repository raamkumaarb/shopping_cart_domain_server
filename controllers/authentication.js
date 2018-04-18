import env from 'dotenv'
env.config()

import passport from 'koa-passport'
import jwt from 'jwt-simple'
import axios from 'axios'
import User from '../models/user'
import PasswordResetTokenModel from '../models/passwordResetToken'
import verificationTokenModel from '../models/VerificationToken'
import log from '../services/log'
import * as mail from '../services/mailer'

// For failed login attempts
const reasons = {
  NOT_FOUND: 1,
  UNVERIFIED: 2,
  MAX_ATTEMPTS: 3,
  PASSWORD_INCORRECT: 4
}


function  tokenForUser(email) {
  return new Promise((resolve, reject) => {
    const timestamp = new Date().getTime()
    User.findOne({$and: [
          { $or: [{email: email}, {bhwname: email}] }          
      ]}, (err,user) => {
      if(err) reject(err)        
      if(!user) reject('No User Found')
      resolve({user, token: jwt.encode({ sub: user.id, iat: timestamp }, process.env.JWT_SECRET)})
    })
  })
}

function createVerifyToken(user) {
  return new Promise(async (reslove, reject) => {
    let verificationToken = new verificationTokenModel({_userId: user._id})
    try {
      const token = await verificationToken.createVerificationToken()
      const verifyUrl = `${process.env.CLIENT_PROTOCOL}${process.env.CLIENT_HOST}/verify/${token}`
      let message = {
        to: ` <${user.email}>`
      }
      await mail.sendVerificationEmail(message, verifyUrl)
      log.info('Sent to postmark for delivery')
    } catch(error) {
      log.info('Couldn\'t create verification token', error)
      reject(error)
    }
  })
}

function _createPasswordResetToken(user) {
  return new Promise(async (resolve, reject) => {
    try {
      const passwordReset = new PasswordResetTokenModel({_userId: user._id})
      const token = await passwordReset.createVerificationToken()
      const verifyUrl = `${process.env.CLIENT_PROTOCOL}${process.env.CLIENT_HOST}/resetpassword/verify/${token}`
      let message = {
        to: ` <${user.email}>`
      }
      await mail.sendPasswordResetEmail(message, verifyUrl)
      resolve(true)
      log.info('Sent to postmark for delivery')
    } catch(error) {
      log.error(error)
      reject(error)
    }
  })
}

export async function verifyToken(ctx, next) {
  let token = ctx.params.token
  try {
    await verifyUser(token)
    ctx.body = {message: 'Hooray! Your account is now activated. You can now login.'}
    ctx.status = 200
  } catch(err) {
    log.info('error')
    ctx.body = {error: err}
    ctx.status = 422
  }
  await next()
}

export async function signup(ctx, next) {
  const email = ctx.request.body.email
  const password = ctx.request.body.password
  const bhwname = ctx.request.body.bhwname
  const captcha = ctx.request.body.captcha
  const ip = ctx.headers['x-real-ip']
  if(!email || !password) {
    ctx.status = 422
    ctx.body = {error: 'You must provide email and password'}
    return await next()
  }

  try {
    await _verifyCaptcha(captcha)
    let existingUser = await User.findOne({ email: email })
    if(existingUser) {
      ctx.status = 422
      ctx.body = {error: 'Email is in use'}
      return await next()
    }

    if(bhwname) {
      existingUser = await User.findOne({ bhwname })
      if(existingUser) {
        ctx.status = 422
        ctx.body = {error: 'Username is in use'}
        return await next()
      }
    }

    const user = new User({
      email, password, bhwname, verified: 'false', signup_ip: ip
    })
    createVerifyToken(user)
    await user.save()
    ctx.body = { message: 'Welcome! Please verify your email address before logging in.'}
  } catch(err) {
    log.info('ERROR: ', err)
    ctx.status = 422
    ctx.body = {error: err.message}
    return await next(err)
  }
  await next()
}

export async function signin(ctx, next) {
  return passport.authenticate('local', {session: false}, async (theUser, error, reason) => {
    try {
      // log.info('error: ', error)
      if(reason) {
        switch(reason) {
        case reasons.NOT_FOUND:
        case reasons.PASSWORD_INCORRECT:
          throw new NoUserFoundError
        case reasons.MAX_ATTEMPTS:
          throw MaxLoginAttemptsError
        default:
          throw new NoUserFoundError
        }
      }
      if(error) {
        throw new Error('Error processing')
      }
      ctx.status = 200
      let {user, token} = await tokenForUser(ctx.request.body.email)
      user.last_ip = ctx.headers['x-real-ip'] ? ctx.headers['x-real-ip'] : '?????'
      user.last_login_at = Date.now()
      ctx.body = { token }
      await user.save()
    } catch(err) {
      ctx.status = 401
      switch(err.name) {
      case 'NoUserFoundError':
        ctx.body = {error: 'Bad User Login'}
        break
      case 'MaxLoginAttemptsError':
        ctx.body = {error: 'Your account is temporarily locked.'}
        break
      default:
        ctx.body = {error: 'Bad User Login'}
      }
      await next
    }
  })(ctx,next)
}

export async function verifyUser(token) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = await verificationTokenModel.findOne({token})
      if(!doc) {
        log.info('No verification token found bruh')
        reject('Token not found')
      }
      const user = await User.findOne({_id: doc._userId})
      if(!user) {
        log.info('No verification token found bruh')
        reject('User not found')
      }
      user.verified = true
      await user.save()
      log.info('user verfied status: ', user.verified)
      resolve()
    } catch(error) {
      log.info('Error: ', error)
    }
  })
}

export async function initiatePasswordReset(ctx, next) {
  try {
    const email = ctx.request.body.email
    if(!email)
      throw new NoUserFoundError

    let user = await User.findOne({ email })
    if(!user)
      throw new NoUserFoundError

    log.info('submitting....')
    await _createPasswordResetToken(user)
    log.info('do we get here?')
    ctx.status = 200
    ctx.body = { message: 'Submitted' }
    return await next()
  } catch(err) {
    log.error(err)
    switch(err.name) {
    case 'NoUserFoundError':
      ctx.status = 200
      ctx.body = { message: 'Submitted' }
      break
    default:
      ctx.status = 422
      ctx.body ={ message: 'Server error' }
    }
    return await next()
  }
}

export async function verifyPasswordReset(ctx, next) {
  try {
    const token = ctx.request.body.token
    log.warn('token: ', token)
    const doc = await PasswordResetTokenModel.findOne({token})
    if(!doc) {
      log.info('No password reset token found.')
      throw new TokenExpiredError
    }
    const user = await User.findOne({_id: doc._userId})
    if(!user) {
      throw new NoUserFoundError
    }
    ctx.status = 200
    ctx.body = { resetToken: token }
    await next
  } catch(error) {
    log.error(error)
    switch(error.name) {
    case 'TokenExpiredError':
    case 'NoUserFoundError':
      ctx.status = 410
      ctx.body = {error: error.message }
      break
    default:
      ctx.status = 422
      ctx.body = {error: 'There was a server error. Please try again.'}
    }
    await next
  }
}

export async function submitPasswordReset(ctx, next) {
  try {
    const token = ctx.request.body.token
    const password = ctx.request.body.password
    const passwordConfirm = ctx.request.body.passwordConfirm
    const doc = await PasswordResetTokenModel.findOne({token})
    if(!doc) {
      log.info('No password reset token found.')
      throw new TokenExpiredError
    }

    const user = await User.findOne({_id: doc._userId})
    if(!user) {
      throw new NoUserFoundError
    }

    if(password !== passwordConfirm)
      throw new PasswordsAreDifferentError

    user.password = password
    user.last_password_reset_at = Date.now()
    await user.save()
    await doc.remove()
    ctx.status = 200
    await next
  } catch(error) {
    ctx.status = 422
    log.error(error)
    switch(error.name) {
    case 'TokenExpiredError':
      ctx.body = {error : 'Reset password token expired. Please try again.'}
      break
    case 'NoUserFoundError':
      ctx.body = {error : error.message}
      break
    default:
      ctx.body = {error : 'There was a server error. Please try the process again.'}
    }
    await next
  }
}

// export async function signinAdmin(ctx, next) {
//   try {
//     let email = ctx.request.body.email
//     let user = await _getAdminUser(email)
//     if(!user)
//       throw new UserNotAdminError
//     ctx.status = 200
//     ctx.body = {token: await tokenForUser(email)}
//   } catch(err) {
//     switch(err.name) {
//     case 'UserNotAdminError':
//     case 'NoUserFoundError':
//       ctx.status = 422
//       ctx.body = {error: err.message}
//       break
//     default:
//       ctx.status = 500
//       ctx.body = {error: 'There was an error generating a jwt token'}
//     }
//   }
//   await next()
// }

export async function signinAdmin(ctx, next) {
  return passport.authenticate('local', {session: false}, async (theUser, error, reason) => {
    try {

      if(reason) {
        switch(reason) {
        case reasons.NOT_FOUND:
        case reasons.PASSWORD_INCORRECT:
          throw new NoUserFoundError
        case reasons.MAX_ATTEMPTS:
          throw MaxLoginAttemptsError
        default:
          throw new NoUserFoundError
        }
      }
      if(error) {
        throw new Error('Error processing')
      }
      ctx.status = 200
      let {user, token} = await tokenForUser(ctx.request.body.email)

      if(!user)
        throw new UserNotAdminError

      user.last_ip = ctx.headers['x-real-ip'] ? ctx.headers['x-real-ip'] : '?????'
      user.last_login_at = Date.now()
      ctx.body = { token }
      await user.save()
    } catch(err) {
      ctx.status = 401
      switch(err.name) {
      case 'NoUserFoundError':
        ctx.body = {error: 'Bad User Login'}
        break
      case 'MaxLoginAttemptsError':
        ctx.body = {error: 'Your account is temporarily locked.'}
        break
      default:
        ctx.body = {error: 'Bad User Login'}
      }
      await next
    }
  })(ctx,next)
}

async function _verifyCaptcha(captchaResponse) {
  return new Promise(async (resolve, reject) => {
    log.info('secret: ', process.env.RECAPTCHA_SECRET)
    axios.get('https://www.google.com/recaptcha/api/siteverify?secret=' +
    process.env.RECAPTCHA_SECRET + '&response=' + captchaResponse)
    .then(response => {
      if(!response.data)
        reject(new CaptchaServerError)
      if(!response.data.success)
        reject(new InvalidCaptchaResponseError)
      resolve(true)
    }).catch(response => {
      if(!response)
        reject(new CaptchaServerError)
    })
  })
}

class UserNotAdminError {
  constructor() {
    this.name = 'UserNotAdminError'
    this.message = 'Nice try! You\'re not an admin.'
    this.stack = new Error().stack
  }
}

class NoUserFoundError {
  constructor() {
    this.name = 'NoUserFoundError'
    this.message = 'No user found.'
    this.stack = new Error().stack
  }
}

class TokenExpiredError {
  constructor() {
    this.name = 'TokenExpiredError'
    this.message = 'The token for this request expired.'
    this.stack = new Error().stack
  }
}

class PasswordsAreDifferentError {
  constructor() {
    this.name = 'PasswordsAreDifferentError'
    this.message = 'The password and confirmed password submitted were different.'
    this.stack = new Error().stack
  }
}

class CaptchaServerError {
  constructor() {
    this.name = 'CaptchaServerError'
    this.message = 'There is an error with google\'s captcha server. Please try again in a few minutes.'
    this.stack = new Error().stack
  }
}

class InvalidCaptchaResponseError {
  constructor() {
    this.name = 'InvalidCaptchaResponseError'
    this.message = 'You submitted an invalid captcha. Please refresh the page and try again.'
    this.stack = new Error().stack
  }
}

class MaxLoginAttemptsError {
  constructor() {
    this.name = 'MaxLoginAttemptsError'
    this.message = 'Your account is temporarily locked. Please try again in 30 minutes.'
    this.stack = new Error().stack
  }
}

MaxLoginAttemptsError.prototype = Object.create(Error.prototype)
InvalidCaptchaResponseError.prototype = Object.create(Error.prototype)
CaptchaServerError.prototype = Object.create(Error.prototype)
PasswordsAreDifferentError.prototype = Object.create(Error.prototype)
TokenExpiredError.prototype = Object.create(Error.prototype)
NoUserFoundError.prototype = Object.create(Error.prototype)
UserNotAdminError.prototype = Object.create(Error.prototype)