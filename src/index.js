const { PORT = 3000, AWS_BUCKET } = process.env
const { readFile, remove } = require('fs-extra')
const { parse, join, extname, resolve } = require('path')
const { createQuery, addGifs } = require('tomify')
const sizeOf = require('image-size')
const express = require('express')
const multer = require('multer')

const region = 'us-east-1'
const S3 = require('aws-sdk/clients/s3')
const s3 = new S3({ region, apiVersion: '2006-03-01' })
const Rekongition = require('aws-sdk/clients/rekognition')
const rekongition = new Rekongition({ region, apiVersion: '2016-06-27' })

const app = express()
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, '/tmp')
    },
    filename: (req, file, cb) => {
      const ext = extname(file.originalname)
      const time = Math.floor(Date.now() / 1000)
      const filename = time + ext
      cb(null, filename)
    }
  }),
  limits: { fileSize: 5000000 } // 5 MB
}).single('file')

app.post('/upload', (req, res) => {
  upload(req, res, err => {
    if (err) {
      if (err.message === 'File too large')
        res.status(400).send('File is greater than 5Mb')
      else res.status(400).send(err.message)
      return
    }

    // Everything went fine
    if (!req.file) {
      console.error(400, 'No File Uploaded')
      res.status(400).send('No file Uploaded')
      return
    }

    const resize = req.query.resize || 1
    const dimensions = sizeOf(req.file.path)
    const meta = parse(req.file.path)
    const filename = `${meta.name}.gif`
    const gifDest = join(req.file.destination, filename)
    read(req.file.path)
      .then(detectFaces)
      .then(data => createPositions(data, resize, dimensions))
      .then(positions =>
        replaceFaces({ dest: gifDest, file: req.file.path, positions })
      )
      .then(() => read(gifDest))
      .then(stream => s3Upload(stream, filename))
      .then(({ Location }) => res.status(200).send({ url: Location }))
      .then(() => rm(gifDest))
      .then(() => rm(req.file.path))
      .catch(err => {
        console.error(err)
        res.status(500).send(JSON.stringify(err, null, '  '))
      })
  })
})

console.log('Listening on:', PORT)
app.listen(PORT)

function createPositions(data, resize, dimensions) {
  const positions = []
  data.FaceDetails.map(({ BoundingBox: { Height, Width, Top, Left } }) => {
    Left = Left * dimensions.width
    Top = Top * dimensions.height
    Height = Height * dimensions.height
    Width = Width * dimensions.width
    const centerX = Left + Width / 2
    const gifWidth = resize * (Width * 1.75)
    let x = parseInt(centerX - gifWidth / 2)

    // y
    const centerY = Top + Height / 2
    const gifHeight = resize * (Height * 1.75)
    let y = parseInt(centerY - gifHeight / 2)

    x = x >= 0 ? `+${x}` : x
    y = y >= 0 ? `+${y}` : y

    let position = createQuery({
      x: x,
      y: y,
      height: parseInt(gifHeight),
      width: parseInt(gifWidth),
      gif: join(__dirname, 'tom-wiggle.gif')
    })

    positions.push(position)
  })

  return positions
}

function replaceFaces({ dest, file, positions }) {
  return new Promise((resolve, reject) => {
    addGifs({ dest, file, positions }).then(resolve).catch(reject)
  })
}

function detectFaces(buffer) {
  return new Promise((resolve, reject) => {
    const params = {
      Image: { Bytes: buffer }
    }

    rekongition.detectFaces(params, (err, data) => {
      if (err) reject(err)
      resolve(data)
    })
  })
}

function s3Upload(stream, filename) {
  return new Promise((resolve, reject) => {
    const params = {
      Bucket: AWS_BUCKET,
      Key: filename,
      Body: stream,
      ACL: 'public-read',
      ContentType: 'image/gif'
    }
    s3.upload(params, (err, data) => {
      if (err) reject(err)
      resolve(data)
    })
  })
}

function read(file) {
  return new Promise((resolve, reject) => {
    readFile(file, 'base64', (err, data) => {
      if (err) reject(err)
      resolve(new Buffer(data, 'base64'))
    })
  })
}

function rm(file) {
  return new Promise((resolve, reject) => {
    remove(file, err => {
      if (err) reject(err)
      resolve()
    })
  })
}
