import env from 'dotenv'
env.config()

import passport from 'koa-passport'
import User from '../models/user'
import { Strategy as JwtStrategy , ExtractJwt } from 'passport-jwt'
import LocalStrategy from 'passport-local'
import log from './log'

const localOptions = { usernameField: 'email'}
const reasons = {
  NOT_FOUND: 1,
  UNVERIFIED: 2,
  MAX_ATTEMPTS: 3,
  PASSWORD_INCORRECT: 4
}

const localLogin = new LocalStrategy(localOptions, async (email, password, done) => {
  User.findOne({$and: [
          { $or: [{email: email}, {bhwname: email}] }          
      ]}, (err,user) => {
    if(err) {
      log.info('user not found')
      return done(err)
    }
    if(!user) {
      log.info('user not found, returning (null, false)')
      return done(null, false, reasons.NOT_FOUND)
    }
    if(!user.verified) return done(null, false, reasons.UNVERIFIED)
    if (user.isLocked) {
      // just increment login attempts if account is already locked
      return user.incLoginAttempts(function(err) {
          if (err) return done(err)
          return done(null, null, reasons.MAX_ATTEMPTS)
      })
    }
    user.comparePassword(password, (err, isMatch) => {
      if(err) return done(err)
        if (isMatch) {
          // if there's no lock or failed attempts, just return the user
          if (!user.loginAttempts && !user.lockUntil) return done(null, user)
          // reset attempts and lock info
          var updates = {
            $set: { loginAttempts: 0 },
            $unset: { lockUntil: 1 }
          }
          log.info('LocalStrategy: 43')
          return user.update(updates, function(err) {
            if (err) return done(err)
            return done(null, user)
          })
        }
      // password is incorrect, so increment login attempts before responding
      user.incLoginAttempts(function(err) {
          if (err) return done(err)
          return done(null, null, reasons.PASSWORD_INCORRECT)
      })
    })
  })
})

const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromHeader('authorization'),
  secretOrKey: process.env.JWT_SECRET
}

const jwtLogin = new JwtStrategy(jwtOptions, (payload, done) => {
  return new Promise((resolve, reject) => {
    User.findById(payload.sub, (err, user) => {
      if(err) return done(err, false)

      if(user) {
        done(null, user)
        resolve(user)
      } else {
        done(null, false)
        reject()
      }
    })
  })
})

passport.use(jwtLogin)
passport.use(localLogin)