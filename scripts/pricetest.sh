#!/usr/bin/env babel-node
import inquirer from 'inquirer'
import fs from 'fs'

const OUTPUT_FILE = '../data/output/price_test.txt'
function run() {
  let ws = fs.createWriteStream(OUTPUT_FILE)
  for(let m=.01; m<100; m+=.01) {
    let multiplier = m
    let mStr = `Multiplier: ${multiplier}\n============================\n`
    for(let d=.01; d<=1; d+=.01) {
      let dStr = `Divisor: ${d}\n---------------------------\n`
      let tfStr = ''
      for(let i=1; i<=30; i++) {
        let factor = parseFloat((tf/d * (multiplier)).toFixed(4))
        let tf = i
        let price = Math.round(tf +  (tf*factor))
        tfStr += `TF: ${tf} || Price: ${price}\n`
        // if(i===5 && (price > 3))
        //   break
        // if(i===10 && (price > 10 || price < 4))
        //   break
        if(i===20 && (price < 40 && price > 20)) {
          let str = mStr + dStr + tfStr
          ws.write(str)
        }
      }
    }
  }
  ws.close()
}
run()