const path = require('path')
const dns = require('dns')
const chalk = require('chalk')
const getPort = require('get-port')
const Docker = require('dockerode')
const fsx = require('fs-extra')
const tar = require('tar-fs')
const request = require('request')
const ip = require('ip')
const docker = new Docker()
const { expect, assert } = require('chai')
const { progressFollower, progressToLogLines } = require('./progressListener')

const svcName = 'localhost'

function getLocalDockAddress() {
  return new Promise((res) => {
    dns.resolve4('docker.for.mac.localhost', (err, addr) => {
      if (err) {
        if (process.env.CI) {
          console.log(chalk.green('in CI'))
          res(svcName)
        }
        else {
          console.log(chalk.green('not in CI'))
          res('localhost')
        }
      }
      else {
        console.log(chalk.green(
          'docker.for.mac.localhost resolves, using it ' +
          '\n(this case only seems to pop up under local jet)'
        ))
        res(addr)
      }
    })
  })
  .then((addr) => {
    console.log(chalk.magenta('using ' + addr))
    return addr
  })
}

describe('basic networking', function () {
  let dockerHostAddress // primed in `before`

  before(function () {
    this.timeout(50 * 1000)
    const tarred = tar.pack(path.resolve(__dirname, '../src'))
    return docker.buildImage(tarred, { t: 'my-image' })
    .then((stream) => progressToLogLines(stream, (line) => progressFollower(undefined, line)))
    .then(() => getLocalDockAddress())
    .then(addr => dockerHostAddress = addr)
  })

  it('runs a container, can make request to it', function () {
    this.timeout(20 * 1000)
    const oneMsInNs = 1000000
    const oneSInNs = 1000 * oneMsInNs
    // const fiveSinNs = 5 * oneSInNs
    const containerName = 'my-test'
    let port
    return getPort()
    .then((p) => port = p)
    .then(() => docker.createContainer({
      name: containerName,
      Image: 'my-image',
      Detach: true,
      Tty: true,
      Healthcheck: {
        Test: [
          'CMD-SHELL',
          `curl --silent --fail http://localhost:5000/file.txt || exit 1`
        ],
        Interval: oneSInNs,
        Timeout: oneSInNs,
        Retries: 12,
        StartPeriod: oneSInNs
      },
      HostConfig: {
        PortBindings: { '5000/tcp': [ { HostPort: port.toString() } ] }
      },
    }))
    .then(() => {
      const ct = docker.getContainer(containerName)
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
                request(`http://${dockerHostAddress}:${port.toString()}/file.txt`, (err, resp, body) => {
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
