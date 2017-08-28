const { join, parse } = require('path')
const spawn = require('projector-spawn')
const map = require('lodash.mapvalues')

/**
 * Find all Faces
 */

function replaceAll({ file, dest, resize, gif }) {
  _debug('Processing %s...', file)

  return detect(file).then(({ faces, image, file }) => {
    _debug('Found %s face(s) in %s...', faces.length, file)

    const positions = []
    map(faces, face => {
      // x
      const centerX = (face.getX() + (face.getWidth() / 2))
      const gifWidth = resize * (face.getWidth() * 1.75)
      const x = centerX - (gifWidth / 2)

      // y
      const centerY = (face.getY() + (face.getHeight() / 2))
      const gifHeight = resize * (face.getHeight() * 1.75)
      const y = centerY - (gifHeight / 2)

      positions.push({ x: parseInt(x), y: parseInt(y), height: parseInt(gifHeight), width: parseInt(gifWidth), gif })
    })

    addGifs({ dest, file, positions })
  })
}

/**
 * Add Tom to Image
 */

function addGifs({ dest, file, positions }) {
  return new Promise((resolve, reject) => {
    _debug('Tomifying %s...', file)
    const queries = positions.reduce((queries, pos) => queries.concat(pos), [])
    spawn('convert', [file, ...queries, dest], {
      cwd: process.cwd()
    })
      .then(resolve)
      .catch(reject)
  })
}

/**
 * Create Imagemagick null query
 */

function createQuery({x, y, height, width, gif}) {
  return [
    'null:',
    '\(',
    gif,
    '-resize',
    `${height}x${width}`,
    '\)',
    '-geometry',
    `${x}${y}`,
    '-layers',
    'composite'
  ]
}

/**
 * Debug
 */

function _debug(msg, ...args) {
  console.log(msg, ...args)
}

module.exports = { replaceAll, addGifs, createQuery, _debug }
