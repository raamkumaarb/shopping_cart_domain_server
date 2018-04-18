import 'babel-polyfill'
import should from 'should'
import supertest from 'supertest';
import app from '../../index';
import axios from 'axios'
import User from '../../models/user'
import log from '../../services/log'
import Promo from '../../models/promo'
import Domain from '../../models/domain'
import passwordResetToken from '../../models/passwordResetToken'
import VerificationToken from '../../models/VerificationToken'

// disable logging for clean test result reports
log.remove('console');
process.env.NODE_ENV = 'test';


var superagent = require('supertest').agent(app.listen());
var validToken = ''; // used to populate the valid login token & that will be used in subsequent test cases
var downloadFileName = ''; // used to populate the filename while using /user/export & that will be used in /download
var dummyUserID = '';
var dummyDomainID = '';
var dummyPromoID = '';
var MockAdapter = require('axios-mock-adapter');
var mock = new MockAdapter(axios);
var response = { data : {logged : true }, success : [true] };
mock.onGet('https://www.google.com/recaptcha/api/siteverify?secret=' + process.env.RECAPTCHA_SECRET + '&response=true').reply(200, response);

var dummyUserForSignup = { email : 'testing@mailid.com', password : 'aaaaaaa1', bhwname : 'bbbbc', captcha : 'true' };
var dummyPromoCode = {code: "thisistestcasepromo",  discount: 10,  note:"this is for testing propose"}
var dummyUserFortesting = {email: "thisistestinguser@nosuchdomain.com", password:"a12345678", bhwname:"nosuchusername", captcha : 'true', verified: 'true'}

var dummyDomains={url : "www.google.com",status : "available", pa : 31, tf : 2, cf : 2, ur : 15, majestic_ref_domains : 7765, ahrefs_ref_domains : 0, category : "Test", sub_category : "Sub Testing Test", price : 3}

var dummyTumblrDomains={url : "www.dummytumblr.com",status : "available", pa : 22, tf : 2, cf : 2, ur : 15, majestic_ref_domains : 7765, ahrefs_ref_domains : 0, category : "Tumblr Test", sub_category : "Sub Testing Test", price : 3, domain_type:"tumblr"}

var dummyPbnDomains={url : "www.dummypbn.com",status : "available", pa : 33, tf : 3, cf : 3, ur : 55, majestic_ref_domains : 7765, ahrefs_ref_domains : 0, category : "Pbn Test", sub_category : "Sub Testing Test", price : 3, domain_type:"pbn"}

before(function(){
  let domain = new Domain(dummyDomains)
  domain.save()
  let tumblrdomain = new Domain(dummyTumblrDomains)
  tumblrdomain.save()
  let pbndomain = new Domain(dummyPbnDomains)
  pbndomain.save()
  dummyDomainID = domain._id;
  let promo = new Promo(dummyPromoCode)
  promo.save()
  dummyPromoID = promo._id;
  dummyUserFortesting.promos = [promo._id]
  dummyUserFortesting.domains = [domain._id]
  let user = new User(dummyUserFortesting);
  user.save()
  dummyUserID = user._id;
})

after(function(){    
  Promo.findOne({ code: dummyPromoCode.code }).remove().exec();
  User.findOne({ email: dummyUserFortesting.email }).remove().exec();   
  User.findOne({ email: dummyUserForSignup.email }).remove().exec();   
  Domain.findOne({ sub_category: dummyTumblrDomains.sub_category }).remove().exec();
})


describe('All API Routes', function() {

describe('GET /', function() {
  it('should return 404', function(done) {
    superagent
      .get('/')
      .expect(404, done);
  });
});


describe('Post /signup', function() {

  it('should return 200 & create a new DB entry', function(done) {
    superagent.post('/signup').send( dummyUserForSignup ).end(function(err, res){
      should.not.exist(err);
      should.exist(res);
      // should return 200 OK status as response
      res.status.should.be.exactly(200);

      res.body.should.be.an.instanceof(Object).and.have.property('message')
      res.body.message.should.endWith('Welcome! Please verify your email address before logging in.')

      done()
    });
  });

  it('should return 422 & alert You must provide email and password', function(done) {
    superagent.post('/signup').send({ email:'',password:'',bhwname:'c',captcha:'true'}).end(function(err, res){
      should.not.exist(err);
      should.exist(res);
      // should return 422 status as response
      res.status.should.be.exactly(422);
      res.body.should.be.an.instanceof(Object).and.have.property('error');
      res.body.error.should.endWith('You must provide email and password');
      done()
    });
  });

  it('should return InvalidCaptchaResponseError & You submitted an invalid captcha', function(done) {
    var response = { data : [] };
    mock.onGet('https://www.google.com/recaptcha/api/siteverify?secret=' + process.env.RECAPTCHA_SECRET + '&response=invalidCaptcha').reply(200, response);

    superagent.post('/signup').send({ email:'e@e.com',password:'e12345678',bhwname:'e',captcha:'invalidCaptcha'}).end(function(err, res){
      should.not.exist(err);
      should.exist(res);
      // should return 422 OK status as response
      res.status.should.be.exactly(422);
      res.body.should.be.an.instanceof(Object).and.have.property('error');
      res.body.error.should.endWith('You submitted an invalid captcha. Please refresh the page and try again.');

      done()
    });
  });

  it('should return CaptchaServerError & error with google\'s captcha server', function(done) {
    var response = '';
    mock.onGet('https://www.google.com/recaptcha/api/siteverify?secret=' + process.env.RECAPTCHA_SECRET + '&response=CaptchaServerError').reply(200, response);

    superagent.post('/signup').send({ email:'e@e.com',password:'e12345678',bhwname:'e',captcha:'CaptchaServerError'}).end(function(err, res){
      should.not.exist(err);
      should.exist(res);
      // should return 422 status as response
      res.status.should.be.exactly(422);
      res.body.should.be.an.instanceof(Object).and.have.property('error');
      res.body.error.should.endWith('There is an error with google\'s captcha server. Please try again in a few minutes.');

      done()
    });
  });

  it('should return 422 & BHW username is in use', function(done) {

    superagent.post('/signup').send({ email:'asdsad@asdsad.com',password:'c12345678',bhwname:dummyUserForSignup.bhwname,captcha:'true'}).end(function(err, res){
      should.not.exist(err);
      should.exist(res);
      // should return 422 status as response
      res.status.should.be.exactly(422);
      res.body.should.be.an.instanceof(Object).and.have.property('error');
      res.body.error.should.endWith('BHW username is in use');
      done()
    });
  });

  it('should return 422 & Email is in use', function(done) {

    superagent.post('/signup').send({ email:dummyUserForSignup.email,password:'a12345678',bhwname:'a',captcha:'true'}).end(function(err, res){
      should.not.exist(err);
      should.exist(res);
      // should return 422 status as response
      res.status.should.be.exactly(422);
      res.body.should.be.an.instanceof(Object).and.have.property('error');
      res.body.error.should.endWith('Email is in use');
      done()
    });
  });

  it('should verify signup token', function (done) {
      var signupID = User.findOne({email:dummyUserForSignup.email}, (err,result) => {
      var verifyToken = VerificationToken.findOne({_userId:result._id}, (err,result) => {

      superagent.get('/verify/'+result.token).set('Content-Type', 'application/json').send().end(function(err, res){
        should.not.exist(err);
        should.exist(res);
        res.status.should.be.exactly(200);
        res.body.should.be.an.instanceof(Object).and.have.property('message')
        res.body.message.should.endWith('Hooray! Your account is now activated. You can now login.')

        done()
      });
    });

    });

  });

});


describe('Post /signin', function (done) {

  it('post correct credentials', function (done) {

    superagent.post('/signin').set('Content-Type', 'application/json').send(dummyUserFortesting).end(function(err, res){
      should.not.exist(err);
      should.exist(res);
      // should return 200 OK status as response
      res.status.should.be.exactly(200);
      // Response should be a JSON object & will have token property
      res.body.should.be.an.instanceof(Object).and.have.property('token');
      res.body.token.should.have.lengthOf(153);
      validToken = res.body.token;
      done()
    });

  })

  it('post wrong credentials', function (done) {
    superagent.post('/signin').set('Content-Type', 'application/json').send({ email:'a@a.com',password:'a'}).end(function(err, res){
      should.exist(res);
      // should return 401 Unauthorized status as response
      res.status.should.be.exactly(401);
      // Response should be a JSON object & will have error property
      res.body.should.be.an.instanceof(Object).and.have.property('error');
      res.body.error.should.endWith('Bad User Login');
      done()
    });

  })

  it('post no credentials', function (done) {

    superagent.post('/signin').set('Content-Type', 'application/json').send({}).end(function(err, res){
      should.exist(res);
      // should return 401 Unauthorized status as response
      res.status.should.be.exactly(401);
      // Response should be a JSON object & will have error property
      res.body.should.be.an.instanceof(Object).and.have.property('error');
      res.body.error.should.endWith('Bad User Login');
      done()
    });

  })

  describe('Get /user', function (done) {
     it('call with proper Authorization token', function (done) {
      superagent.get('/user').set('Content-Type', 'application/json').set('Authorization', validToken).end(function(err, res){
        should.not.exist(err);
        should.exist(res);
        res.body.email.should.be.exactly(dummyUserFortesting.email)
        res.body.bhwname.should.be.exactly(dummyUserFortesting.bhwname)
        done()
      })

     })

     it('call with wrong Authorization token', function (done) {
      superagent.get('/user').set('Content-Type', 'application/json').set('Authorization', 'abcd').end(function(err, res){
        should.exist(res);
        // should return 401 Unauthorized status as response
        res.status.should.be.exactly(401);
        res.text.should.endWith('Unauthorized');
        done()
      })
     })
  })

  describe('Get /user/items', function (done) {
    
    it('get purchased tumblr domains', function (done) {
      superagent.get('/user/items/tumblr').set('Content-Type', 'application/json').set('Authorization', validToken).end(function(err, res){
        should.not.exist(err);
        should.exist(res);
        res.body.should.be.an.instanceof(Object).and.have.property('items')
        res.status.should.be.exactly(200);
        done()
      })
    })

    it('get purchased pbn domains', function (done) {
      superagent.get('/user/items/pbn').set('Content-Type', 'application/json').set('Authorization', validToken).end(function(err, res){
        should.not.exist(err);
        should.exist(res);
        res.body.should.be.an.instanceof(Object).and.have.property('items')
        res.status.should.be.exactly(200);
        done()
      })
    })
  })

  describe('Get /user/orders', function (done) {
    it('call getUserOrders', function (done) {
      superagent.get('/user/orders').set('Content-Type', 'application/json').set('Authorization', validToken).end(function(err, res){
        should.not.exist(err);
        should.exist(res);
        res.body.should.be.an.instanceof(Object).and.have.property('orders')
        res.status.should.be.exactly(200);
        done()
      })
    })
  })

  describe('Get /user/export', function (done) {
    it('call exportDomains', function (done) {
      superagent.get('/user/export').set('Content-Type', 'application/json').set('Authorization', validToken).end(function(err, res){
        should.not.exist(err);
        should.exist(res);
        downloadFileName = res.body.filename;
        res.body.should.be.an.instanceof(Object).and.have.property('filename')
        res.status.should.be.exactly(200);
        done()
      })
    })
  })

  describe('Get /download', function (done) {
  it('call download', function (done) {
      superagent.get('/download?filename='+downloadFileName).set('Content-Type', 'application/json').set('Authorization', validToken).end(function(err, res){
        should.not.exist(err);
        should.exist(res);
        res.status.should.be.exactly(200);
        done()
      })
     })
  })

 describe('Get /fetchDomain', function (done) {
    it('fetch Tumblr Domain data', function (done) {
      superagent.get('/fetchDomain/tumblr').set('Content-Type', 'application/json').set('Authorization', validToken).end(function(err, res){
        should.not.exist(err);
        should.exist(res);          
        res.body.message.should.be.an.Array().and.not.empty();
        res.status.should.be.exactly(200);
        done()
      })
    })

    it('fetch Pbn Domain data', function (done) {
      superagent.get('/fetchDomain/pbn').set('Content-Type', 'application/json').set('Authorization', validToken).end(function(err, res){
        should.not.exist(err);
        should.exist(res);             
        res.body.message.should.be.an.Array().and.not.empty();
        res.status.should.be.exactly(200);
        done()
      })
    })

    it('fetch Domain data should throw error while domainType is not exists', function (done) {
      superagent.get('/fetchDomain').set('Content-Type', 'application/json').set('Authorization', validToken).end(function(err, res){
        should.not.exist(err);
        should.exist(res);        
        res.body.should.be.an.instanceof(Object).and.not.have.property('message');
        res.status.should.be.exactly(404);
        done()
      })
    })

    it('fetch Domain data should return null for invalid domainType', function (done) {
      superagent.get('/fetchDomain/bbbb').set('Content-Type', 'application/json').set('Authorization', validToken).end(function(err, res){
        should.not.exist(err);
        should.exist(res);          
        res.body.message.should.be.an.Array().and.empty();
        res.status.should.be.exactly(200);
        done()
      })
    })
  })

  describe('Post /order', function (done) {
    it('order item', function (done) {
      superagent.post('/order').set('Content-Type', 'application/json').set('Authorization', validToken).send({ cart:[dummyDomainID],promo_id:dummyPromoID}).end(function(err, res){
        should.not.exist(err);
        should.exist(res);
        res.body.should.be.an.instanceof(Object).and.have.property('order_status');
        res.status.should.be.exactly(200);
        done()
      })
    })
  })

  describe('Post /promo/use', function (done) {

    it('Use valid Promocode', function (done) {
        superagent.post('/promo/use').set('Content-Type', 'application/json').set('Authorization', validToken).send({ code:dummyPromoCode.code}).end(function(err, res){
          should.not.exist(err);
          should.exist(res);
          res.status.should.be.exactly(200);
          done()
        })
    });

    it('Use invalid Promocode', function (done) {
        superagent.post('/promo/use').set('Content-Type', 'application/json').set('Authorization', validToken).send({ code:'ccc'}).end(function(err, res){
          should.not.exist(err);
          should.exist(res);
          res.body.should.be.an.instanceof(Object).and.have.property('error');
          res.body.error.should.endWith('Invalid promo code.');
          done()
        })
    });
  })

})

describe('Post /change password', function() {
    it('change password with valid input', function (done) {
      superagent.post('/user/changepassword').set('Content-Type', 'application/json').set('Authorization', validToken).send({ currentPassword : dummyUserFortesting.password, newPassword : 'bbbbbbb1'}).end(function(err, res){
      should.not.exist(err);
      should.exist(res);

      //should return 200 OK status as response
      res.status.should.be.exactly(200);
      res.body.should.be.an.instanceof(Object).and.have.property('message');
      res.body.message.should.endWith('Password Changed Successfully.');
      done()
    });
   });       

    it('signin after change password', function (done) {
    superagent.post('/signin').set('Content-Type', 'application/json').send({email : dummyUserFortesting.email, password : 'bbbbbbb1'}).end(function(err, res){
      should.not.exist(err);
      should.exist(res);
      // should return 200 OK status as response
      res.status.should.be.exactly(200);
      // Response should be a JSON object & will have token property
      res.body.should.be.an.instanceof(Object).and.have.property('token');
      res.body.token.should.have.lengthOf(153);
      validToken = res.body.token;
      done()
    });

  })

  it('change password with invalid input', function (done) {
      superagent.post('/user/changepassword').set('Content-Type', 'application/json').set('Authorization', validToken).send({ currentPassword : 'abc', newPassword : 'bbbbbbb1'}).end(function(err, res){
      should.not.exist(err);
      should.exist(res);
      //should return 422 status as response
      res.status.should.be.exactly(422);
      res.body.should.be.an.instanceof(Object).and.have.property('error');
      res.body.error.should.endWith('Current password not valid');
      done()
    });
   });  
});

describe('Post /resetPassword/initiate', function() {
    it('reset password with valid email', function (done) {
      superagent.post('/resetpassword/initiate').set('Content-Type', 'application/json').send({ email : dummyUserFortesting.email}).end(function(err, res){
      should.not.exist(err);
      should.exist(res);

      //should return 200 OK status as response
      res.status.should.be.exactly(200);
      res.body.should.be.an.instanceof(Object).and.have.property('message');
      res.body.message.should.endWith('Submitted');
      done()
    });
   });

    it('reset password with invalid email', function (done) {
      superagent.post('/resetpassword/initiate').set('Content-Type', 'application/json').send({ email : 'a@asd.com'}).end(function(err, res){
      should.not.exist(err);
      should.exist(res);

      //should return 200 OK status as response
      res.status.should.be.exactly(200);

      // There is an issue in the API implementation, it should return different error message instead of just saying submitted.
      res.body.should.be.an.instanceof(Object).and.have.property('message');
      res.body.message.should.endWith('Submitted');
      done()
    });
   });

   it('verify token for reset password', function (done) {
      var resettoken = passwordResetToken.findOne({_userId:dummyUserID}, (err,result) => {

     superagent.post('/resetpassword/verify').set('Content-Type', 'application/json').send({ token : result.token}).end(function(err, res){
      should.not.exist(err);
      should.exist(res);
       //should return 200 OK status as response
      res.status.should.be.exactly(200);
      res.body.should.be.an.instanceof(Object).and.have.property('resetToken');

      done()
      })
    });
   });

  it('submit new password for reset password', function (done) {
      var resettoken = passwordResetToken.findOne({_userId:dummyUserID}, (err,result) => {
     superagent.post('/resetpassword/submit').set('Content-Type', 'application/json').send({ token : result.token, password:'z12345678', passwordConfirm:'z12345678'}).end(function(err, res){
      should.not.exist(err);
      should.exist(res);
       //should return 200 OK status as response
      res.status.should.be.exactly(200);

      done()
    });
    });
  });

});

})


// Helper functions

async function verifyUser(email) {
  return new Promise(async (resolve, reject) => {
    try {
      const user = await User.findOne({email: email})

      if(!user) {
        log.info('No verification token found bruh')
        reject('User not found')
      }
      user.verified = true
      await user.save()
      log.info('user verfied status: ', user.verified)
      resolve()
    } catch(error) {
      log.info('Error: ', error)
    }
  })
}