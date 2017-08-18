const path = require('path')
const getPort = require('get-port')
const Docker = require('dockerode')
const fsx = require('fs-extra')
const tar = require('tar-fs')
const JSONStream = require('JSONStream')
const request = require('request')
const ip = require('ip')
const docker = new Docker()
const { expect, assert } = require('chai')

const progressFollower = (step, msg) => {
  console.log(step || '', msg && msg.replace(/\n*$/, '') || '')
}

function progressToLogLines(
  stream,
  onLogLine
) {
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
        rej(new Error('Build stream ended without an id.'))
      }
      res(id)
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


describe('basic networking', function () {
  // the system under test in real life builds images -- this before
  // is standing in for the system under test. the problem seeking
  // a solution is that when running in jet, I cannot contact the running container
  before(function () {
    this.timeout(50 * 1000)
    const tarred = tar.pack(path.resolve(__dirname, '../src'))
    return docker.buildImage(tarred, { t: 'my-image' })
    .then((stream) => progressToLogLines(stream, (line) => progressFollower(undefined, line)))
  })

  it('runs a container, can make request to it', function () {
    this.timeout(20 * 1000)
    const containerName = 'my-test'
    let port
    return getPort()
    .then((p) => port = p)
    .then(() => {
      const nw = docker.getNetwork('my-test-scratch')
      return nw.inspect()
      .then(() => {}, (err) => {
        return docker.createNetwork({
          Name: 'my-test-scratch',
          Driver: 'bridge',
          IPAM: {
            Config: [ { Subnet: '192.100.200.0/24' } ]
          },
        })
      })
    })
    .then(() => docker.createContainer({
      name: containerName,
      Image: 'my-image',
      Detach: true,
      Tty: true,
      HostConfig: {
        PortBindings: {
          ['5000/tcp']: [{ 'HostPort': '5000' }],
        }
      },
      NetworkingConfig: {
        EndpointsConfig: {
          'my-test-scratch': { IPAMConfig: {  IPv4Address: '192.100.200.2' } }
        }
      }
    }))
    .then(() => docker.getContainer(containerName))
    .then(ct => {
      return new Promise((res, rej) => {
        docker.getEvents({
          container: 'my-test',
          filters: {
            'event': [ 'health_status' ]
          }
        }, (err, stream) => {
          if (err) {
            rej(err)
          }
          else {
            stream.once('data', (evt) => {
              const status = JSON.parse(evt.toString()).status
              if (status.match(/healthy/)) {
                const address  = ip.address()
                // this works when not in the jet container
                // in jet, get Error: connect ECONNREFUSED 172.17.0.2:34083` (or whatever port it happens to be)
                request(`http://192.100.200.2:5000/file.txt`, (err, resp, body) => {
                  ct.kill()
                  .then(() => ct.remove())
                  .then(() => err ? rej(err) : res(body))
                })
              }
            })
          }
        })
        ct.start()
      })
    })
    .then(
      response => expect(response).to.match(/hello world/),
      err => assert(false, err.toString())
    )
  })
})
