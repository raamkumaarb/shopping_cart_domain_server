#!/bin/bash
pm2 delete index
pm2 start --interpreter babel-node index.js