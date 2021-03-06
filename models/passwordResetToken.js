import mongoose from 'mongoose'
import uuid from 'node-uuid'
import log from '../services/log'

const Schema = mongoose.Schema
const ObjectId = Schema.ObjectId

let passwordResetToken = new Schema({
  _userId: {type: ObjectId, required: true, ref: 'User'},
  token: {type: String, required: true},
  createdAt: {type: Date, required: true, default: Date.now, expires: '4h'}
})


passwordResetToken.methods.createVerificationToken = function () {
  return new Promise((resolve, reject) => {
    var verificationToken = this
    var token = uuid.v4()
    verificationToken.set('token', token)
    verificationToken.save(err => {
      if (err) {
        log.error('We got the error here: ', err)
        reject(err.message)
      }
      resolve(token)
    })
  })
}

const ModelClass = mongoose.model('passwordResetToken', passwordResetToken)

export default ModelClass