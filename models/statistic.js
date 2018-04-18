import mongoose from 'mongoose'
const Promise = require('bluebird')

Promise.promisifyAll(mongoose)
const Schema = mongoose.Schema

const statisticSchema = new Schema({
  whoisStartTime: Date,
  whoisEndTime: Date,
  whoisCurrentlyRunning: String,
  whoisLastUpdateNumber: Number,
  whoisLastRemoveNumber: Number,
  whoisLastError: String
})

const ModelClass = mongoose.model('Statistic', statisticSchema)

export default ModelClass