import env from 'dotenv'
env.config()
import nodemailer from 'nodemailer'
import sgTransport from 'nodemailer-sendgrid-transport'
import log from '../services/log'
// const templatesDir = path.resolve(__dirname, 'templates')
// import emailTemplates from 'email-templates'

// const EmailAddressRequiredError = new Error('email address required')


let options = {
  auth: {
    api_key: process.env.SENDGRID_API_KEY
  }
}

let transporter = nodemailer.createTransport(sgTransport(options))

function verificationTemplate(verifyUrl) {
  return {
    from: 'noreply@sesprout.com',
    subject: 'SE Sprout: Activate Your Account',
    text: `Welcome to SE Sprout. Please go to the link to activate your account: ${verifyUrl}`,
    html: `<p>Welcome to SE Sprout. Please click the link below to activate your account.</p>
      <a href="${verifyUrl}">${verifyUrl}`
  }
}

function passwordResetTemplate(resetUrl) {
  return {
    from: 'noreply@sesprout.com',
    subject: 'SE Sprout: Activate Your Account',
    text: `You have requested a password reset. Go to the following link to reset your password: ${resetUrl}. If you do not wish to reset your password, ignore this email.`,
    html: `<p>You have requested a password reset. Click the link below to reset your password. If you do not wish to reset your password, ignore this email.</p>
      <a href="${resetUrl}">${resetUrl}`
  }
}

function acceptedOrderTemplate() {
  return {
    from: 'noreply@sesprout.com',
    subject: 'SE Sprout: Order Successfully Processed!',
    text: `Your order has been successfully processed! You can view your newly purchased items in the "Purchased Items" tab.`,
    html: `<p>Your order has been successfully processed! You can view your newly purchased items in the "Purchased Items" tab.</p>`
  }
}

function processOrderTemplate() {
  return {
    to: 'admin@sesprout.com',
    subject: 'SE Sprout: Purchase Order Successful!',
    text: `Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.`,
    html: `<p>Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.</p>`
  }
}

export function sendMail(message) {
  transporter.sendMail(message, function (error, info) {
    if (error) {
      log.info('Error occurred')
      log.info(error.message)
      return
    }
    log.info('Message sent successfully!')
    log.info('Server responded with "%s"', info.response)
  })
}

export function sendVerificationEmail(message, verifyUrl) {
  return new Promise((resolve, reject) => {
    message = {...message, ...verificationTemplate(verifyUrl)}
    transporter.sendMail(message, (error, info) => {
      if (error || !info) {
        log.info('Error occurred')
        log.info(error.message)
        reject(error.message)
        return
      }
      log.info('Message sent successfully!')
      log.info('Server responded with "%s"', info.response)
      resolve(info.response)
    })
  })
}

export function sendApprovedOrderEmail(message) {
  return new Promise((resolve, reject) => {
    message = {...message, ...acceptedOrderTemplate()}
    transporter.sendMail(message, (error, info) => {
      if (error || !info) {
        log.info('Error occurred')
        log.info(error.message)
        reject(error.message)
        return
      }
      log.info('Message sent successfully!')
      log.info('Server responded with "%s"', info.response)
      resolve(info.response)
    })
  })
}

export function sendPasswordResetEmail(message, resetUrl) {
  return new Promise((resolve, reject) => {
    message = {...message, ...passwordResetTemplate(resetUrl)}

    transporter.sendMail(message, (error, info) => {
      if (error || !info) {
        log.info('Error occurred')
        log.info(error.message)
        reject(error.message)
        return
      }
      log.info('Message sent successfully!')
      log.info('Server responded with "%s"', info.response)
      resolve(info.response)
    })

    resolve(true)
  })
}

export function sendProcessOrderEmail(message) {
  return new Promise((resolve, reject) => {
    message = {...message, ...processOrderTemplate()}
    transporter.sendMail(message, (error, info) => {
      if (error || !info) {
        log.info('Error occurred')
        log.info(error.message)
        reject(error.message)
        return
      }
      log.info('Message sent successfully!')
      log.info('Server responded with "%s"', info.response)
      resolve(info.response)
    })
  })
}