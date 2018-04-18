import mongoose from 'mongoose'
const Promise = require('bluebird')
Promise.promisifyAll(mongoose)
const Schema = mongoose.Schema

const orderSchema = new Schema({
  order_id: String,
  user_id: {type: Schema.Types.ObjectId, ref: 'User'},
  payment_id: String,
  state: { type: String, lowercase: true },
  amount: Number,
  description: String,
  promo_id: {type: Schema.Types.ObjectId, ref: 'Promo'},
  created_time: Date,
  purchases: [{type: Schema.Types.ObjectId, ref: 'SoldDomain'}]
})

const ModelClass = mongoose.model('Order', orderSchema)

export default ModelClass