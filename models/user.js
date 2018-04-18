import mongoose from 'mongoose'
import bcrypt from 'bcrypt-nodejs'
import log from '../services/log'
const Schema = mongoose.Schema

const MAX_LOGIN_ATTEMPTS = 5
const LOCK_TIME = .03 * 60 * 60 * 1000 //3 minutes

const userSchema = new Schema({
  email: { type: String, unique: true, lowercase: true },
  password: String,
  firstname: String,
  bhwname: {type: String, lowercase: true},
  domains: [{type: Schema.Types.ObjectId, ref: 'Domain'}],
  type: {type: String, default: 'user'},
  promos: [{type: Schema.Types.ObjectId, ref: 'Promo'}],
  verified: Boolean,
  signup_ip: String,
  loginAttempts: { type: Number, required: true, default: 0 },
  lockUntil: { type: Number },
  last_ip: String,
  created_at: { type: Date, default: Date.now },
  last_login_at: { type: Date },
  last_password_reset_at: Date,
  credit: { type: Number, default: 0 }
})

userSchema.pre('save', function(next) {
  if (!this.isModified('password')) {
    return next()
  }
  // generate a salt
  bcrypt.genSalt(10, (err, salt) => {
    if(err) return next(err)
    // hash password using salt
    bcrypt.hash(this.password, salt, null, (err,hash) => {
      if (err) return next(err)

      this.password = hash
      next()
    })
  })
})

userSchema.virtual('isLocked').get(function() {
  // check for a future lockUntil timestamp
  return !!(this.lockUntil && this.lockUntil > Date.now())
})

userSchema.methods.comparePassword = function(candidatePassword, callback) {
  bcrypt.compare(candidatePassword, this.password, (err, isMatch) => {
    if(err) return callback(err)
    callback(null, isMatch)
  })
}

userSchema.methods.incLoginAttempts = function(cb) {
  // if we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.update({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    }, cb)
  }
  // otherwise we're incrementing
  var updates = { $inc: { loginAttempts: 1 } }
  // lock the account if we've reached max attempts and it's not locked already
  if (this.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + LOCK_TIME }
  }
  return this.update(updates, cb)
}

const ModelClass = mongoose.model('User', userSchema)

export default ModelClass