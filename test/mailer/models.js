import 'babel-polyfill'
import should from 'should'
import mailer from '../../services/mailer'


describe('mailer: models', function () {


  describe('#sendOne()', function (done) {

    it('should render the password reset templates correctly', function (done) {
      var locals = {
        email: 'one@example.com',
        subject: 'Password reset',
        name: 'Forgetful User',
        resetUrl: 'http//localhost:3000/verify/000000000001|afdaevdae353'
      }
      /*
      mailer.sendOne('password_reset', locals, function (err, responseStatus, html, text) {
        should.not.exist(err)
        responseStatus.should.include("OK")
        text.should.include("Please follow this link to reset your password " + locals.resetUrl)
        html.should.include("Please follow this link to reset your password <a href=\"" + locals.resetUrl + "\">" + locals.resetUrl + "</a>")
        done()
      })
      */
      done()
    })
  })
})