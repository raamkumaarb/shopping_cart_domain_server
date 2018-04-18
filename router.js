import * as Authentication from './controllers/authentication'
import * as UserController from './controllers/userController'
import * as StoreController from './controllers/store'
import passport from 'koa-passport'
import serve from 'koa-static'
import './services/passport'
import log from './services/log'

const router = require('koa-router')()

const requireAuth = passport.authenticate('jwt', {session: false})
const requireSignin = passport.authenticate('local', {session: false})
router.get('/', async(ctx, next) => {

  await serve('dist/index.html')
  await next
})
//auth
router.post('/signin', Authentication.signin)
router.post('/signup', Authentication.signup)
router.post('/resetpassword/initiate', Authentication.initiatePasswordReset)
router.post('/resetpassword/verify', Authentication.verifyPasswordReset)
router.post('/resetpassword/submit', Authentication.submitPasswordReset)
router.get('/verify/:token', Authentication.verifyToken)

//user page
router.get('/user', requireAuth, UserController.getUserInfo)
router.get('/user/items/:domainType', requireAuth, UserController.getUserItems)
router.get('/user/orders', requireAuth, UserController.getUserOrders)
router.get('/user/credits', requireAuth, UserController.getUserCreditHistory)
router.get('/user/export/:domainType', requireAuth, UserController.exportDomains)
router.get('/download', UserController.download)
router.post('/user/changepassword', requireAuth, UserController.changepassword)

//checkout
router.post('/promo/use', requireAuth, UserController.checkPromoCode)
router.post('/order', requireAuth, StoreController.processOrder)
router.post('/credit', requireAuth, StoreController.processCredit)
router.post('/credit/cancel', requireAuth, StoreController.cancelCredit)
router.post('/executeCredit', StoreController.executeCredit)

//store
router.get('/fetchDomain/:domainType', requireAuth, StoreController.fetchDomainData)
//admin
router.post('/admin/signinAdmin', requireSignin, Authentication.signinAdmin)
router.get('/admin/getPendingOrders', UserController.getPendingOrders)
router.post('/admin/approveOrders', requireAuth, UserController.approveOrders)
router.post('/admin/denyOrders', requireAuth, UserController.denyOrders)
router.get('/admin/getAllUsers', requireAuth, UserController.getAllUsers)
router.get('/admin/getAllPromos', requireAuth, UserController.getAllPromoCodes)
router.post('/admin/getAllDomains', requireAuth, StoreController.getAllDomains)
router.post('/admin/getServerLogs', requireAuth, UserController.getServerLogs)
router.post('/admin/assignPromoCodes', requireAuth, UserController.assignPromoCodes)
router.post('/admin/getMoreInfoUser', requireAuth, UserController.getMoreInfoUser)
router.post('/admin/addProduct', requireAuth, UserController.addProduct)
router.get('/admin/getStoreStats', requireAuth, StoreController.getStoreStats)
router.get('/admin/recentTransactions', requireAuth, StoreController.getRecentTransactions)
router.get('/admin/whoisUpdateDomains/:is_update', requireAuth, StoreController.whoisUpdateDomains)
export default router
