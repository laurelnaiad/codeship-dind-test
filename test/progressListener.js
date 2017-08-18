const JSONStream = require('JSONStream')

module.exports.progressFollower = (step, msg) => {
  console.log(step || '', msg && msg.replace(/\n*$/, '') || '')
}

module.exports.progressToLogLines = (
  stream,
  onLogLine
) => {
  let id
  const myListeners = []
  const parser = JSONStream.parse()
  function removeMyListeners() {
    myListeners.forEach(l => parser.removeListener(l.evt, l.listener))
  }
  return new Promise((res, rej) => {
    const rootListener = (evt) => {
      if (!(evt instanceof Object)) {
        return
      }
      if (evt.error) {
        removeMyListeners()
        if (evt.error instanceof Error) {
          rej(evt.error)
        }
        else {
          rej(new Error(evt.error))
        }
      }
      else {
        const msg = evt.stream
        const aux = evt.aux
        if (msg) {
          console.log(msg)
          msg.trim().split('\n').forEach((line) => {
            line = line.trim()
            const matchesSha = line.match(/^sha\:(.*)/)
            if (matchesSha) {
              id = matchesSha[1]
            }
          })
          onLogLine(msg)
        }
        else {
          if (evt.aux && evt.aux.ID) {
            id = evt.aux.ID
          }
        }
      }
    }
    const errorListener = (err) => {
      removeMyListeners()
      if (err instanceof Error) {
        rej(err)
      }
      else {
        rej(new Error(err))
      }
    }
    const endListener = (thing1, otherthing) => {
      removeMyListeners()
      if (!id) {
        res()
      }
      else {
        res(id)
      }
    }

    myListeners.push({ evt: 'root', listener: rootListener })
    myListeners.push({ evt: 'error', listener: errorListener })
    myListeners.push({ evt: 'end', listener: endListener })
    parser.on('root', rootListener)
    parser.on('error', errorListener)
    parser.on('end', endListener)
    stream.pipe(parser)
  })
}

