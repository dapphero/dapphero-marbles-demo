#!/usr/bin/env node

const FabricClient = require('fabric-client')
const os = require('os')
const fs = require('fs')
const glob = require('glob')
const path = require('path')
const program = require('commander')

function populate(connectionProfileCfg, cryptoCfg, keyValueStorePath) {
  // Let's prepopulate the K/V store
  const creds = JSON.parse(fs.readFileSync(connectionProfileCfg, 'utf8'))

  let promises = Object.keys(creds.organizations).map(org => {
    let p = new Promise((resolve, reject) => {
      glob(`${cryptoCfg}/peerOrganizations/${org}.example.com/users/Admin@${org}.example.com/msp/keystore/*_sk`, null, (err, privkeys) => {
        if (err || privkeys.length < 1) {
          console.error(`Unable to find private key: ${err}`)
          reject(err)
        }

        let userOpts = {
          username: `Admin@${org}.example.com`,
          mspid: `${org}MSP`,
          _org: org,
          cryptoContent: {
            signedCert: `${cryptoCfg}/peerOrganizations/${org}.example.com/users/Admin@${org}.example.com/msp/signcerts/Admin@${org}.example.com-cert.pem`,
            privateKey: privkeys[0]
          },
          skipPersistence: false
        }

        resolve(userOpts)
      })
    })
    return p
  })


  Promise.all(promises).then(adminOpts => {
    let cbs = adminOpts.map((userOpts) => {
      let fc = FabricClient.loadFromConfig(connectionProfileCfg)
      let kvs_path = path.join(os.homedir(), '.hfc-key-store/')
      if (keyValueStorePath) {
        kvs_path = keyValueStorePath
      }
      creds.client = { credentialStore: { path: kvs_path } }
      return FabricClient.newDefaultKeyValueStore({
        path: kvs_path
      }).then(function (store) {
        fc.setStateStore(store);
        console.log(`Prepopulating key/value store for ${userOpts.username} located at '${store._dir}'.`)
        let obj = {}
        return fc.getUserContext(userOpts.username, true).then(user => {
          if (user !== null) {
            return user
          } else {
            return fc.createUser(userOpts)
          }
        }).then(user => {
          obj.username = userOpts.username
          return fc.getPeersForOrg(userOpts._org)
        }).then(peers => {
          obj.peers = JSON.stringify(peers)
          return fc.queryChannels(peers[0], true)
        }).then(channels => {
          obj.channels = JSON.stringify(channels)
          return obj
        })
      })
    })
    return Promise.all(cbs)
  }).then(objs => {
    console.log(objs)
    console.log("All set. Key value store populated.")
  }).catch(err => {
    console.error(err)
    console.error("Someting went wrong")
  })
}

program
  .version('0.0.1', '-v, --version')
  .arguments('<connectionProfileCfg> <cryptoCfg> <keyValueStorePath>')
  .action(populate)
program.parse(process.argv)

if (process.argv.slice(2).length < 3) {
  program.outputHelp()
}
