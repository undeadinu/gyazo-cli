#!/usr/bin/env node

var exec = require('child_process').exec
  , path = require('path')
  , fs = require('fs')
  , tmp = require('tmp')
  , resizeIfRetina = require('./lib/resize')
  , upload = require('./lib/upload')
  , parallel = require('run-parallel')
  , series = require('run-series')
  , optimist = require('optimist')
  , url = require('url')
  , request = require('request')

var argv = optimist
    .usage('Usage: $0')
    .describe('help', 'Print this')
    .describe('times', 'Screenshot N times and upload them all')
    .describe('quiet', 'Don\'t open an image in browser (Copy url only)')
    .describe('output', 'Write screenshot to an output file (also upload)')
    .alias('h', 'help')
    .alias('t', 'times')
    .alias('q', 'quiet')
    .alias('o', 'output')
    .argv

if (argv.help) {
  console.log(optimist.help())
  process.exit(0)
}

function uploadFile(filePath, callback) {
  fs.exists(filePath, function (exists) {
    if (!exists) {
      console.error('File does not exist:', filePath)
      process.exit(1)
    }

    upload(filePath, callback)
  })
}

function pbcopy(text, callback) {
  callback = callback || function () {}
  exec(['echo', '"' + text + '"' , '| pbcopy'].join(' '), callback)
}

function openURL(url) {
  if (argv.quiet) return

  exec('open ' + url)
}

function openURLs(urls) {
  if (argv.quiet) return

  exec('open ' + urls.join(' '))
}

function isURL(str) {
  return !!url.parse(str).host
}

function fetchURL(url, callback) {
  tmp.file(function (err, tmpPath) {
    var ws = fs.createWriteStream(tmpPath)
    request(url).pipe(ws)
    ws.on('finish', function () {
      callback(tmpPath)
    })
  })
}

var inputs = argv._
if (inputs.length) {
  parallel(
    inputs.map(function (input) {
      return function (callback) {
        if (isURL(input)) {
          fetchURL(input, function (imagePath) {
            uploadFile(imagePath, callback)
          })

          return
        }

        uploadFile(path.resolve(process.cwd(), input), callback)
      }
    })
  , function (err, urls) {
    if (err) throw err

    pbcopy(urls.join('\\n'))
    openURLs(urls)
    process.exit(0)
  })

  return
}

if (argv.times) {
  var times = argv.times
  var tasks = []
  for (var i = 0; i < times; i++) {
    tasks.push(function (callback) {
      tmp.file(function (err, tmpPath) {
        exec('screencapture -i ' + tmpPath, function () {
          callback(null, tmpPath)
        })
      })
    })
  }

  series(tasks, function (err, paths) {
    if (err) throw err

    var uploadTasks = paths.map(function (path) {
      return function (callback) {
        resizeIfRetina(path, function () {
          upload(path, callback)
        })
      }
    })

    parallel(uploadTasks, function (err, urls) {
      if (err) throw err

      pbcopy(urls.join('\\n'))
      openURLs(urls)
      process.exit(0)
    })
  })

  return
}

tmp.file(function (err, imagePath) {
  if (err) throw err

  if (argv.output) {
    imagePath = path.resolve(process.cwd(), argv.output)
  }

  exec('screencapture -i ' + imagePath, function (err) {
    if (err) throw err

    resizeIfRetina(imagePath, function () {
      upload(imagePath, function (err, url) {
        pbcopy(url)
        openURL(url)
        process.exit(0)
      })
    })
  })
})
