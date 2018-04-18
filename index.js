import env from 'dotenv'
env.config()

import koa from 'koa'
import bodyParser from 'koa-body'
import morgan from 'koa-morgan'
import mongoose from 'mongoose'
import cors from 'kcors'
import log from './services/log'
const app = new koa()

import passport from 'koa-passport'
import convert from 'koa-convert'
import router from './router'


app.use(morgan('combined', {
  skip: function (req, res) {
    return process.env.NODE_ENV == 'test'
  }
}))

//Set up body parsing middleware
app.use(bodyParser({
    formidable:{uploadDir: './uploads'},    //This is where the files would come
    multipart: true,
    urlencoded: true
}));

app.use(convert(function *(next) {
  if (this.request.method == 'POST') {
    // => POST body
    this.body = JSON.stringify(this.request.body);
  }
  yield next;
}));

mongoose.Promise = global.Promise
mongoose.connect(`${process.env.MONGODB_URI}`)
app.use(cors())
app.use(passport.initialize())
app.use(passport.session())
app.use(router.routes())
   .use(router.allowedMethods())

app.listen(process.env.PORT)
log.info('listening on port: ', process.env.PORT)

export default app