import mongoose from 'mongoose'
const Promise = require('bluebird')

Promise.promisifyAll(mongoose)
const Schema = mongoose.Schema

const promosSchema = new Schema({
  code: { unique: true, type: String },
  discount: Number,
  note: String
})

const ModelClass = mongoose.model('Promo', promosSchema)

export default ModelClass