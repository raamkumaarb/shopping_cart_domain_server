import mongoose from 'mongoose'
const Promise = require('bluebird')

Promise.promisifyAll(mongoose)
const Schema = mongoose.Schema

const domainSchema = new Schema({
  url: { type: String, lowercase: true, unique: true },
  username: String,
  password: String,
  email: String,
  pa: Number,
  tf: Number,
  cf: Number,
  ur: Number,
  majestic_ref_domains: Number,
  ahrefs_ref_domains: Number,
  category: String,
  sub_category: String,
  price: Number,
  status: String,
  order_id: {type: String, ref: 'Order'},
  order_time: Date,
  domain_type:String,
  last_date_whoischeck:Date,
  da:Number,
  transfer_time:Date,
  name_registrar:{ type: String, default: 'godaddy.com' },
  buyer_name:String,
  domain_state: String,
  domain_username: String
},
{
  timestamps: true
})

const ModelClass = mongoose.model('Domain', domainSchema)

export default ModelClass