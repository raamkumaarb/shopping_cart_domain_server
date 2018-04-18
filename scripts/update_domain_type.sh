#!/usr/bin/env babel-node
import env from 'dotenv'
env.config()
import mongoose from 'mongoose'
mongoose.Promise = global.Promise
mongoose.connect(`${process.env.MONGODB_URI}`)

import whois from 'node-whois'
import Domain from '../models/domain'

var domains = Domain.find({})
domains.then((res)=>{ 

  domainsObject = res.forEach(domain => {
    var query = { domain_type: 'tumblr' };
     Domain.update(query, { domain_type: 'tumblr' }, false, true)
})